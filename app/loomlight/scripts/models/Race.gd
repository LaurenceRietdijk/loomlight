class_name Race
extends Resource

var id: String = ""
var name: String = ""
var classification: String = ""
var origins: Dictionary = {}
var physiology: Dictionary = {}
var intelligence: Dictionary = {}
var history: Dictionary = {}

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("classification"): classification = str(data.classification)
    if data.has("origins") and data.origins is Dictionary: origins = data.origins.duplicate(true)
    if data.has("physiology") and data.physiology is Dictionary: physiology = data.physiology.duplicate(true)
    if data.has("intelligence") and data.intelligence is Dictionary: intelligence = data.intelligence.duplicate(true)
    if data.has("history") and data.history is Dictionary: history = data.history.duplicate(true)

static func from_dict(d: Dictionary) -> Race:
    return Race.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "name": name,
        "classification": classification,
        "origins": origins,
        "physiology": physiology,
        "intelligence": intelligence,
        "history": history,
    }


