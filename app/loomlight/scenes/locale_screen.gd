extends Node2D

@export var noise_height_texture: NoiseTexture2D
@export var width_tiles: int = 100
@export var height_tiles: int = 100
@export var noise_scale: float = 1.0

var current_locale: Variant = null
var _terrain_layer: Node = null
var _terrain_tileset: TileSet = null
var _terrain_pair_sources: Dictionary = {}
var _terrain_index_texture_map: Dictionary = {}
var _biome_terrain_ids: Array[String] = []
@onready var _screen_buttons: Control = $ScreenButtons if has_node("ScreenButtons") else null

# Panning/scrolling config
var pan_mouse_button: int = MOUSE_BUTTON_RIGHT
var pan_active: bool = false
var pan_last_mouse_pos: Vector2 = Vector2.ZERO
var scroll_speed: float = 300.0  # pixels per second for keyboard scrolling
var zoom_speed: float = 0.1
var min_zoom: float = 0.5
var max_zoom: float = 2.0

func _ready() -> void:
	if has_node("Terrain"):
		_terrain_layer = $Terrain
	elif has_node("Terrains"):
		_terrain_layer = $Terrains
	if _terrain_layer != null:
		_terrain_tileset = _terrain_layer.tile_set
	if _screen_buttons != null:
		_screen_buttons.top_level = true
		_screen_buttons.z_index = 100
	visible = false
	set_process_unhandled_input(true)

func _unhandled_input(event: InputEvent) -> void:
	if not visible:
		return
		
	if event is InputEventMouseButton:
		var mbe := event as InputEventMouseButton
		# Begin/end panning with right mouse or middle mouse
		if mbe.button_index == pan_mouse_button or mbe.button_index == MOUSE_BUTTON_MIDDLE:
			if mbe.pressed:
				pan_active = true
				pan_last_mouse_pos = mbe.position
			else:
				pan_active = false
		# Mouse wheel for zooming
		elif mbe.button_index == MOUSE_BUTTON_WHEEL_UP:
			_zoom_at_point(mbe.position, 1.0 + zoom_speed)
		elif mbe.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_zoom_at_point(mbe.position, 1.0 - zoom_speed)

	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		# If panning, move the view
		if pan_active:
			var delta := mm.position - pan_last_mouse_pos
			position += delta
			pan_last_mouse_pos = mm.position

func _process(delta: float) -> void:
	if not visible:
		return
	
	# Keyboard scrolling
	var move_dir := Vector2.ZERO
	if Input.is_action_pressed("ui_left"):
		move_dir.x -= 1
	if Input.is_action_pressed("ui_right"):
		move_dir.x += 1
	if Input.is_action_pressed("ui_up"):
		move_dir.y -= 1
	if Input.is_action_pressed("ui_down"):
		move_dir.y += 1
	
	if move_dir.length() > 0:
		position += move_dir.normalized() * scroll_speed * delta

func _zoom_at_point(point: Vector2, zoom_factor: float) -> void:
	var new_scale := scale * zoom_factor
	new_scale.x = clamp(new_scale.x, min_zoom, max_zoom)
	new_scale.y = clamp(new_scale.y, min_zoom, max_zoom)
	
	if new_scale == scale:
		return
	
	# Zoom towards mouse position
	var old_scale := scale
	scale = new_scale
	
	# Adjust position to keep the point under cursor stationary
	var scale_ratio := new_scale / old_scale
	var offset := point - position
	position = point - offset * scale_ratio

