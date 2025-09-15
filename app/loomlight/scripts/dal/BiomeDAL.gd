class_name BiomeDAL
extends Object

## Data Access for global Biomes

const BIOME = preload("res://scripts/models/Biome.gd")

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

## Fetch all global biomes
static func fetch_all() -> Array[Biome]:
    var api := _api()
    if api == null:
        print("[BiomeDAL] ERROR: ApiClient autoload not found")
        return []
    var path := "/biome"
    print("[BiomeDAL] GET ", path)
    var result: Dictionary = await api.get_json(path)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var list: Array = []
        if data is Dictionary and data.has("biomes") and data.biomes is Array:
            list = data.biomes
        elif data is Array:
            list = data
        else:
            print("[BiomeDAL] Unexpected data shape: ", data)
            return []
        var out: Array[Biome] = []
        for d in list:
            out.append(BIOME.new(d))
        print("[BiomeDAL] OK ", code, ", count=", out.size())
        return out
    else:
        var err_text: String = str(result.get("error", ""))
        print("[BiomeDAL] ERROR ", code, ": ", err_text)
    return []

## Fetch a single biome by id
static func fetch_by_id(id: String) -> Biome:
    var api := _api()
    if api == null:
        print("[BiomeDAL] ERROR: ApiClient autoload not found")
        return null
    var path := "/biome/%s" % [id]
    print("[BiomeDAL] GET ", path)
    var result: Dictionary = await api.get_json(path)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var doc = null
        if data is Dictionary and data.has("biome"):
            doc = data.biome
        elif data is Dictionary:
            doc = data
        if doc != null:
            print("[BiomeDAL] OK ", code)
            return BIOME.new(doc)
    else:
        var err_text: String = str(result.get("error", ""))
        print("[BiomeDAL] ERROR ", code, ": ", err_text)
    return null
