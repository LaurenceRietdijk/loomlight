# autoload/GameManager.gd
extends Node
var current_world: World = null
var current_player: PlayerCharacter = null
const BIOME_DAL = preload("res://scripts/dal/BiomeDAL.gd")
const TERRAIN_DAL = preload("res://scripts/dal/TerrainDAL.gd")
const TILESET_DAL = preload("res://scripts/dal/TilesetDAL.gd")
const CACHE_DIR := "user://cache/locale_tiles"
const TILESET_CACHE_DIR := "user://cache/terrain_tilesets"
var tile_source_by_key: Dictionary = {}
var locale_id_by_cell: Dictionary = {} # Vector2i -> String (locale id)
var _biome_by_id: Dictionary = {}
var _terrain_by_id: Dictionary = {}
var _tileset_meta_by_id: Dictionary = {} # tilesetId -> { remote_path: String, local_path: String }
var _terrain_tileset_source_by_id: Dictionary = {} # tilesetId -> TileSet source id (on Terrain layer)

# Loading progress weights and helpers
const _STEP_INIT := 0.15
const _STEP_BIOMES := 0.15
const _STEP_TILE_CACHE := 0.50
const _STEP_TILE_LOAD := 0.15
const _STEP_PLAYER := 0.05

# Load the selected world with the chosen player character
func load_world(player: PlayerCharacter, world: World) -> void:
	current_player = player
	current_world = world
	# Ensure gameplay scene is visible before heavy loading
	await _ensure_game_scene()
	_loading_show("Preparing scene...")
	print("Starting game with world '%s' and character '%s'" % [world.name, player.name])
	# Initialize world collections (e.g., dehydrated locales) using world.id
	if current_world != null:
		_update_loading(0.02, "Initializing world data...")
		await current_world.init_collections()
		_update_loading(_STEP_INIT, "World collections ready")
		# Load global biomes into world cache
		_update_loading(_STEP_INIT + 0.01, "Fetching biomes...")
		var all_biomes: Array[Biome] = await BIOME_DAL.fetch_all()
		current_world.biomes = all_biomes
		_update_loading(_STEP_INIT + _STEP_BIOMES, "Biomes loaded")
		# Cache locale tiles for generated biomes
		await _cache_locale_tiles(_STEP_INIT + _STEP_BIOMES, _STEP_TILE_CACHE)
		# Load cached tiles into TileSet sources
		await _load_tiles_into_tileset(_STEP_INIT + _STEP_BIOMES + _STEP_TILE_CACHE, _STEP_TILE_LOAD)
	# Initialize player character active state for this world
	if current_player != null and current_world != null:
		_update_loading(0.98, "Preparing character...")
		await current_player.init_for_world(current_world)
		_update_loading(1.0, "Ready")
		_loading_finish()

# Called when the node is added to the scene tree
func _ready() -> void:
	print("GameManager loaded")

## UI helpers (keep GameManager uncluttered)
func _get_game_node() -> Node:
	var tree: SceneTree = get_tree()
	if tree == null:
		return null
	if tree.current_scene != null and tree.current_scene.name == "Game":
		return tree.current_scene
	if tree.root.has_node("Game"):
		return tree.root.get_node("Game")
	return null

func _loading_show(text: String = "Loading...") -> void:
	var game := _get_game_node()
	if game and game.has_method("show_only_loading"):
		game.call("show_only_loading", text)

func _update_loading(progress: float, text: String = "") -> void:
	var game := _get_game_node()
	if game and game.has_method("update_loading"):
		game.call("update_loading", progress, text)
	await get_tree().process_frame

func _loading_finish() -> void:
	var game := _get_game_node()
	if game and game.has_method("finish_loading_show_map"):
		game.call("finish_loading_show_map")

# Example methods
func reset_game() -> void:
	print("Game reset")

func hydrate_locale(locale_id: String) -> Locale:
	if current_world == null:
		return null
	return await current_world.ensure_locale(locale_id)

