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
    var api := _api()
    if api == null:
        return []
    var result: Dictionary = await api.get_json(PATH_ALL)
    var ok: bool = bool(result.get("ok", false))
    if ok:
        var data = result.get("data")
        var list: Array = []
        if data is Array:
            list = data
        elif data is Dictionary and data.has("playerCharacters") and data.playerCharacters is Array:
            list = data.playerCharacters
        else:
            return []

        var chars: Array[PlayerCharacter] = []
        for c in list:
            chars.append(PlayerCharacter.new(c))
        return chars
    return []

static func fetch_by_world(world_id: String) -> Array[PlayerCharacter]:
    var path := PATH_ALL # no world-scoped endpoint; list all
    var api := _api()
    if api == null:
        return []
    var result: Dictionary = await api.get_json(path)
    var ok: bool = bool(result.get("ok", false))
    if ok:
        var data = result.get("data")
        var list: Array = []
        if data is Array:
            list = data
        elif data is Dictionary and data.has("playerCharacters") and data.playerCharacters is Array:
            list = data.playerCharacters
        else:
            return []

        var chars: Array[PlayerCharacter] = []
        for c in list:
            chars.append(PlayerCharacter.new(c))
        return chars
    return []

## Ensure an ActivePlayerCharacter doc exists for this player in the target world
## Returns the active document (with quests array), creating it if missing
func ensure_active(world_id: String, player_character_id: String) -> Dictionary:
    var api := CharacterDAL._api()
    if api == null:
        return {}
    var payload := {
        "world_id": world_id,
        "player_character_id": player_character_id,
    }
    var result: Dictionary = await api.post_json(PATH_ACTIVE_ENTER, payload)
    var ok: bool = bool(result.get("ok", false))
    if ok:
        var data = result.get("data")
        if data is Dictionary and data.has("activePlayerCharacter"):
            return data.activePlayerCharacter
        else:
            return {}
    return {}