func show_locale(loc: Locale) -> void:
	current_locale = loc
	if _terrain_layer == null or _terrain_tileset == null:
		print("[LocaleScreen] show_locale abort: missing terrain layer or tileset")
		return

	var loc_id := "" if loc == null else str(loc.id)
	print("[LocaleScreen] show_locale begin locale_id=", loc_id)

	_clear_tileset_sources()
	_terrain_index_texture_map = {}

	var world: World = null
	if Engine.has_singleton("GameManager"):
		world = GameManager.current_world
	if world == null:
		var gm_node := get_tree().root.get_node_or_null("GameManager")
		if gm_node != null:
			world = gm_node.get("current_world") as World

	var biome: Biome = null
	if loc != null:
		biome = loc.get_biome()
	if biome == null and world != null:
		var bid := (loc.get_biome_id() if loc != null else "")
		if bid != "":
			biome = world.get_biome_by_id(bid)
	if biome == null:
		print("[LocaleScreen] show_locale abort: missing biome for locale", loc_id)
		return

	_biome_terrain_ids = biome.terrain_ids()
	print("[LocaleScreen] biome terrain ids=", _biome_terrain_ids)

	_terrain_pair_sources = {}
	if world != null:
		var pair_map := world.get_cached_tileset_pairs_for_locale(loc)
		print("[LocaleScreen] cached pair_map size=", pair_map.size(), " keys=", pair_map.keys())
		for pair_key in pair_map.keys():
			var tsid := str(pair_map[pair_key])
			if tsid == "":
				print("[LocaleScreen]   skipping empty tsid for pair", pair_key)
				continue
			var sid := await _ensure_tileset_source(tsid)
			if sid >= 0:
				_terrain_pair_sources[pair_key] = sid
				_record_terrain_index_mapping(pair_key, tsid, sid)
			else:
				print("[LocaleScreen]   failed to ensure tileset source for tsid=", tsid)

	print("[LocaleScreen] terrain pair sources size=", _terrain_pair_sources.size(), " keys=", _terrain_pair_sources.keys())
	_print_terrain_index_texture_map_log()

	var terrain_count: int = max(1, int(_biome_terrain_ids.size()))
	var size := Vector2i(width_tiles, height_tiles)
	var offset := Vector2.ZERO
	if loc != null:
		offset = Vector2(loc.coordinates.x, loc.coordinates.y)
	print("[LocaleScreen] generating terrain map size=", size, " terrain_count=", terrain_count, " offset=", offset)
	var grid := _generate_terrain_index_map(size, terrain_count, offset)
	print("[LocaleScreen] terrain map generated; height=", grid.size())
	_apply_terrain_map(grid)
	# TEMP: visualize all atlas coordinates per source instead of generating noise-based terrain.
	#_debug_render_tileset_sources_preview()

	visible = true
	if _terrain_layer.has_method("queue_redraw"):
		_terrain_layer.queue_redraw()

func hide_locale() -> void:
	visible = false

func _clear_tileset_sources() -> void:
	if _terrain_tileset == null:
		return
	var count := _terrain_tileset.get_source_count()
	if count == 0:
		print("[LocaleScreen] _clear_tileset_sources none to remove")
		return
	var ids: Array = []
	for i in range(count):
		ids.append(_terrain_tileset.get_source_id(i))
	print("[LocaleScreen] _clear_tileset_sources removing ids=", ids)
	for sid in ids:
		_terrain_tileset.remove_source(int(sid))

func _ensure_tileset_source(tsid: String) -> int:
	if tsid == "":
		return -1
	if _terrain_layer == null or _terrain_tileset == null:
		return -1

	var existing := _terrain_tileset.get_source_count()
	for i in range(existing):
		var sid_i := _terrain_tileset.get_source_id(i)
		var existing_src := _terrain_tileset.get_source(sid_i)
		if existing_src is TileSetAtlasSource and existing_src.resource_name == tsid:
			_populate_tileset_atlas(existing_src)
			print("[LocaleScreen] _ensure_tileset_source reuse sid=", sid_i, " for tsid=", tsid)
			return int(sid_i)

	var path := "user://cache/terrain_tilesets/%s.png" % tsid
	if not FileAccess.file_exists(path):
		print("[LocaleScreen] _ensure_tileset_source missing file path=", path, ", attempting download...")
		var downloaded := await _download_tileset_image(tsid)
		if not downloaded:
			print("[LocaleScreen] _ensure_tileset_source failed to download tsid=", tsid)
			return -1

	var img := Image.new()
	if img.load(path) != OK:
		print("[LocaleScreen] _ensure_tileset_source failed image load path=", path)
		return -1

	var tex := ImageTexture.create_from_image(img)
	if tex == null:
		print("[LocaleScreen] _ensure_tileset_source failed to create texture tsid=", tsid)
		return -1

	var src := TileSetAtlasSource.new()
	src.texture = tex
	src.resource_name = tsid
	# Use the TileSet's configured tile size for isometric layout
	src.texture_region_size = _terrain_tileset.tile_size
	var base := Vector2i(0, 0)
	_populate_tileset_atlas(src)

	var sid := _terrain_tileset.get_next_source_id()
	_terrain_tileset.add_source(src, sid)
	if _terrain_layer.has_method("queue_redraw"):
		_terrain_layer.queue_redraw()
	print("[LocaleScreen] _ensure_tileset_source added sid=", sid, " for tsid=", tsid, " size=", src.texture_region_size)
	return int(sid)

