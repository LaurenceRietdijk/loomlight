class_name TilesetDAL
extends Object

## Data Access for Terrain Tilesets

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

static func fetch_by_id(id: String) -> Dictionary:
    var api := _api()
    if api == null:
        return {}
    var path := "/tileset/%s" % [id]
    var result: Dictionary = await api.get_json(path)
    if bool(result.get("ok", false)):
        var data = result.get("data")
        if data is Dictionary and data.has("tileset"):
            return data.tileset
        elif data is Dictionary:
            return data
    return {}


