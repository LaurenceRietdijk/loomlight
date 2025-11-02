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
	if height == 0:
		print("[LocaleScreen] _apply_terrain_map abort: empty grid")
		return
	
	var first_row = grid[0]
	var width := (first_row as PackedInt32Array).size() if first_row is PackedInt32Array else 0
	if width == 0:
		print("[LocaleScreen] _apply_terrain_map abort: zero width")
		return
	
	print("[LocaleScreen] _apply_terrain_map start using Wang tileset logic, grid size=", width, "x", height)
	
	var placed := 0
	var skipped := 0
	var multi_terrain_warnings := 0
	var terrain_sid_counts := {}
	
	# Process intermediary points (shifted 0.5, 0.5 from grid)
	# For each intermediary point, we check the 4 surrounding grid points
	for y in range(height - 1):
		for x in range(width - 1):
			# Get the 4 corner terrain indices around this intermediary point
			var top_left := _get_terrain_at(grid, x, y)
			var top_right := _get_terrain_at(grid, x + 1, y)
			var bottom_left := _get_terrain_at(grid, x, y + 1)
			var bottom_right := _get_terrain_at(grid, x + 1, y + 1)
			
			# Collect unique terrain types in the 4 corners
			var unique_terrains := {}
			unique_terrains[top_left] = true
			unique_terrains[top_right] = true
			unique_terrains[bottom_left] = true
			unique_terrains[bottom_right] = true
			
			var terrain_types := unique_terrains.keys()
			var terrain_count := terrain_types.size()
			
			# Handle cases with more than 2 terrains
			if terrain_count > 2:
				if multi_terrain_warnings < 10:
					print("[LocaleScreen]   WARNING: More than 2 terrains at intermediary point (", x, ".5, ", y, ".5): ", terrain_types)
					multi_terrain_warnings += 1
				skipped += 1
				continue
			
			# For uniform terrain (all corners same), we still need to render solid tiles
			# For transitions, we have 2 different terrains
			var result: Dictionary
			if terrain_count == 1:
				# All corners same - find any pair containing this terrain and use solid tile
				var uniform_terrain: int = int(terrain_types[0])
				result = _find_uniform_wang_tile(uniform_terrain)
			else:
				# Transition between two terrains
				var terrain_a: int = int(terrain_types[0])
				var terrain_b: int = int(terrain_types[1])
				result = _find_wang_tile(terrain_a, terrain_b, top_left, top_right, bottom_left, bottom_right)
			
			if result.sid < 0:
				skipped += 1
				continue
			
			# Place the tile at the intermediary position
			_terrain_layer.set_cell(Vector2i(x, y), result.sid, result.atlas_coord, 0)
			placed += 1
			
			var key := "%s:%s,%s" % [result.sid, result.atlas_coord.x, result.atlas_coord.y]
			terrain_sid_counts[key] = terrain_sid_counts.get(key, 0) + 1
	
	if multi_terrain_warnings >= 10:
		print("[LocaleScreen]   (suppressed additional multi-terrain warnings)")
	
	if _terrain_layer.has_method("queue_redraw"):
		_terrain_layer.queue_redraw()
	
	print("[LocaleScreen] _apply_terrain_map end placed=", placed, " skipped=", skipped, " multi_terrain_warnings=", multi_terrain_warnings)
	print("[LocaleScreen] sid_counts=", terrain_sid_counts)

func _get_terrain_at(grid: Array, x: int, y: int) -> int:
	if y < 0 or y >= grid.size():
		return -1
	var row = grid[y]
	var packed_row: PackedInt32Array = row if row is PackedInt32Array else PackedInt32Array(row)
	if x < 0 or x >= packed_row.size():
		return -1
	return int(packed_row[x])

func _find_uniform_wang_tile(terrain_idx: int) -> Dictionary:
	var result := {"sid": -1, "atlas_coord": Vector2i.ZERO}
	
	# Find any pair that includes this terrain
	var found_pair: PackedInt32Array
	var is_first_terrain := false
	
	for pair in _terrain_pair_sources.keys():
		var pair_indices: PackedInt32Array = pair
		if pair_indices.size() != 2:
			continue
		
		var idx_a := int(pair_indices[0])
		var idx_b := int(pair_indices[1])
		
		if idx_a == terrain_idx:
			found_pair = pair_indices
			is_first_terrain = true
			break
		elif idx_b == terrain_idx:
			found_pair = pair_indices
			is_first_terrain = false
			break
	
	if found_pair.size() == 0:
		return result
	
	result.sid = int(_terrain_pair_sources[found_pair])
	
	# Use the appropriate solid tile:
	# - If this terrain is the "first" in the pair, use mask 0b1111 (all first) -> atlas (0,0)
	# - If this terrain is the "second" in the pair, use mask 0b0000 (all second) -> atlas (1,0)
	if is_first_terrain:
		result.atlas_coord = Vector2i(1, 0)  # uuuu - all first terrain
	else:
		result.atlas_coord = Vector2i(0, 0)  # llll - all second terrain
	
	return result

