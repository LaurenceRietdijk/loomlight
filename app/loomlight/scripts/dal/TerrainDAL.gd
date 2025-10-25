class_name TerrainDAL
extends Object

## Data Access for Terrains (global)

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

static func fetch_by_id(id: String) -> Dictionary:
    var api := _api()
    if api == null:
        return {}
    var path := "/terrain/%s" % [id]
    var result: Dictionary = await api.get_json(path)
    if bool(result.get("ok", false)):
        var data = result.get("data")
        if data is Dictionary and data.has("terrain"):
            return data.terrain
        elif data is Dictionary:
            return data
    return {}

static func fetch_all() -> Array:
    var api := _api()
    if api == null:
        return []
    var result: Dictionary = await api.get_json("/terrain")
    if bool(result.get("ok", false)):
        var data = result.get("data")
        if data is Dictionary and data.has("terrains") and data.terrains is Array:
            return data.terrains
        elif data is Array:
            return data
    return []


