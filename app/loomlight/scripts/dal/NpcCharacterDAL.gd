class_name NpcCharacterDAL
extends Object

## Data Access for NPC Characters (per-world DB)

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

static func fetch_one(world_id: String, character_id: String, full: bool = false):
    var api := _api()
    if api == null:
        print("[NpcCharacterDAL] ERROR: ApiClient autoload not found")
        return null
    var path := "/character/full" if full else "/character"
    var qs := "world_id=%s&character_id=%s" % [world_id, character_id]
    var result: Dictionary = await api.get_json(path + "?" + qs)
    var ok: bool = bool(result.get("ok", false))
    if ok:
        var data = result.get("data")
        var raw = (data.character if (data is Dictionary and data.has("character")) else data)
        if raw != null:
            return Character.new(raw)
    else:
        var err_text: String = str(result.get("error", ""))
        print("[NpcCharacterDAL] ERROR: ", err_text)
    return null

static func fetch_many(world_id: String, ids: Array, full: bool = false) -> Dictionary:
    var out: Dictionary = {}
    for any_id in (ids if ids is Array else []):
        var cid := str(any_id)
        if cid == "":
            continue
        var ch = await fetch_one(world_id, cid, full)
        if ch != null and ch.id != "":
            out[ch.id] = ch
    return out

