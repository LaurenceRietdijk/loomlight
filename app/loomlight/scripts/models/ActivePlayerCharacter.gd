class_name ActivePlayerCharacter
extends Resource

var id: String = "" # matches PlayerCharacter id
var quests: Array = [] # array of quest ids

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("quests") and data.quests is Array:
        quests = data.quests.duplicate(true)

static func from_dict(d: Dictionary) -> ActivePlayerCharacter:
    return ActivePlayerCharacter.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "quests": quests,
    }