## Ensure the gameplay scene (res://scenes/game.tscn) is active and ready
func _ensure_game_scene() -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var scene: Node = tree.current_scene
	var has_game: bool = false
	if scene != null and scene.name == "Game":
		has_game = true
	elif tree.root.has_node("Game"):
		has_game = true
	if not has_game:
		tree.change_scene_to_file("res://scenes/game.tscn")
		await tree.process_frame
		await tree.process_frame

## Add each cached locale tile PNG as a TileSetAtlasSource on WorldMap's TileSet
func _load_tiles_into_tileset(progress_base: float = 0.0, progress_span: float = 0.0) -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	print("[GameManager][TileLoad] Begin loading TileSet sources from cache dir:", CACHE_DIR)
	var root: Node = tree.current_scene if tree.current_scene != null else tree.root
	if root == null:
		return
	var world_map = null
	if root.has_node("MapView/WorldMap"):
		world_map = root.get_node("MapView/WorldMap")
	elif tree.root.has_node("Game/MapView/WorldMap"):
		world_map = tree.root.get_node("Game/MapView/WorldMap")
	elif root.has_node("WorldMap"):
		world_map = root.get_node("WorldMap")
	elif tree.root.has_node("Game/WorldMap"):
		world_map = tree.root.get_node("Game/WorldMap")
	if world_map == null:
		print("[GameManager][TileLoad] WorldMap node not found; skipping tileset load")
		return
	# Expect a TileMapLayer-like node with tile_set property
	var tileset: TileSet = null
	if world_map != null and world_map.has_method("get"):
		tileset = world_map.get("tile_set") as TileSet
	else:
		# Try direct access
		tileset = world_map.tile_set
	if tileset == null:
		print("[GameManager][TileLoad] WorldMap has no TileSet")
		return

	# Reset mapping to avoid duplicates on reloads
	tile_source_by_key.clear()
	locale_id_by_cell.clear()

	# Iterate cached PNGs (with progress)
	var dir: DirAccess = DirAccess.open(CACHE_DIR)
	if dir == null:
		print("[GameManager][TileLoad] No cache dir:", CACHE_DIR)
		return
	# Walk biome subdirs
	var biome_dirs: Array = []
	dir.list_dir_begin()
	while true:
		var name: String = dir.get_next()
		if name == "":
			break
		if dir.current_is_dir() and not name.begins_with("."):
			biome_dirs.append(name)
	dir.list_dir_end()
	print("[GameManager][TileLoad] Found biome dirs:", biome_dirs)

	# Count total PNGs to report progress
	var total_png: int = 0
	for b0 in biome_dirs:
		var sub_path0: String = CACHE_DIR.rstrip("/") + "/" + b0
		var sub0: DirAccess = DirAccess.open(sub_path0)
		if sub0 == null:
			continue
		sub0.list_dir_begin()
		while true:
			var fn0: String = sub0.get_next()
			if fn0 == "":
				break
			if sub0.current_is_dir():
				continue
			if fn0.to_lower().ends_with(".png"):
				total_png += 1
		sub0.list_dir_end()

	var processed_png: int = 0
	var added_count: int = 0
	for b in biome_dirs:
		var sub_path: String = CACHE_DIR.rstrip("/") + "/" + b
		var sub: DirAccess = DirAccess.open(sub_path)
		if sub == null:
			print("[GameManager][TileLoad] Failed to open biome subdir:", sub_path)
			continue
		sub.list_dir_begin()
		while true:
			var fn: String = sub.get_next()
			if fn == "":
				break
			if sub.current_is_dir():
				continue
			if not fn.to_lower().ends_with(".png"):
				continue
			var full: String = sub_path + "/" + fn
			print("[GameManager][TileLoad] Processing PNG:", full)
			var img: Image = Image.new()
			var err: int = img.load(full)
			if err != OK:
				print("[GameManager][TileLoad] Failed image load:", full, " err=", err)
				continue
			print("[GameManager][TileLoad] Image size:", img.get_width(), "x", img.get_height())
			var tex: ImageTexture = ImageTexture.create_from_image(img)
			if tex == null:
				print("[GameManager][TileLoad] Failed to create texture for:", full)
				continue
			var src: TileSetAtlasSource = TileSetAtlasSource.new()
			src.texture = tex
			# Assume tile art is square; use full image as single region
			src.texture_region_size = Vector2i(img.get_width(), img.get_height())
			print("[GameManager][TileLoad] Created atlas source; region_size=", src.texture_region_size)
			var c0 := Vector2i(0, 0)
			if not src.has_tile(c0):
				src.create_tile(c0)
			print("[GameManager][TileLoad] Created tile at atlas coords (0,0)")
			# Use next source id so we can map key -> source id
			var dot: int = fn.rfind(".")
			var key: String = (fn.substr(0, dot) if dot != -1 else fn)
			var sid: int = tileset.get_next_source_id()
			print("[GameManager][TileLoad] Next source id:", sid, " key=", key)
			tileset.add_source(src, sid)
			tile_source_by_key[key] = sid
			added_count += 1
			print("[GameManager][TileLoad] Added tile source:", fn, " key=", key, " sid=", sid)
			processed_png += 1
			if total_png > 0 and progress_span > 0.0:
				var frac := float(processed_png) / float(total_png)
				await _update_loading(progress_base + (frac * progress_span), "Loading tile textures (" + str(processed_png) + "/" + str(total_png) + ")")
		sub.list_dir_end()
	# Ensure visuals refresh
	world_map.queue_redraw()
	# Extra diagnostics: confirm sources exist and the TileMapLayer references this TileSet
	if tileset != null:
		var scount := tileset.get_source_count()
		print("[GameManager][TileLoad] TileSet source_count=", scount)
		# List a few source ids for verification
		var to_list: int = int(min(5, scount))
		for i in range(to_list):
			var sid_i := tileset.get_source_id(i)
			var src_i := tileset.get_source(sid_i)
			var kind: String = (src_i.get_class() if src_i != null else "<null>")
			print("[GameManager][TileLoad]  - source[", i, "] id=", sid_i, " type=", kind)
		# Force reassign to ensure the node picks up runtime changes
		world_map.set("tile_set", tileset)
		print("[GameManager][TileLoad] Reassigned TileSet to WorldMap; ts_id=", tileset.get_instance_id())
	print("[GameManager][TileLoad] Completed adding tile sources. Count=", added_count)

	# Place tiles for each cached locale using their coordinates and mapped source ids
	var placed_count: int = 0
	# Placement diagnostics
	if current_world != null and current_world.locales is Dictionary:
		print("[GameManager][TilePlace] locales_count=", current_world.locales.size(), 
			" sources_keys=", tile_source_by_key.keys())
		for lid in current_world.locales.keys():
			var loc: Locale = current_world.locales[lid]
			if loc == null:
				continue
			var tkey: String = loc.tile_key()
			if tkey == "":
				print("[GameManager][TilePlace] Skipping locale=", lid, " missing tile_key (biome or type)")
				continue
			var sid2: int = 0
			if tile_source_by_key.has(tkey):
				sid2 = int(tile_source_by_key[tkey])
			# else: fall back to default source id 0
			var cx: int = int(loc.coordinates.x)
			var cy: int = int(loc.coordinates.y)
			# atlas tile created at (0,0)
			print("[GameManager][TilePlace] locale=", lid, " tkey=", tkey, " at (", cx, ",", cy, ") sid=", sid2)
			world_map.set_cell(Vector2i(cx, cy), sid2, Vector2i(0, 0), 0)
			# map cell -> locale id for click lookup
			locale_id_by_cell[Vector2i(cx, cy)] = str(lid)
			placed_count += 1
			if progress_span > 0.0 and current_world.locales.size() > 0:
				var frac2 := float(placed_count) / float(max(1, current_world.locales.size()))
				await _update_loading(progress_base + (frac2 * progress_span), "Placing tiles (" + str(placed_count) + "/" + str(current_world.locales.size()) + ")")
	if placed_count > 0:
		if world_map != null and world_map.has_method("get_used_rect"):
			var used: Rect2i = world_map.get_used_rect()
			print("[GameManager][TilePlace] Placed ", placed_count, " tiles. UsedRect:", used)
	else:
		print("[GameManager][TilePlace] No tiles placed (placed_count=0)")

	# Download and cache all generated biome locale tiles to HDD under user://
