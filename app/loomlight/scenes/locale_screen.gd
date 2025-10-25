extends Node2D

@export var noise_height_texture: NoiseTexture2D
@export var width_tiles: int = 100
@export var height_tiles: int = 100
@export var noise_scale: float = 1.0

var current_locale: Variant = null
@onready var terrain_layer: Node = (
	$Terrain if has_node("Terrain")
	else ($Terrains if has_node("Terrains") else null)
)

# In-memory grid used for placement (Array[PackedInt32Array])
var _grid: Array = []

# Cache of source ids loaded for this screen
var _source_ids: PackedInt32Array = PackedInt32Array()

func _ready() -> void:
	print("[LocaleScreen] ready")
	visible = false

func show_locale(loc) -> void:
	# Called by GameManager when switching to this screen.
	current_locale = loc
	visible = true
	await _prepare_tileset_for_locale()
	await _generate_and_place_map()

func hide_locale() -> void:
	visible = false

func generateWorld(w: int = -1, h: int = -1, s: float = -1.0) -> void:
	# Backwards-compatible entry point
	generate_world(w, h, s)

func generate_world(w: int = -1, h: int = -1, s: float = -1.0) -> void:
	# Manual trigger that bypasses show flow; prepares tileset and places tiles
	await _prepare_tileset_for_locale()
	await _generate_and_place_map(w, h, s)

func _resolve_terrain_layer() -> Node:
	if terrain_layer != null:
		return terrain_layer
	if has_node("Terrain"):
		terrain_layer = $Terrain
	elif has_node("Terrains"):
		terrain_layer = $Terrains
	return terrain_layer

func _get_existing_tileset(layer: Node) -> TileSet:
	var ts: TileSet = null
	if layer == null:
		return null
	if layer.has_method("get"):
		ts = layer.get("tile_set") as TileSet
	else:
		ts = layer.tile_set
	return ts

func _clear_tileset_sources(ts: TileSet) -> void:
	if ts == null:
		return
	var count := ts.get_source_count()
	if count == 0:
		return
	var ids: Array = []
	for i in range(count):
		ids.append(ts.get_source_id(i))
	for sid in ids:
		ts.remove_source(int(sid))

# Note: Intentionally avoid changing any TileMap/TileSet configuration here.

func _load_locale_textures_into_tileset(ts: TileSet) -> PackedInt32Array:
	var out := PackedInt32Array()
	if ts == null:
		return out
	# Expect GameManager to have cached needed tilesets under this dir
	var dir_path := "user://cache/terrain_tilesets"
	var da := DirAccess.open("user://")
	if da == null:
		return out
	if not DirAccess.dir_exists_absolute(dir_path):
		return out
	var sub := DirAccess.open(dir_path)
	if sub == null:
		return out
	sub.list_dir_begin()
	while true:
		var fn := sub.get_next()
		if fn == "":
			break
		if sub.current_is_dir():
			continue
		if not fn.to_lower().ends_with(".png"):
			continue
		var full := dir_path.rstrip("/") + "/" + fn
		var img := Image.new()
		var err := img.load(full)
		if err != OK:
			print("[LocaleScreen][Tileset] Failed to load image:", full)
			continue
		var tex := ImageTexture.create_from_image(img)
		var src := TileSetAtlasSource.new()
		src.texture = tex
		src.texture_region_size = Vector2i(img.get_width(), img.get_height())
		var c0 := Vector2i(0, 0)
		if not src.has_tile(c0):
			src.create_tile(c0)
		var sid := ts.get_next_source_id()
		ts.add_source(src, sid)
		out.append(sid)
		report_texture_loaded(fn, sid)
	sub.list_dir_end()
	return out

func report_texture_loaded(name: String, sid: int) -> void:
	print("[LocaleScreen][Tileset] Added atlas source:", name, " sid=", sid)

func _prepare_tileset_for_locale() -> void:
	var layer := _resolve_terrain_layer()
	if layer == null:
		print("[LocaleScreen] No Terrain layer; abort prepare")
		return
	var tileset := _get_existing_tileset(layer)
	if tileset == null:
		print("[LocaleScreen] Terrain layer has no TileSet; please assign one in the editor")
		return
	# Remove anything from the atlas if it is already populated
	_clear_tileset_sources(tileset)
	# Load textures needed for this locale into the atlas (cached by GameManager)
	_source_ids = _load_locale_textures_into_tileset(tileset)
	# Reassign to ensure runtime changes are picked up
	if layer.has_method("set"):
		layer.set("tile_set", tileset)
	else:
		layer.tile_set = tileset

func _generate_map_grid(W: int, H: int, bins: int, S: float) -> Array:
	var noise_src: Noise = null
	if noise_height_texture != null:
		noise_src = noise_height_texture.noise
	if noise_src == null:
		noise_src = FastNoiseLite.new()
	_grid = []
	_grid.resize(H)
	for y in H:
		var row := PackedInt32Array()
		row.resize(W)
		for x in W:
			var n := 0.0
			if noise_src is FastNoiseLite:
				n = (noise_src as FastNoiseLite).get_noise_2d(float(x) * S, float(y) * S)
			else:
				n = noise_src.get_noise_2d(float(x) * S, float(y) * S)
			var n01: float = clamp(n + 0.5, 0.0, 1.0)
			var idx: int = int(floor(n01 * float(max(1, bins))))
			if bins > 0:
				idx = clamp(idx, 0, bins - 1)
			row[x] = idx
		_grid[y] = row
	return _grid

func _place_tiles_from_grid(layer: Node, grid: Array, sids: PackedInt32Array) -> void:
	if layer == null:
		return
	if layer.has_method("clear"):
		layer.clear()
	var H := grid.size()
	var W := (grid[0] as PackedInt32Array).size() if H > 0 else 0
	var bins := int(max(1, sids.size()))
	for y in H:
		for x in W:
			var idx: int = int((grid[y] as PackedInt32Array)[x])
			idx = clamp(idx, 0, bins - 1)
			var sid := int(sids[idx] if sids.size() > 0 else 0)
			layer.set_cell(Vector2i(x, y), sid, Vector2i(0, 0), 0)
	if layer.has_method("queue_redraw"):
		layer.queue_redraw()

func _generate_and_place_map(w: int = -1, h: int = -1, s: float = -1.0) -> void:
	var layer := _resolve_terrain_layer()
	if layer == null:
		return
	if _source_ids.size() == 0:
		print("[LocaleScreen] No atlas sources loaded; skipping tile placement")
		return
	var W := (width_tiles if w == -1 else w)
	var H := (height_tiles if h == -1 else h)
	var S := (noise_scale if s < 0.0 else s)
	var bins := int(max(1, _source_ids.size()))
	var grid := _generate_map_grid(W, H, bins, S)
	_place_tiles_from_grid(layer, grid, _source_ids)