func _populate_tileset_atlas(src: TileSetAtlasSource) -> void:
	if src == null:
		return
	var atlas_tile_size := src.texture_region_size
	if _terrain_tileset != null and _terrain_tileset.tile_size.x > 0 and _terrain_tileset.tile_size.y > 0:
		atlas_tile_size = _terrain_tileset.tile_size
	if src.texture_region_size != atlas_tile_size:
		src.texture_region_size = atlas_tile_size
	if atlas_tile_size.x <= 0 or atlas_tile_size.y <= 0:
		return
	var tex := src.texture
	if tex == null:
		return
	var width := tex.get_width()
	var height := tex.get_height()
	if width <= 0 or height <= 0:
		return
	var cols := int(max(1.0, float(width) / float(atlas_tile_size.x)))
	var rows := int(max(1.0, float(height) / float(atlas_tile_size.y)))
	for y in range(rows):
		for x in range(cols):
			var coord := Vector2i(x, y)
			if not src.has_tile(coord):
				src.create_tile(coord)

func _record_terrain_index_mapping(pair_key: Variant, tsid: String, sid: int) -> void:
	var indices: PackedInt32Array = PackedInt32Array()
	if pair_key is PackedInt32Array:
		indices = pair_key
	elif pair_key is Array:
		indices.resize(pair_key.size())
		for i in range(pair_key.size()):
			indices[i] = int(pair_key[i])
	else:
		return
	if indices.size() > 0:
		_terrain_index_texture_map[int(indices[0])] = {
			"tsid": tsid,
			"sid": sid,
			"atlas_coord": Vector2i(0, 0),
			"pair_indices": PackedInt32Array(indices),
		}
	if indices.size() > 1:
		_terrain_index_texture_map[int(indices[1])] = {
			"tsid": tsid,
			"sid": sid,
			"atlas_coord": Vector2i(1, 0),
			"pair_indices": PackedInt32Array(indices),
		}

func _print_terrain_index_texture_map_log() -> void:
	var keys := _terrain_index_texture_map.keys()
	if keys.size() == 0:
		print("[LocaleScreen] terrain index texture map empty")
		return
	keys.sort()
	print("[LocaleScreen] terrain index texture map entries=", keys.size())
	for idx in keys:
		var info: Dictionary = _terrain_index_texture_map[idx]
		var tsid := str(info.get("tsid", ""))
		var sid := int(info.get("sid", -1))
		var atlas_coord: Variant = info.get("atlas_coord", Vector2i.ZERO)
		var pair_indices: Variant = info.get("pair_indices", PackedInt32Array())
		print("[LocaleScreen]   terrain_idx=", idx, " tsid=", tsid, " sid=", sid, " atlas_coord=", atlas_coord, " pair_indices=", pair_indices)

