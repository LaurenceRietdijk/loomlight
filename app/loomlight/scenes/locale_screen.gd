extends Node2D

const BIOME_DAL = preload("res://scripts/dal/BiomeDAL.gd")
const TERRAIN_DAL = preload("res://scripts/dal/TerrainDAL.gd")

# When true, map thresholds across the observed noise range [n01_min, n01_max]
# instead of the full theoretical [0,1]. This evens out tile distribution
# when the noise function doesn't span the whole range.
const USE_OBSERVED_NOISE_RANGE := false

var current_locale: Locale = null

@export var noise_height_texture: NoiseTexture2D
@export var pan_speed: float = 400.0

@onready var terrain_layer: Node = $Terrain if has_node("Terrain") else null

var _terrain_index_grid: Array = [] # Array[PackedInt32Array]

func _ready() -> void:
	visible = false
	set_process(true)
	set_process_unhandled_input(true)
	print("[LocaleScreen] _ready: processing + unhandled_input enabled")

func show_locale(loc: Locale) -> void:
	# Set current locale and make visible. Populate visuals later.
	current_locale = loc
	# Proactively ensure terrain tilesets for this locale are prepared via GameManager
	var tree := Engine.get_main_loop() as SceneTree
	if tree and tree.root.has_node("GameManager"):
		var gm = tree.root.get_node("GameManager")
		if gm and gm.has_method("_ensure_locale_terrain_tilesets"):
			await gm._ensure_locale_terrain_tilesets(loc)
	# Generate a simple noise-based terrain test grid
	await generate_world()
	visible = true

func hide_locale() -> void:
	visible = false

## Convenience: camelCase alias if referenced elsewhere
func generateWorld(width: int = 100, height: int = 100, noise_scale: float = 1) -> void:
	await generate_world(width, height, noise_scale)