func _cache_locale_tiles(progress_base: float, progress_span: float) -> void:
	if current_world == null:
		return
	if current_world.biomes == null or not (current_world.biomes is Array) or current_world.biomes.size() == 0:
		return
	var tree: SceneTree = Engine.get_main_loop() as SceneTree
	if tree == null or not tree.root.has_node("ApiClient"):
		print("[GameManager] ApiClient not found; skipping tile cache")
		return
	var api: Node = tree.root.get_node("ApiClient")

	# Ensure base cache directory exists
	var da: DirAccess = DirAccess.open("user://")
	if da == null:
		print("[GameManager] Failed to open user:// dir")
		return

	# Compute total work
	var total_files: int = 0
	for b0 in current_world.biomes:
		if b0 == null:
			continue
		var biome0: Biome = b0
		if biome0.locales is Dictionary:
			for key0 in biome0.locales.keys():
				if bool(biome0.locales[key0]):
					total_files += 1
	var processed: int = 0

	for b in current_world.biomes:
		if b == null:
			continue
		var biome: Biome = b
		var bid: String = str(biome.id)
		if bid == "":
			continue
		var rel_base: String = "cache/locale_tiles"
		var subdir: String = "%s/%s" % [rel_base, bid]
		da.make_dir_recursive(subdir)
		var base_local: String = "%s/%s" % [CACHE_DIR, bid]
		# Iterate locales map
		if biome.locales is Dictionary:
			for key in biome.locales.keys():
				var allowed: bool = bool(biome.locales[key])
				if not allowed:
					continue
				var filename: String = "%s_%s.png" % [bid, str(key)]
				var local_path: String = "%s/%s" % [base_local, filename]
				if FileAccess.file_exists(local_path):
					processed += 1
					if total_files > 0 and progress_span > 0.0:
						await _update_loading(progress_base + (float(processed) / float(total_files)) * progress_span, "Caching tiles (" + str(processed) + "/" + str(total_files) + ")")
					continue
				var remote: String = "/images/locale/%s/%s" % [bid, filename]
				print("[GameManager][Fetch][LocaleTileImage] Downloading:", remote)
				var bytes: PackedByteArray = await api.get_bytes(remote)
				if bytes != null and bytes.size() > 0:
					var f: FileAccess = FileAccess.open(local_path, FileAccess.WRITE)
					if f:
						f.store_buffer(bytes)
						f.close()
						print("[GameManager][Fetch][LocaleTileImage] Success; cached:", local_path)
					else:
						print("[GameManager][Fetch][LocaleTileImage] Failed to write:", local_path)
				else:
					print("[GameManager][Fetch][LocaleTileImage] Failed:", remote)
				processed += 1
				if total_files > 0 and progress_span > 0.0:
					await _update_loading(progress_base + (float(processed) / float(total_files)) * progress_span, "Caching tiles (" + str(processed) + "/" + str(total_files) + ")")


