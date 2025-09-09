class_name Building
extends Resource

var id: String = ""
var name: String = ""
var type: String = ""
var description: String = ""
var locale: Variant = null # id or object
var rooms: Array[Room] = []

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("type"): type = str(data.type)
    if data.has("description"): description = str(data.description)
    if data.has("locale"): locale = data.locale
    rooms = []
    if data.has("rooms") and data.rooms is Array:
        for r in data.rooms:
            rooms.append(Room.new(r))

static func from_dict(d: Dictionary) -> Building:
    return Building.new(d)

func to_dict() -> Dictionary:
    var out := {
        "id": id,
        "name": name,
        "type": type,
        "description": description,
        "locale": locale,
        "rooms": []
    }
    for r in rooms:
        if r is Room:
            out.rooms.append(r.to_dict())
    return out