## Build a 2D integer grid from noise and paint base tiles
func generate_world(width: int = 100, height: int = 100, noise_scale: float = 1) -> void:
	if terrain_layer == null:
		if has_node("Terrain"):
			terrain_layer = $Terrain
		else:
			return
	var tileset: TileSet = null
	if terrain_layer.has_method("get"):
		tileset = terrain_layer.get("tile_set") as TileSet
	else:
		tileset = terrain_layer.tile_set
	if tileset == null:
		return
	print("[LocaleScreen] Terrain TileSet instance id=", tileset.get_instance_id())

	# Determine biome terrain count, names, and weights
	var terrain_count: int = 2 # fallback
	var terrain_names: Array[String] = []
	var terrain_weights: Array[float] = []
	if current_locale != null and str(current_locale.biome) != "":
		var biome: Biome = await BIOME_DAL.fetch_by_id(str(current_locale.biome))
		if biome != null and biome.terrains is Array and biome.terrains.size() > 0:
			terrain_count = int(biome.terrains.size())
			# Resolve terrain names for logging thresholds (terrains are id strings)
			for tid in biome.terrains:
				var name_or_id := String(tid)
				var td: Dictionary = await TERRAIN_DAL.fetch_by_id(name_or_id)
				var tname: String = ""
				if td is Dictionary and td.has("name"):
					tname = String(td.name)
				if tname == "":
					tname = name_or_id
				terrain_names.append(tname)
			# Collect weights aligned with biome.terrains order (defaults to 1.0)
			for tid2 in biome.terrains:
				var id2 := String(tid2)
				var w := 1.0
				if biome.terrain_weights is Dictionary and biome.terrain_weights.has(id2):
					var wv = biome.terrain_weights[id2]
					if typeof(wv) in [TYPE_INT, TYPE_FLOAT]:
						w = float(wv)
				terrain_weights.append(max(w, 0.0))
	# Fallback names if none resolved
	if terrain_names.size() == 0:
		for i in terrain_count:
			terrain_names.append("Terrain " + str(i))
	# Fallback weights if not provided
	if terrain_weights.size() == 0:
		for i in terrain_count:
			terrain_weights.append(1.0)

	# Inspect terrain layer TileSet sources and build atlas choices for terrain indices
	var atlas_choices: Array = [] # Array[{ sid:int, atlas:Vector2i }]
	var scount := tileset.get_source_count()
	# Build a set of valid source ids on this TileSet to validate mappings
	var valid_sids: Dictionary = {}
	for i in scount:
		var sid_i := tileset.get_source_id(i)
		var src_i := tileset.get_source(sid_i)
		valid_sids[sid_i] = true
		if src_i is TileSetAtlasSource:
			# Derive columns from texture/region size if possible
			var cols := 1
			if src_i.texture != null and src_i.texture_region_size.x > 0:
				var tw := int(src_i.texture.get_width())
				cols = max(1, int(tw / int(src_i.texture_region_size.x)))
			# Prefer first row tiles
			for cx in cols:
				atlas_choices.append({"sid": sid_i, "atlas": Vector2i(cx, 0)})
	# Fallback if none detected
	if atlas_choices.size() == 0:
		atlas_choices.append({"sid": (tileset.get_source_id(0) if tileset.get_source_count() > 0 else 0), "atlas": Vector2i(0, 0)})
	print("[LocaleScreen][Tiles] TileSet sources=", scount, " atlas_choices=", atlas_choices.size())
	# Preview index->tile mapping for current terrain_count
	var preview_max: int = min(terrain_count, atlas_choices.size())
	for i in preview_max:
		var ch: Dictionary = atlas_choices[i]
		var sidp: int = int(ch["sid"])
		var srcp = tileset.get_source(sidp)
		var namep: String = (srcp.resource_name if srcp != null else "")
		var tname := (terrain_names[i] if i < terrain_names.size() else "")
		print("[LocaleScreen][Tiles] idx=", i, " (", tname, ") -> sid=", sidp, " atlas=", ch["atlas"], " src_name=", namep)

	# Prefer explicit mapping via GameManager tileset metadata (terrain->neighbour tilesets)
	var index_tile_choices: Array = []
	var tree := Engine.get_main_loop() as SceneTree
	if tree and tree.root.has_node("GameManager") and current_locale != null and str(current_locale.biome) != "":
		var gm = tree.root.get_node("GameManager")
		if gm and gm.has_method("get_terrain_tile_mapping_for_biome"):
			var biome2: Biome = await BIOME_DAL.fetch_by_id(str(current_locale.biome))
			if biome2 != null:
				index_tile_choices = gm.get_terrain_tile_mapping_for_biome(biome2)
				print("[LocaleScreen][Tiles] index_tile_choices size=", index_tile_choices.size())
				# Filter out mappings that do not exist on this TileSet instance
				for mi in index_tile_choices.size():
					var m = index_tile_choices[mi]
					if typeof(m) == TYPE_DICTIONARY and m.has("sid"):
						var msid := int(m["sid"])
						if not valid_sids.has(msid) or tileset.get_source(msid) == null:
							print("[LocaleScreen][Tiles][WARN] Mapping sid not on this TileSet; idx=", mi, " sid=", msid)
							index_tile_choices[mi] = {} # invalidate so fallback is used

	# Prepare noise source
	var noise_src: Noise = null
	if noise_height_texture != null:
		noise_src = noise_height_texture.noise
	if noise_src == null:
		noise_src = FastNoiseLite.new()

	# First pass: scan noise to collect min/max
	_terrain_index_grid = []
	_terrain_index_grid.resize(height)
	var min_raw := 999999.0
	var max_raw := -999999.0
	var min_01 := 999999.0
	var max_01 := -999999.0
	for y in height:
		for x in width:
			var n: float = 0.0
			if noise_src is FastNoiseLite:
				n = (noise_src as FastNoiseLite).get_noise_2d(float(x) * noise_scale, float(y) * noise_scale)
			else:
				n = noise_src.get_noise_2d(float(x) * noise_scale, float(y) * noise_scale)
			# Shift noise into ~[0,1] by adding 0.5 (noise ~[-0.5,0.5])
			var n01 := n + 0.5
			# Track min/max for logging
			if n < min_raw:
				min_raw = n
			if n > max_raw:
				max_raw = n
			if n01 < min_01:
				min_01 = n01
			if n01 > max_01:
				max_01 = n01

	# Build cumulative thresholds from weights
	var total_w := 0.0
	for w_i in terrain_weights:
		total_w += float(w_i)
	if total_w <= 0.0:
		total_w = float(terrain_count)
		terrain_weights.clear()
		for i in terrain_count:
			terrain_weights.append(1.0)
	var cuts: Array[float] = []
	var acc := 0.0
	for w_i in terrain_weights:
		acc += float(w_i) / total_w
		cuts.append(acc)
	# Ensure last cut is exactly 1.0
	if cuts.size() > 0:
		cuts[cuts.size() - 1] = 1.0

	# Second pass: fill the grid using weighted thresholds
	var counts := PackedInt32Array()
	counts.resize(terrain_count)
	for y in height:
		var row := PackedInt32Array()
		row.resize(width)
		for x in width:
			var n: float = 0.0
			if noise_src is FastNoiseLite:
				n = (noise_src as FastNoiseLite).get_noise_2d(float(x) * noise_scale, float(y) * noise_scale)
			else:
				n = noise_src.get_noise_2d(float(x) * noise_scale, float(y) * noise_scale)
			# Shift noise into ~[0,1] by adding 0.5 (noise ~[-0.5,0.5])
			var n01 := n + 0.5
			var n01_adj := n01
			if USE_OBSERVED_NOISE_RANGE and max_01 > min_01:
				n01_adj = clamp((n01 - min_01) / (max_01 - min_01), 0.0, 1.0)
			# Find bucket by cuts
			var idx := 0
			while idx < cuts.size() and n01_adj > cuts[idx]:
				idx += 1
			idx = clamp(idx, 0, max(0, terrain_count - 1))
			row[x] = idx
			counts[idx] = counts[idx] + 1
		_terrain_index_grid[y] = row

	# Log noise stats and thresholds with terrain names
	var fmt := func(v: float) -> String:
		return String.num(v, 4)
	print("[LocaleScreen][Noise] raw_min=", fmt.call(min_raw), " raw_max=", fmt.call(max_raw),
		" n01_min=", fmt.call(min_01), " n01_max=", fmt.call(max_01), " samples=", width * height)
	print("[LocaleScreen][Noise] weights= ", terrain_weights)
	# Thresholds: index i covers cumulative normalized ranges from weights
	var prev := 0.0
	for i in terrain_count:
		var high := cuts[i]
		var low := prev
		prev = high
		var low_abs := min_01 + low * (max_01 - min_01)
		var high_abs := min_01 + high * (max_01 - min_01)
		var name_i := terrain_names[i] if i < terrain_names.size() else ("Terrain " + str(i))
		var bracket := "]" if i == terrain_count - 1 else ")"
		if USE_OBSERVED_NOISE_RANGE:
			print("[LocaleScreen][Noise] idx=", i,
				" norm=[", fmt.call(low), ", ", fmt.call(high), bracket,
				"] abs=[", fmt.call(low_abs), ", ", fmt.call(high_abs), bracket,
				"] -> ", name_i)
		else:
			print("[LocaleScreen][Noise] idx=", i, " range= [", fmt.call(low), ", ", fmt.call(high), bracket, " -> ", name_i)

	# Paint base tiles onto the Terrain TileMapLayer using first source id and columns 0/1
	if terrain_layer.has_method("clear"):
		terrain_layer.clear()
	var source_id: int = 0
	if tileset.get_source_count() > 0:
		source_id = tileset.get_source_id(0) # should be 0 for the built-in isometric tileset
	for y in height:
		for x in width:
			var idx: int = int((_terrain_index_grid[y] as PackedInt32Array)[x])
			var atlas_x := 0 if idx == 0 else 1
			terrain_layer.set_cell(Vector2i(x, y), source_id, Vector2i(atlas_x, 0), 0)

	# Log distribution of assigned indices
	print("[LocaleScreen][Noise] counts per index=", counts)
	# Quick sanity: used rect of terrain layer after placement
	if terrain_layer.has_method("get_used_rect"):
		var used_rect: Rect2i = terrain_layer.get_used_rect()
		print("[LocaleScreen][Tiles] Terrain used_rect=", used_rect)
	if terrain_layer.has_method("queue_redraw"):
		terrain_layer.queue_redraw()

