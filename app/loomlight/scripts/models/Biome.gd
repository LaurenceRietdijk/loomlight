class_name Biome
extends Resource

## Global biome model (not per-world)

var id: String = ""
var name: String = ""
var description: String = ""
var locales: Dictionary = {} # map of locale type -> bool
var terrains: Array[String] = [] # list of terrain ids (order preserved)
var terrain_weights: Dictionary = {} # id -> float weight

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("description"): description = str(data.description)
    if data.has("locales") and data.locales is Dictionary:
        locales = data.locales.duplicate(true)
    if data.has("terrains") and data.terrains is Array:
        terrains = []
        terrain_weights = {}
        for t in data.terrains:
            # New weighted shape: { terrain: <id>, weight: <number> }
            if typeof(t) == TYPE_DICTIONARY and t.has("terrain"):
                var sid := str(t.terrain)
                if sid.length() > 0:
                    terrains.append(sid)
                    var w := 1.0
                    if t.has("weight") and typeof(t.weight) in [TYPE_INT, TYPE_FLOAT]:
                        w = float(t.weight)
                    terrain_weights[sid] = w
            # Legacy shapes
            elif typeof(t) == TYPE_DICTIONARY and t.has("_id"):
                var sid2 := str(t._id)
                if sid2.length() > 0:
                    terrains.append(sid2)
                    terrain_weights[sid2] = 1.0
            elif typeof(t) == TYPE_STRING:
                var sid3 := str(t)
                if sid3.length() > 0:
                    terrains.append(sid3)
                    terrain_weights[sid3] = 1.0

static func from_dict(d: Dictionary) -> Biome:
    return Biome.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "name": name,
        "description": description,
        "terrains": terrains,
        "locales": locales,
    }

func allows_locale_type(locale_type: String) -> bool:
    return bool(locales.get(locale_type, false))

