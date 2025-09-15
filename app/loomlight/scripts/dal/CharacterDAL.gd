class_name CharacterDAL
extends Object

## Data Access for Player Characters

const PATH_ALL = "/playerCharacter"
const PATH_BY_WORLD_FMT = "/worlds/%s/characters" # not available; fallback to PATH_ALL
const PATH_ACTIVE_ENTER = "/activePlayerCharacter/enter"

static func _api() -> Node:
    var tree := Engine.get_main_loop() as SceneTree
    if tree and tree.root.has_node("ApiClient"):
        return tree.root.get_node("ApiClient")
    return null

static func fetch_all() -> Array[PlayerCharacter]:
    print("[CharacterDAL] GET ", PATH_ALL)
    var api := _api()
    if api == null:
        print("[CharacterDAL] ERROR: ApiClient autoload not found")
        return []
    var result: Dictionary = await api.get_json(PATH_ALL)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var list: Array = []
        if data is Array:
            list = data
        elif data is Dictionary and data.has("playerCharacters") and data.playerCharacters is Array:
            list = data.playerCharacters
        else:
            print("[CharacterDAL] Unexpected data shape: ", data)
            return []

        var chars: Array[PlayerCharacter] = []
        for c in list:
            chars.append(PlayerCharacter.new(c))
        print("[CharacterDAL] OK ", code, ", count=", chars.size())
        return chars
    else:
        var err_text: String = str(result.get("error", ""))
        print("[CharacterDAL] ERROR ", code, ": ", err_text)
    return []

static func fetch_by_world(world_id: String) -> Array[PlayerCharacter]:
    var path := PATH_ALL # no world-scoped endpoint; list all
    print("[CharacterDAL] GET ", path, " (world=", world_id, ")")
    var api := _api()
    if api == null:
        print("[CharacterDAL] ERROR: ApiClient autoload not found (world=", world_id, ")")
        return []
    var result: Dictionary = await api.get_json(path)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        var list: Array = []
        if data is Array:
            list = data
        elif data is Dictionary and data.has("playerCharacters") and data.playerCharacters is Array:
            list = data.playerCharacters
        else:
            print("[CharacterDAL] Unexpected data shape: ", data, " for world=", world_id)
            return []

        var chars: Array[PlayerCharacter] = []
        for c in list:
            chars.append(PlayerCharacter.new(c))
        print("[CharacterDAL] OK ", code, ", count=", chars.size(), ", world=", world_id)
        return chars
    else:
        var err_text: String = str(result.get("error", ""))
        print("[CharacterDAL] ERROR ", code, ": ", err_text, ", world=", world_id)
    return []

## Ensure an ActivePlayerCharacter doc exists for this player in the target world
## Returns the active document (with quests array), creating it if missing
func ensure_active(world_id: String, player_character_id: String) -> Dictionary:
    var api := CharacterDAL._api()
    if api == null:
        print("[CharacterDAL] ERROR: ApiClient autoload not found (ensure_active)")
        return {}
    var payload := {
        "world_id": world_id,
        "player_character_id": player_character_id,
    }
    print("[CharacterDAL] POST ", PATH_ACTIVE_ENTER, " (world=", world_id, ", pc=", player_character_id, ")")
    var result: Dictionary = await api.post_json(PATH_ACTIVE_ENTER, payload)
    var ok: bool = bool(result.get("ok", false))
    var code: int = int(result.get("code", -1))
    if ok:
        var data = result.get("data")
        if data is Dictionary and data.has("activePlayerCharacter"):
            print("[CharacterDAL] ensure_active OK ", code)
            return data.activePlayerCharacter
        else:
            print("[CharacterDAL] ensure_active: unexpected data shape: ", data)
            return {}
    else:
        var err_text: String = str(result.get("error", ""))
        print("[CharacterDAL] ensure_active ERROR ", code, ": ", err_text)
    return {}
