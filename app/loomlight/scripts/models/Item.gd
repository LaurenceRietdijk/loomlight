class_name Item
extends Resource

var id: String = ""
var name: String = ""
var type: String = ""
var description: String = ""

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("type"): type = str(data.type)
    if data.has("description"): description = str(data.description)

static func from_dict(d: Dictionary) -> Item:
    return Item.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "name": name,
        "type": type,
        "description": description,
    }