func _generate_terrain_index_map(size: Vector2i, terrain_count: int, offset: Vector2) -> Array:
	var width: int = max(1, int(size.x))
	var height: int = max(1, int(size.y))
	var bins: int = max(1, int(terrain_count))
	var out: Array = []
	out.resize(height)

	var noise_src: Noise = noise_height_texture.noise if noise_height_texture != null else null
	if noise_src == null:
		noise_src = FastNoiseLite.new()

	var thresholds: Array = []
	print("[LocaleScreen] _generate_terrain_index_map bins=", bins)
	for i in range(bins - 1):
		thresholds.append(float(i + 1) / float(bins))
	print("[LocaleScreen] _generate_terrain_index_map thresholds=", thresholds)

	for y in range(height):
		var row := PackedInt32Array()
		row.resize(width)
		for x in range(width):
			var sample_x := (float(x) + offset.x) * noise_scale
			var sample_y := (float(y) + offset.y) * noise_scale
			var n: float = 0.0
			if noise_src is FastNoiseLite:
				n = (noise_src as FastNoiseLite).get_noise_2d(sample_x, sample_y)
			else:
				n = noise_src.get_noise_2d(sample_x, sample_y)
			var n01: float = clamp((n + 1.0) * 0.5, 0.0, 1.0)
			var idx := 0
			for t in thresholds:
				if n01 < t:
					break
				idx += 1
			idx = clamp(idx, 0, bins - 1)
			row[x] = idx
		out[y] = row
		#print("[LocaleScreen]   row", y, " data=", row)
	var counts := {}
	for y in range(height):
		var rowy: PackedInt32Array = out[y]
		for x in range(rowy.size()):
			var val := int(rowy[x])
			counts[val] = counts.get(val, 0) + 1
	print("[LocaleScreen] _generate_terrain_index_map counts=", counts)
	return out

func _apply_terrain_map(grid: Array) -> void:
	if _terrain_layer == null or _terrain_tileset == null:
		print("[LocaleScreen] _apply_terrain_map abort: missing layer or tileset")
		return
	if not _terrain_layer.has_method("set_cell"):
		print("[LocaleScreen] _apply_terrain_map abort: layer lacks set_cell")
		return

	var height := grid.size()
	var pair_keys := _terrain_pair_sources.keys()
	print("[LocaleScreen] _apply_terrain_map start height=", height, " pair_keys=", pair_keys)
	var placed := 0
	var skipped := 0
	var terrain_sid_counts := {}
	for y in range(height):
		var row = grid[y]
		if row == null:
			print("[LocaleScreen]   skipped null row y=", y)
			continue
		var packed_row: PackedInt32Array = row if row is PackedInt32Array else PackedInt32Array(row)
		var width := packed_row.size()
		for x in range(width):
			var terrain_idx := int(packed_row[x])
			var sid := -1
			var atlas_coord := Vector2i.ZERO
			for pair in _terrain_pair_sources.keys():
				var pair_indices: PackedInt32Array = pair
				if pair_indices.size() != 2:
					continue
				var first_idx := int(pair_indices[0])
				var second_idx := int(pair_indices[1])
				if first_idx == terrain_idx:
					sid = int(_terrain_pair_sources[pair])
					atlas_coord = Vector2i(0, 0)
					break
				if second_idx == terrain_idx:
					sid = int(_terrain_pair_sources[pair])
					atlas_coord = Vector2i(1, 0)
					break
			if sid < 0:
				skipped += 1
				if skipped < 10:
					print("[LocaleScreen]   no source for terrain_idx=", terrain_idx, " at (", x, ",", y, ")")
				continue
			_terrain_layer.set_cell(Vector2i(x, y), sid, atlas_coord, 0)
			print("[LocaleScreen]   placed terrain_idx=", terrain_idx, " sid=", sid, " atlas_coord=", atlas_coord, " at (", x, ",", y, ")")
			placed += 1
			var key := "%s:%s,%s" % [sid, atlas_coord.x, atlas_coord.y]
			terrain_sid_counts[key] = terrain_sid_counts.get(key, 0) + 1
	if _terrain_layer.has_method("queue_redraw"):
		_terrain_layer.queue_redraw()
	print("[LocaleScreen] _apply_terrain_map end placed=", placed, " skipped=", skipped, " sid_counts=", terrain_sid_counts)

