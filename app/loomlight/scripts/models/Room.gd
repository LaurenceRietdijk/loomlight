class_name Room
extends Resource

var id: String = ""
var name: String = ""
var description: String = ""
var containers: Array[ItemContainer] = []

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("description"): description = str(data.description)
    containers = []
    if data.has("containers") and data.containers is Array:
        for c in data.containers:
            containers.append(ItemContainer.new(c))

static func from_dict(d: Dictionary) -> Room:
    return Room.new(d)

func to_dict() -> Dictionary:
    var out := {
        "id": id,
        "name": name,
        "description": description,
        "containers": []
    }
    for c in containers:
        if c is ItemContainer:
            out.containers.append(c.to_dict())
    return out

