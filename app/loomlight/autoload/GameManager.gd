# autoload/GameManager.gd
extends Node
var current_world: World = null
var current_player: PlayerCharacter = null
const BIOME_DAL = preload("res://scripts/dal/BiomeDAL.gd")
const CACHE_DIR := "user://cache/locale_tiles"
var tile_source_by_key: Dictionary = {}

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
			src.create_tile(Vector2i(0, 0))
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
				var bytes: PackedByteArray = await api.get_bytes(remote)
				if bytes != null and bytes.size() > 0:
					var f: FileAccess = FileAccess.open(local_path, FileAccess.WRITE)
					if f:
						f.store_buffer(bytes)
						f.close()
						print("[GameManager] Cached tile:", local_path)
					else:
						print("[GameManager] Failed to write tile:", local_path)
				else:
					print("[GameManager] Download failed:", remote)
				processed += 1
				if total_files > 0 and progress_span > 0.0:
					await _update_loading(progress_base + (float(processed) / float(total_files)) * progress_span, "Caching tiles (" + str(processed) + "/" + str(total_files) + ")")
