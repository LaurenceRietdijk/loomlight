class_name QuestDAL
extends Object

## Data Access for Quests (per-world DB)

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

## Fetch a single quest by id (full populated doc)
static func fetch_one(world_id: String, quest_id: String) -> Quest:
    var api := _api()
    if api == null:
        print("[QuestDAL] ERROR: ApiClient autoload not found")
        return null
    var params := "world_id=%s&quest_id=%s" % [world_id, quest_id]
    var path := "/quest/full?" + params
    print("[QuestDAL] GET ", path)
    var result: Dictionary = await api.get_json(path)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var doc = null
        if data is Dictionary and data.has("quest"):
            doc = data.quest
        elif data is Dictionary:
            doc = data
        if doc != null:
            print("[QuestDAL] OK ", code)
            return Quest.from_dict(doc)
    else:
        var err_text: String = str(result.get("error", ""))
        print("[QuestDAL] ERROR ", code, ": ", err_text)
    return null

## Fetch many quests by ids; returns Dictionary id -> Quest
static func fetch_many(world_id: String, ids: Array) -> Dictionary:
    var out: Dictionary = {}
    for i in ids:
        var qid := str(i)
        if qid == "":
            continue
        var q: Quest = await fetch_one(world_id, qid)
        if q != null and q.id != "":
            out[q.id] = q
    return out