func _debug_render_tileset_sources_preview() -> void:
	if _terrain_layer == null or _terrain_tileset == null:
		print("[LocaleScreen] _debug_render_tileset_sources_preview abort: missing layer or tileset")
		return
	if not _terrain_layer.has_method("set_cell"):
		print("[LocaleScreen] _debug_render_tileset_sources_preview abort: layer lacks set_cell")
		return
	if _terrain_layer.has_method("clear"):
		_terrain_layer.clear()

	var max_columns := 16
	var current_row := 0
	var source_count := _terrain_tileset.get_source_count()
	print("[LocaleScreen] _debug_render_tileset_sources_preview start source_count=", source_count)
	for i in range(source_count):
		var sid := _terrain_tileset.get_source_id(i)
		var src := _terrain_tileset.get_source(sid)
		if not (src is TileSetAtlasSource):
			print("[LocaleScreen]   skipping non-atlas source sid=", sid)
			continue
		var coords := _collect_sorted_atlas_coords(src)
		print("[LocaleScreen]   sid=", sid, " coord_count=", coords.size())
		var coord_count := coords.size()
		for idx in range(coord_count):
			var coord: Vector2i = coords[idx]
			var col := idx % max_columns
			var row_offset := int(idx / max_columns)
			var map_pos := Vector2i(col, current_row + row_offset)
			_terrain_layer.set_cell(map_pos, sid, coord, 0)
		var rows_used := 1 if coord_count == 0 else int((coord_count + max_columns - 1) / max_columns)
		current_row += rows_used
	if _terrain_layer.has_method("queue_redraw"):
		_terrain_layer.queue_redraw()
	print("[LocaleScreen] _debug_render_tileset_sources_preview end rows_used=", current_row)

func _collect_sorted_atlas_coords(src: TileSetAtlasSource) -> Array:
	var coords: Array = []
	if src == null:
		return coords
	var atlas_tile_size := src.texture_region_size
	if atlas_tile_size.x <= 0 or atlas_tile_size.y <= 0:
		return coords
	var tex := src.texture
	if tex == null:
		return coords
	var width := tex.get_width()
	var height := tex.get_height()
	if width <= 0 or height <= 0:
		return coords

	var cols := int(max(1.0, float(width) / float(atlas_tile_size.x)))
	var rows := int(max(1.0, float(height) / float(atlas_tile_size.y)))
	for ay in range(rows):
		for ax in range(cols):
			var coord := Vector2i(ax, ay)
			if src.has_tile(coord):
				coords.append(coord)
	return coords

func _download_tileset_image(tsid: String) -> bool:
	var world: World = null
	if Engine.has_singleton("GameManager"):
		world = GameManager.current_world
	if world == null:
		var gm_node := get_tree().root.get_node_or_null("GameManager")
		if gm_node != null:
			world = gm_node.get("current_world") as World
	
	if world == null:
		print("[LocaleScreen] _download_tileset_image abort: no world")
		return false
	
	var meta := world.get_tileset_meta(tsid)
	if meta.size() == 0:
		print("[LocaleScreen] _download_tileset_image abort: no metadata for tsid=", tsid)
		return false
	
	var remote_path: String = str(meta.get("remote_path", ""))
	if remote_path == "":
		print("[LocaleScreen] _download_tileset_image abort: no remote_path for tsid=", tsid)
		return false
	
	var api_node := get_tree().root.get_node_or_null("ApiClient")
	if api_node == null:
		print("[LocaleScreen] _download_tileset_image abort: no ApiClient")
		return false
	
	print("[LocaleScreen] _download_tileset_image downloading from ", remote_path)
	var bytes: PackedByteArray = await api_node.get_bytes(remote_path)
	if bytes.size() == 0:
		print("[LocaleScreen] _download_tileset_image abort: empty response for ", remote_path)
		return false
	
	var cache_dir := "user://cache/terrain_tilesets"
	if not DirAccess.dir_exists_absolute(cache_dir):
		var err := DirAccess.make_dir_recursive_absolute(cache_dir)
		if err != OK:
			print("[LocaleScreen] _download_tileset_image failed to create directory ", cache_dir)
			return false
	
	var path := "%s/%s.png" % [cache_dir, tsid]
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file == null:
		print("[LocaleScreen] _download_tileset_image failed to open file for writing: ", path)
		return false
	
	file.store_buffer(bytes)
	file.close()
	print("[LocaleScreen] _download_tileset_image saved to ", path, " (", bytes.size(), " bytes)")
	return true
