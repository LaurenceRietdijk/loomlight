class_name Faction
extends Resource

var id: String = ""
var name: String = ""
var description: String = ""
var alignment: String = ""
var locales: Array = []
var members: Array = [] # [{ _id, role, status }]
var resources := {
    "wealth": "",
    "military_strength": "",
    "political_influence": "",
}

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("description"): description = str(data.description)
    if data.has("alignment"): alignment = str(data.alignment)
    if data.has("locales") and data.locales is Array:
        locales = data.locales.duplicate(true)
    if data.has("members") and data.members is Array:
        members = data.members.duplicate(true)
    if data.has("resources") and data.resources is Dictionary:
        var r = data.resources
        resources.wealth = str(r.get("wealth", resources.wealth))
        resources.military_strength = str(r.get("military_strength", resources.military_strength))
        resources.political_influence = str(r.get("political_influence", resources.political_influence))

static func from_dict(d: Dictionary) -> Faction:
    return Faction.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "name": name,
        "description": description,
        "alignment": alignment,
        "locales": locales,
        "members": members,
        "resources": resources,
    }