func _unhandled_input(event: InputEvent) -> void:
	# Log default UI actions to verify detection
	if event.is_action_pressed("ui_left"):
		print("[LocaleScreen][Input] ui_left pressed")
	if event.is_action_released("ui_left"):
		print("[LocaleScreen][Input] ui_left released")
	if event.is_action_pressed("ui_right"):
		print("[LocaleScreen][Input] ui_right pressed")
	if event.is_action_released("ui_right"):
		print("[LocaleScreen][Input] ui_right released")
	if event.is_action_pressed("ui_up"):
		print("[LocaleScreen][Input] ui_up pressed")
	if event.is_action_released("ui_up"):
		print("[LocaleScreen][Input] ui_up released")
	if event.is_action_pressed("ui_down"):
		print("[LocaleScreen][Input] ui_down pressed")
	if event.is_action_released("ui_down"):
		print("[LocaleScreen][Input] ui_down released")

func _process(delta: float) -> void:
	# Smooth keyboard panning of the terrain tile map layer using built-in UI actions
	if not visible:
		return
	var tl: Node2D = null
	if terrain_layer != null:
		tl = terrain_layer as Node2D
	elif has_node("Terrain"):
		terrain_layer = $Terrain
		tl = terrain_layer as Node2D
	if tl == null:
		return
	var dir := Vector2.ZERO
	if Input.is_action_pressed("ui_left"):
		dir.x -= 1.0
	if Input.is_action_pressed("ui_right"):
		dir.x += 1.0
	if Input.is_action_pressed("ui_up"):
		dir.y -= 1.0
	if Input.is_action_pressed("ui_down"):
		dir.y += 1.0
	if dir != Vector2.ZERO:
		dir = dir.normalized()
		tl.position += dir * pan_speed * delta
		# One-line log to confirm movement without spamming too much
		print("[LocaleScreen] Pan dir=", dir, " speed=", pan_speed)
