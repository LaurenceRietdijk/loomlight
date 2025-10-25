class_name Character
extends Resource

signal state_changed(character: Character, old_status: String, new_status: String)

var id: String = ""
var name: String = ""
var title: String = ""
var description: String = ""
var personality: String = ""
var race: String = ""
var age: int = -1
var gender: String = "unknown"

var faction: Variant = null # id or object
var location := {
    "locale": null,
    "building": null,
    "room": null,
}
var home: Variant = null
var work: Variant = null
var role: String = ""

var _status: String = "active"
var status: String:
    get:
        return _status
    set(value):
        set_status(value)

var relationships: Array = []
var quests: Array = []

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("title"): title = str(data.title)
    if data.has("description"): description = str(data.description)
    if data.has("personality"): personality = str(data.personality)
    if data.has("race"): race = str(data.race)
    if data.has("age"): age = int(data.age)
    if data.has("gender"): gender = str(data.gender)
    if data.has("faction"): faction = data.faction

    if data.has("location") and data.location is Dictionary:
        location = {
            "locale": data.location.get("locale", null),
            "building": data.location.get("building", null),
            "room": data.location.get("room", null),
        }
    if data.has("home"): home = data.home
    if data.has("work"): work = data.work
    if data.has("role"): role = str(data.role)
    if data.has("status"): _status = str(data.status)

    if data.has("relationships") and data.relationships is Array:
        relationships = data.relationships.duplicate(true)
    if data.has("quests") and data.quests is Array:
        quests = data.quests.duplicate(true)

static func from_dict(d: Dictionary) -> Character:
    return Character.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "name": name,
        "title": title,
        "description": description,
        "personality": personality,
        "race": race,
        "age": age,
        "gender": gender,
        "faction": faction,
        "location": location,
        "home": home,
        "work": work,
        "role": role,
        "status": _status,
        "relationships": relationships,
        "quests": quests,
    }

func get_status() -> String:
    return _status

func set_status(value: String) -> void:
    var v := str(value)
    if v == _status:
        return
    var old := _status
    _status = v
    emit_signal("state_changed", self, old, _status)

