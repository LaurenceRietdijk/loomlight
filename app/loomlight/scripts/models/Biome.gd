class_name Biome
extends Resource

## Global biome model (not per-world)

var id: String = ""
var name: String = ""
var description: String = ""
var locales: Dictionary = {} # map of locale type -> bool

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("description"): description = str(data.description)
    if data.has("locales") and data.locales is Dictionary:
        locales = data.locales.duplicate(true)

static func from_dict(d: Dictionary) -> Biome:
    return Biome.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "name": name,
        "description": description,
        "locales": locales,
    }

func allows_locale_type(locale_type: String) -> bool:
    return bool(locales.get(locale_type, false))

