class_name ItemContainer
extends Resource

var id: String = ""
var name: String = ""
var type: String = ""
var items: Array[Item] = []

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("type"): type = str(data.type)
    items = []
    if data.has("items") and data.items is Array:
        for it in data.items:
            items.append(Item.new(it))

static func from_dict(d: Dictionary) -> ItemContainer:
    return ItemContainer.new(d)

func to_dict() -> Dictionary:
    var out := {
        "id": id,
        "name": name,
        "type": type,
        "items": []
    }
    for it in items:
        if it is Item:
            out.items.append(it.to_dict())
    return out