func _find_wang_tile(terrain_a: int, terrain_b: int, top_left: int, top_right: int, bottom_left: int, bottom_right: int) -> Dictionary:
	var result := {"sid": -1, "atlas_coord": Vector2i.ZERO}
	
	# Find the source ID for this terrain pair
	var sid := -1
	var pair_key: PackedInt32Array
	
	for pair in _terrain_pair_sources.keys():
		var pair_indices: PackedInt32Array = pair
		if pair_indices.size() != 2:
			continue
		
		var idx_a := int(pair_indices[0])
		var idx_b := int(pair_indices[1])
		
		# Check if this pair matches our terrains (in either order)
		if (idx_a == terrain_a and idx_b == terrain_b) or (idx_a == terrain_b and idx_b == terrain_a):
			sid = int(_terrain_pair_sources[pair])
			pair_key = pair_indices
			break
	
	if sid < 0:
		return result
	
	result.sid = sid
	
	# Determine Wang tile index based on corner configuration
	# We use a 2-corner Wang tileset (blob tileset) with 16 possible configurations
	# Each corner can be terrain A or terrain B
	# We encode this as a 4-bit number: [TL][TR][BL][BR]
	
	# Normalize so terrain_a is always the "first" terrain in the pair
	var first_terrain := int(pair_key[0])
	var second_terrain := int(pair_key[1])
	
	# Build a bitmask: 1 if corner matches first_terrain, 0 if second_terrain
	var mask := 0
	if top_left == first_terrain:
		mask |= 8  # bit 3
	if top_right == first_terrain:
		mask |= 4  # bit 2
	if bottom_left == first_terrain:
		mask |= 2  # bit 1
	if bottom_right == first_terrain:
		mask |= 1  # bit 0
	
	# Map the mask to atlas coordinates
	# Standard Wang blob tileset layout is 4x4 (16 tiles)
	result.atlas_coord = _wang_mask_to_atlas_coord(mask)
	
	return result

func _wang_mask_to_atlas_coord(mask: int) -> Vector2i:
	# Custom Wang tileset mapping based on actual tileset layout
	# Mask format: [TL][TR][BL][BR] where 1 = first/upper terrain, 0 = second/lower terrain
	# Layout order: "uuuu, llll, ulll, lllu, lluu, llul, lulu, lull, ulul, uuul, uull, uluu, luuu, uulu, ullu, luul"
	# Where u=upper/first terrain, l=lower/second terrain
	# Pattern order: TL, TR, BL, BR
	
	var wang_coords := {
		0b0000: Vector2i(1, 0),  # llll - all second/lower terrain
		0b0001: Vector2i(3, 0),  # lllu - BR only first
		0b0010: Vector2i(1, 1),  # llul - BL only first
		0b0011: Vector2i(0, 1),  # lluu - BL,BR first (bottom edge)
		0b0100: Vector2i(3, 1),  # lull - TR only first
		0b0101: Vector2i(2, 1),  # lulu - TR,BR first (diagonal)
		0b0110: Vector2i(3, 3),  # luul - TR,BL first (diagonal)
		0b0111: Vector2i(0, 3),  # luuu - TR,BL,BR first (all but TL)
		0b1000: Vector2i(2, 0),  # ulll - TL only first
		0b1001: Vector2i(2, 3),  # ullu - TL,BR first (diagonal)
		0b1010: Vector2i(0, 2),  # ulul - TL,BL first (left edge)
		0b1011: Vector2i(3, 2),  # uluu - TL,BL,BR first (all but TR)
		0b1100: Vector2i(2, 2),  # uull - TL,TR first (top edge)
		0b1101: Vector2i(1, 3),  # uulu - TL,TR,BR first (all but BL)
		0b1110: Vector2i(1, 2),  # uuul - TL,TR,BL first (all but BR)
		0b1111: Vector2i(0, 0),  # uuuu - all first/upper terrain
	}
	
	if wang_coords.has(mask):
		return wang_coords[mask]
	
	# Fallback - should not happen with complete mapping
	print("[LocaleScreen] WARNING: Unknown Wang mask ", mask, " using fallback")
	var row := int(mask / 4)
	var col := int(mask % 4)
	return Vector2i(col, row)

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