## Handle a map tile selection by grid cell; resolves locale and enters it
func enter_locale_at_cell(cell: Vector2i) -> void:
	var lid: String = ""
	if locale_id_by_cell.has(cell):
		lid = str(locale_id_by_cell[cell])
	else:
		# Fallback: try to find matching coordinates in world.locales
		if current_world != null and current_world.locales is Dictionary:
			for k in current_world.locales.keys():
				var loc: Locale = current_world.locales[k]
				if int(loc.coordinates.x) == cell.x and int(loc.coordinates.y) == cell.y:
					lid = str(k)
					break
	if lid == "":
		print("[GameManager] No locale at cell:", cell)
		return
	await enter_locale(lid)

## Enter a locale by id: show loading, ensure data, then show locale screen
func enter_locale(locale_id: String) -> void:
	_loading_show("Loading locale...")
	_update_loading(0.05, "Resolving locale data...")
	# Placeholder: check if all prerequisite assets for this locale are available
	# e.g., terrain tiles, building sprites, NPC portraits, audio
	# TODO: verify local caches and versions; queue downloads if missing

	# Ensure the locale is hydrated with full data
	var loc: Locale = await hydrate_locale(locale_id)
	_update_loading(0.35, "Preparing scene resources...")

	# Ensure biome/terrain tilesets are cached for this locale
	await _ensure_locale_terrain_tilesets(loc)

	_update_loading(0.65, "Building locale scene...")
	# Notify the main game UI to switch to the locale screen
	var game := _get_game_node()
	if game and game.has_method("show_locale"):
		game.call("show_locale", loc)
	_update_loading(1.0, "Locale ready")
	# Hide loading; locale screen should now be visible
	var game2 := _get_game_node()
	if game2 and game2.has_method("hide_loading"):
		game2.call("hide_loading")
	else:
		_loading_finish() # fallback to default

