extends Node2D

signal tile_selected(cell: Vector2i)

@onready var world_map: Node2D = $WorldMap if has_node("WorldMap") else null
@onready var overlay: Node2D = $SelectionOverlay if has_node("SelectionOverlay") else null

# Panning config
var pan_mouse_button: int = MOUSE_BUTTON_RIGHT
var pan_active: bool = false
var pan_last_mouse_pos: Vector2 = Vector2.ZERO

# Selection state
var selected_cell: Vector2i = Vector2i(-2147483648, -2147483648)

func _ready() -> void:
	# Hidden by default; Game script controls visibility
	visible = false
	set_process_unhandled_input(true)
	# Overlay is added in the scene as a child (SelectionOverlay)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mbe := event as InputEventMouseButton
		# Begin/end panning with right mouse (or middle)
		if mbe.button_index == pan_mouse_button or mbe.button_index == MOUSE_BUTTON_MIDDLE:
			if mbe.pressed:
				pan_active = true
				pan_last_mouse_pos = mbe.position
			else:
				pan_active = false
		# Left-click selects a tile
		elif mbe.button_index == MOUSE_BUTTON_LEFT and mbe.pressed:
			_select_tile_at_global_pos(get_viewport().get_mouse_position())

	elif event is InputEventMouseMotion and pan_active:
		var mm := event as InputEventMouseMotion
		var delta := mm.position - pan_last_mouse_pos
		position += delta
		pan_last_mouse_pos = mm.position

func _select_tile_at_global_pos(gpos: Vector2) -> void:
	if world_map == null:
		if has_node("WorldMap"):
			world_map = $WorldMap
		else:
			return

	# Convert global mouse to the world_map's local space
	var local_in_worldmap: Vector2 = world_map.to_local(gpos)
	var cell: Vector2i

	if world_map.has_method("local_to_map"):
		cell = world_map.call("local_to_map", local_in_worldmap)
	else:
		# Fallback approximation based on tile size if helper not present
		var ts: TileSet = null
		if world_map.has_method("get"):
			ts = world_map.get("tile_set") as TileSet
		elif "tile_set" in world_map:
			ts = world_map.tile_set
		var sz: Vector2i = ts.tile_size if ts != null else Vector2i(128, 64)
		cell = Vector2i(round(local_in_worldmap.x / float(sz.x)), round(local_in_worldmap.y / float(sz.y)))

	selected_cell = cell
	if overlay != null:
		overlay.call_deferred("update_selection", world_map, selected_cell)
	else:
		queue_redraw()
	emit_signal("tile_selected", cell)

func _draw() -> void:
	# No-op: selection highlight is rendered in overlay child
	pass

func get_selected_cell() -> Vector2i:
	return selected_cell

func focus_cell(cell: Vector2i) -> void:
	# Center the view on a given map cell
	if world_map == null:
		return
	var center_local_in_worldmap: Vector2
	if world_map.has_method("map_to_local"):
		center_local_in_worldmap = world_map.call("map_to_local", cell)
	else:
		var ts: TileSet = world_map.get("tile_set") if world_map.has_method("get") else null
		var sz: Vector2i = ts.tile_size if ts != null else Vector2i(128, 64)
		center_local_in_worldmap = Vector2(cell.x * float(sz.x), cell.y * float(sz.y))

	var global_center: Vector2 = world_map.to_global(center_local_in_worldmap)
	# Move this MapView so the chosen cell appears at the viewport center
	var vp: Viewport = get_viewport()
	if vp == null:
		return
	var vp_center: Vector2 = vp.size * 0.5
	# position is in parent space; current global_center is in global; convert delta accordingly
	var current_local_of_global_center: Vector2 = to_local(global_center)
	position += (vp_center - current_local_of_global_center)

# (Removed duplicate @onready var world_map declaration and merged _ready bodies)

func refresh() -> void:
	if world_map and world_map.has_method("queue_redraw"):
		world_map.queue_redraw()
