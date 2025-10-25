class_name LocaleDAL
extends Object

## Data Access for Locales (per-world DB)

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

## Fetch dehydrated locales for a world: id, name, type, coordinates
static func fetch_list(world_id: String) -> Array[Locale]:
    var api := _api()
    if api == null:
        print("[LocaleDAL] ERROR: ApiClient autoload not found")
        return []
    var path := "/locale/list?world_id=" + world_id
    print("[LocaleDAL] GET ", path)
    var result: Dictionary = await api.get_json(path)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var list: Array = []
        if data is Dictionary and data.has("locales") and data.locales is Array:
            list = data.locales
        elif data is Array:
            list = data
        else:
            print("[LocaleDAL] Unexpected data shape: ", data)
            return []
        var out: Array[Locale] = []
        for d in list:
            out.append(Locale.new(d))
        print("[LocaleDAL] OK ", code, ", count=", out.size())
        return out
    else:
        var err_text: String = str(result.get("error", ""))
        print("[LocaleDAL] ERROR ", code, ": ", err_text)
    return []

## Fetch a single locale by id (full populated doc)
static func fetch_by_id(world_id: String, id: String) -> Locale:
    var api := _api()
    if api == null:
        print("[LocaleDAL] ERROR: ApiClient autoload not found")
        return null
    var path := "/locale/byId?world_id=%s&id=%s" % [world_id, id]
    print("[LocaleDAL] GET ", path)
    var result: Dictionary = await api.get_json(path)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var doc = null
        if data is Dictionary and data.has("locale"):
            doc = data.locale
        elif data is Dictionary:
            doc = data
        if doc != null:
            print("[LocaleDAL] OK ", code)
            return Locale.new(doc)
    else:
        var err_text: String = str(result.get("error", ""))
        print("[LocaleDAL] ERROR ", code, ": ", err_text)
    return null

## Fetch many locales by ids. Returns Dictionary keyed by id -> Locale
static func fetch_many_by_ids(world_id: String, ids: Array) -> Dictionary:
    var api := _api()
    if api == null:
        print("[LocaleDAL] ERROR: ApiClient autoload not found")
        return {}
    var payload := { "world_id": world_id, "ids": ids }
    print("[LocaleDAL] POST /locale/byIds (count=", (ids.size() if ids is Array else 0), ")")
    var result: Dictionary = await api.post_json("/locale/byIds", payload)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var map: Dictionary = {}
        if data is Dictionary and data.has("localesById") and data.localesById is Dictionary:
            for key in data.localesById.keys():
                var raw = data.localesById[key]
                var loc: Locale = Locale.new(raw)
                map[str(key)] = loc
            print("[LocaleDAL] OK ", code, ", count=", map.size())
            return map
        else:
            print("[LocaleDAL] Unexpected data shape: ", data)
            return {}
    else:
        var err_text: String = str(result.get("error", ""))
        print("[LocaleDAL] ERROR ", code, ": ", err_text)
    return {}