## Ensure biome, terrains, and tileset images for the locale are cached locally and loaded into the Terrain layer
func _ensure_locale_terrain_tilesets(loc: Locale) -> void:
	if loc == null:
		return
	# Resolve biome id (Locale.biome is typically a String id)
	var biome_id: String = ""
	var biome_val: Variant = loc.biome
	if biome_val is Dictionary:
		var bdict: Dictionary = biome_val
		if bdict.has("_id"):
			biome_id = str(bdict.get("_id"))
	elif biome_val is String:
		biome_id = str(biome_val)
	if biome_id == "":
		return

	# Ensure biome in cache (try world first)
	var biome: Biome = null
	if _biome_by_id.has(biome_id):
		biome = _biome_by_id[biome_id]
	else:
		for biome_item in current_world.biomes:
			if biome_item != null and str(biome_item.id) == biome_id:
				biome = biome_item
				break
		if biome == null:
			biome = await BIOME_DAL.fetch_by_id(biome_id)
			if biome != null:
				_biome_by_id[biome_id] = biome
	if biome == null:
		return

	# Ensure terrain cache for all biome terrains
	var terrain_ids: Array[String] = []
	if biome.terrains is Array:
		for t in biome.terrains:
			var tid: String = str(t)
			if tid != "" and not terrain_ids.has(tid):
				terrain_ids.append(tid)

	# Fetch any missing terrains
	for tid in terrain_ids:
		if not _terrain_by_id.has(tid):
			print("[GameManager][Fetch][Terrain] Requesting terrain doc:", tid)
			var tdoc: Dictionary = await TERRAIN_DAL.fetch_by_id(tid)
			if tdoc != null and tdoc.size() > 0:
				print("[GameManager][Fetch][Terrain] Success:", tid)
			else:
				print("[GameManager][Fetch][Terrain] Failed to fetch:", tid)
			if tdoc != null and tdoc.size() > 0:
				_terrain_by_id[tid] = tdoc

	# Build unordered pairs and check neighbour mappings for implemented tilesets
	var pairs: Array = [] # [ [lowerId, upperId] ]
	for i in range(0, terrain_ids.size()):
		for j in range(i+1, terrain_ids.size()):
			var id_a: String = terrain_ids[i]
			var id_b: String = terrain_ids[j]
			var lower: String = id_a if id_a < id_b else id_b
			var upper: String = id_b if id_a < id_b else id_a
			pairs.append([lower, upper])

	# Prepare cache dir
	var da: DirAccess = DirAccess.open("user://")
	if da != null:
		da.make_dir_recursive("cache/terrain_tilesets")

	# Resolve tilesets and cache images
	for p in pairs:
		var lower_id: String = p[0]
		var upper_id: String = p[1]
		var lower_doc: Dictionary = _terrain_by_id.get(lower_id, {})
		if lower_doc.size() == 0:
			continue
		var neighbours = lower_doc.get("neighbours", {})
		var tileset_ref = neighbours.get(upper_id, null)
		var tsid: String = ""
		if tileset_ref != null:
			if typeof(tileset_ref) == TYPE_DICTIONARY and tileset_ref.has("_id"):
				tsid = str(tileset_ref._id)
			else:
				tsid = str(tileset_ref)
		if tsid == "" or tsid.length() < 24:
			continue # not implemented yet

		# If not cached locally, fetch tileset doc to find remote path, then download
		var local_path: String = "%s/%s.png" % [TILESET_CACHE_DIR, tsid]
		if not FileAccess.file_exists(local_path):
			print("[GameManager][Fetch][TilesetDoc] Requesting tileset doc:", tsid)
			var tsdoc: Dictionary = await TILESET_DAL.fetch_by_id(tsid)
			if tsdoc != null and tsdoc.size() > 0:
				print("[GameManager][Fetch][TilesetDoc] Success:", tsid)
			else:
				print("[GameManager][Fetch][TilesetDoc] Failed to fetch:", tsid)
			if tsdoc == null or tsdoc.size() == 0:
				continue
			var texture: Dictionary = tsdoc.get("texture", {})
			var image_path: String = str(texture.get("imagePath", ""))
			if image_path.begins_with("web/"):
				image_path = "/" + image_path.substr(4)
			elif not image_path.begins_with("/"):
				image_path = "/" + image_path
			var api := (Engine.get_main_loop() as SceneTree).root.get_node("ApiClient")
			if api != null:
				print("[GameManager][Fetch][TilesetImage] Downloading:", image_path)
				var bytes: PackedByteArray = await api.get_bytes(image_path)
				if bytes != null and bytes.size() > 0:
					var f := FileAccess.open(local_path, FileAccess.WRITE)
					if f:
						f.store_buffer(bytes)
						f.close()
						print("[GameManager][Fetch][TilesetImage] Success; cached:", local_path)
						# Stash tileset metadata for mapping later
						lower_id = ""
						upper_id = ""
						if tsdoc.has("lowerTerrain"): lower_id = str(tsdoc.get("lowerTerrain"))
						if tsdoc.has("upperTerrain"): upper_id = str(tsdoc.get("upperTerrain"))
						_tileset_meta_by_id[tsid] = {
							"remote_path": image_path,
							"local_path": local_path,
							"lowerTerrainId": lower_id,
							"upperTerrainId": upper_id,
						}
					else:
						print("[GameManager][Fetch][TilesetImage] Failed:", image_path)
			else:
				if not _tileset_meta_by_id.has(tsid):
					_tileset_meta_by_id[tsid] = {
						"remote_path": "",
						"local_path": local_path,
						"lowerTerrainId": "",
						"upperTerrainId": "",
					}
			# Ensure we record which terrains this tileset pairs (for mapping rows)
			if _tileset_meta_by_id.has(tsid):
				var meta: Dictionary = _tileset_meta_by_id[tsid]
				meta["lowerTerrainId"] = str(lower_id)
				meta["upperTerrainId"] = str(upper_id)
				_tileset_meta_by_id[tsid] = meta

	# Load cached tileset images into the Terrain TileMapLayer's TileSet as atlas sources
	_load_terrain_tilesets_into_layer()

