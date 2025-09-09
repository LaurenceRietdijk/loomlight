class_name WorldDAL
extends Object

## Data Access for Worlds

const PATH_ALL = "/world"

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

static func fetch_all() -> Array[World]:
    print("[WorldDAL] GET ", PATH_ALL)
    var api := _api()
    if api == null:
        print("[WorldDAL] ERROR: ApiClient autoload not found")
        return []
    var result: Dictionary = await api.get_json(PATH_ALL)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var list: Array = []
        if data is Array:
            list = data
        elif data is Dictionary and data.has("worlds") and data.worlds is Array:
            list = data.worlds
        else:
            print("[WorldDAL] Unexpected data shape: ", data)
            return []

        var worlds: Array[World] = []
        for w in list:
            worlds.append(World.new(w))
        print("[WorldDAL] OK ", code, ", count=", worlds.size())
        return worlds
    else:
        var err_text: String = str(result.get("error", ""))
        print("[WorldDAL] ERROR ", code, ": ", err_text)
    return []
