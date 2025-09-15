# autoload/GameManager.gd
extends Node
var current_world: World = null
var current_player: PlayerCharacter = null
const BiomeDAL = preload("res://scripts/dal/BiomeDAL.gd")
const CACHE_DIR := "user://cache/locale_tiles"
var tile_source_by_key: Dictionary = {}

# Load the selected world with the chosen player character
func load_world(player: PlayerCharacter, world: World) -> void:
	current_player = player
	current_world = world
	# Ensure gameplay scene is visible before heavy loading
	await _ensure_game_scene()
	print("Starting game with world '%s' and character '%s'" % [world.name, player.name])
	# Initialize world collections (e.g., dehydrated locales) using world.id
	if current_world != null:
		await current_world.init_collections()
		# Load global biomes into world cache
		var all_biomes: Array[Biome] = await BiomeDAL.fetch_all()
		current_world.biomes = all_biomes
		# Cache locale tiles for generated biomes
		await _cache_locale_tiles()
		# Load cached tiles into TileSet sources
		await _load_tiles_into_tileset()
	# Initialize player character active state for this world
	if current_player != null and current_world != null:
		await current_player.init_for_world(current_world)

# Called when the node is added to the scene tree
func _ready() -> void:
	print("GameManager loaded")

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
func _load_tiles_into_tileset() -> void:
	var tree: SceneTree = get_tree()
	if tree == null:
		return
	var root: Node = tree.current_scene if tree.current_scene != null else tree.root
	if root == null:
		return
	var world_map = null
	if root.has_node("WorldMap"):
		world_map = root.get_node("WorldMap")
	elif tree.root.has_node("Game/WorldMap"):
		world_map = tree.root.get_node("Game/WorldMap")
	if world_map == null:
		print("[GameManager] WorldMap node not found; skipping tileset load")
		return
	# Expect a TileMapLayer-like node with tile_set property
	var tileset: TileSet = null
	if world_map != null and world_map.has_method("get"):
		tileset = world_map.get("tile_set") as TileSet
	else:
		# Try direct access
		tileset = world_map.tile_set
	if tileset == null:
		print("[GameManager] WorldMap has no TileSet")
		return

	# Reset mapping to avoid duplicates on reloads
	tile_source_by_key.clear()

	# Iterate cached PNGs
	var dir: DirAccess = DirAccess.open(CACHE_DIR)
	if dir == null:
		print("[GameManager] No cache dir:", CACHE_DIR)
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

	for b in biome_dirs:
		var sub_path: String = CACHE_DIR.rstrip("/") + "/" + b
		var sub: DirAccess = DirAccess.open(sub_path)
		if sub == null:
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
			var img: Image = Image.new()
			var err: int = img.load(full)
			if err != OK:
				print("[GameManager] Failed image load:", full, " err=", err)
				continue
			var tex: ImageTexture = ImageTexture.create_from_image(img)
			if tex == null:
				continue
			var src: TileSetAtlasSource = TileSetAtlasSource.new()
			src.texture = tex
			# Assume tile art is square; use full image as single region
			src.texture_region_size = Vector2i(img.get_width(), img.get_height())
			src.create_tile(Vector2i(0, 0))
			# Use next source id so we can map key -> source id
			var dot: int = fn.rfind(".")
			var key: String = (fn.substr(0, dot) if dot != -1 else fn)
			var sid: int = tileset.get_next_source_id()
			tileset.add_source(src, sid)
			tile_source_by_key[key] = sid
			print("[GameManager] Added tile source:", fn, " key=", key, " sid=", sid)
		sub.list_dir_end()
	# Ensure visuals refresh
	world_map.queue_redraw()

	# Place tiles for each cached locale using their coordinates and mapped source ids
	if current_world != null and current_world.locales is Dictionary:
		for lid in current_world.locales.keys():
			var loc: Locale = current_world.locales[lid]
			if loc == null:
				continue
			var tkey: String = loc.tile_key()
			if tkey == "":
				continue
			var sid2: int = 0
			if tile_source_by_key.has(tkey):
				sid2 = int(tile_source_by_key[tkey])
			# else: fall back to default source id 0
			var cx: int = int(loc.coordinates.x)
			var cy: int = int(loc.coordinates.y)
			# atlas tile created at (0,0)
			world_map.set_cell(Vector2i(cx, cy), sid2, Vector2i(0, 0), 0)

# Download and cache all generated biome locale tiles to HDD under user://
func _cache_locale_tiles() -> void:
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
