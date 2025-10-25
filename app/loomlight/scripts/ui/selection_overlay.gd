extends Node2D

var world_map: Node2D = null
var selected_cell: Vector2i = Vector2i(-2147483648, -2147483648)

func update_selection(wm: Node2D, cell: Vector2i) -> void:
    world_map = wm
    selected_cell = cell
    queue_redraw()

func _draw() -> void:
    if world_map == null:
        return
    if selected_cell.x == -2147483648:
        return

    var center_local_in_worldmap: Vector2
    if world_map.has_method("map_to_local"):
        center_local_in_worldmap = world_map.call("map_to_local", selected_cell)
    else:
        var ts: TileSet = world_map.get("tile_set") if world_map.has_method("get") else null
        var sz: Vector2i = ts.tile_size if ts != null else Vector2i(128, 64)
        center_local_in_worldmap = Vector2(selected_cell.x * float(sz.x), selected_cell.y * float(sz.y))

    var global_center: Vector2 = world_map.to_global(center_local_in_worldmap)
    var draw_center: Vector2 = to_local(global_center)

    var ts2: TileSet = world_map.get("tile_set") if world_map.has_method("get") else null
    var size: Vector2i = ts2.tile_size if ts2 != null else Vector2i(128, 64)
    var hw := float(size.x) * 0.5
    var hh := float(size.y) * 0.5

    var pts := PackedVector2Array([
        draw_center + Vector2(0, -hh),
        draw_center + Vector2(hw, 0),
        draw_center + Vector2(0, hh),
        draw_center + Vector2(-hw, 0)
    ])

    draw_colored_polygon(pts, Color(1, 1, 0, 0.18))
    var loop_pts := pts.duplicate()
    loop_pts.append(pts[0])
    draw_polyline(loop_pts, Color(1, 1, 0, 0.85), 2.0, true)