## Load cached terrain tileset images into the Terrain TileMapLayer
## Load cached terrain tileset images into the Terrain TileMapLayer
func _load_terrain_tilesets_into_layer() -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var root: Node = tree.current_scene if tree.current_scene != null else tree.root
	if root == null:
		return

	var terrain_layer = null
	# Support both singular and plural node names
	if root.has_node("LocaleScreen/Terrain"):
		terrain_layer = root.get_node("LocaleScreen/Terrain")
	elif root.has_node("LocaleScreen/Terrains"):
		terrain_layer = root.get_node("LocaleScreen/Terrains")
	elif tree.root.has_node("Game/LocaleScreen/Terrain"):
		terrain_layer = tree.root.get_node("Game/LocaleScreen/Terrain")
	elif tree.root.has_node("Game/LocaleScreen/Terrains"):
		terrain_layer = tree.root.get_node("Game/LocaleScreen/Terrains")

	if terrain_layer == null:
		print("[GameManager] Terrain layer not found; skipping tileset load")
		return

	var tileset: TileSet = null
	if terrain_layer.has_method("get"):
		tileset = terrain_layer.get("tile_set") as TileSet
	else:
		tileset = terrain_layer.tile_set

	if tileset == null:
		print("[GameManager] Terrain layer has no TileSet")
		return

	print("[GameManager] Terrain TileSet instance id=", tileset.get_instance_id())

	var dir := DirAccess.open(TILESET_CACHE_DIR)
	if dir == null:
		print("[GameManager] No tileset cache dir at ", TILESET_CACHE_DIR)
		return

	dir.list_dir_begin()
	while true:
		var name := dir.get_next()
		if name == "":
			break
		if dir.current_is_dir():
			continue
		if not name.to_lower().ends_with(".png"):
			continue

		var key := name.substr(0, name.rfind("."))
		# Avoid duplicate sources by key if already present
		var already := false
		var scount := tileset.get_source_count()
		for i in range(scount):
			var sid_i := tileset.get_source_id(i)
			var src_i := tileset.get_source(sid_i)
			if src_i is TileSetAtlasSource and src_i.resource_name == key:
				already = true
				break
		if already:
			continue

		var full := "%s/%s" % [TILESET_CACHE_DIR, name]
		var img := Image.new()
		if img.load(full) != OK:
			print("[GameManager] Failed to load tileset image: ", full)
			continue

		var tex := ImageTexture.create_from_image(img)
		if tex == null:
			print("[GameManager] Failed to create texture for: ", full)
			continue

		var src := TileSetAtlasSource.new()
		src.texture = tex

		# Attempt to slice a 4×4 atlas; otherwise treat as single frame
		var w := img.get_width()
		var h := img.get_height()
		var cols := 4
		var rows := 4
		src.resource_name = key

		if (w % cols == 0) and (h % rows == 0):
			var cell_w := int(w / cols)
			var cell_h := int(h / rows)
			src.texture_region_size = Vector2i(cell_w, cell_h)
			for ry in range(rows):
				for rx in range(cols):
					var ac := Vector2i(rx, ry)
					if not src.has_tile(ac):
						src.create_tile(ac)
		else:
			# Fallback: single frame
			src.texture_region_size = Vector2i(w, h)
			var a0 := Vector2i(0, 0)
			if not src.has_tile(a0):
				src.create_tile(a0)

		# ✅ Step 2 fix: ALWAYS add the source (both 4×4 and fallback paths)
		var sid := tileset.get_next_source_id()
		tileset.add_source(src, sid)
		_terrain_tileset_source_by_id[key] = sid
		print("[GameManager] Added terrain tileset source ", name, " as id ", sid)
	dir.list_dir_end()

	# Reassign the TileSet to ensure node picks up runtime-added sources
	if terrain_layer.has_method("set"):
		terrain_layer.set("tile_set", tileset)
	else:
		terrain_layer.tile_set = tileset

	print("[GameManager] Reassigned Terrain TileSet; source_count=", tileset.get_source_count())
	if terrain_layer.has_method("queue_redraw"):
		terrain_layer.queue_redraw()

## Build per-terrain index mapping to TileSet source/atlas for base tiles (solid)
## Returns Array[Dictionary] aligned with biome.terrains order: { sid: int, atlas: Vector2i, tileset_id: String }
func get_terrain_tile_mapping_for_biome(biome: Biome) -> Array:
	var out: Array = []
	if biome == null:
		return out
	for t in biome.terrains:
		var tid := str(t)
		var mapped := {}
		for tsid in _tileset_meta_by_id.keys():
			var meta: Dictionary = _tileset_meta_by_id[tsid]
			var row := -1
			if meta.has("lowerTerrainId") and str(meta["lowerTerrainId"]) == tid:
				row = 0
			elif meta.has("upperTerrainId") and str(meta["upperTerrainId"]) == tid:
				row = 1
			if row != -1 and _terrain_tileset_source_by_id.has(tsid):
				var sid := int(_terrain_tileset_source_by_id[tsid])
				mapped = { "sid": sid, "atlas": Vector2i(0, row), "tileset_id": tsid }
				break
		out.append(mapped)
	return out
