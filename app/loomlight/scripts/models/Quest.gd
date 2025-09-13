class_name Quest
extends Resource

## Subclasses are loaded on demand in from_dict() to avoid circular preloads

var id: String = ""
var title: String = ""
var description: String = ""
var quest_type: String = "" # matches questType
var state: String = "" # avaliable|acepted|completed|failed
var accepted_by: String = "" # active player character id

# Common optional fields (present in different types)
var item: Variant = null
var quantity: int = 0
var source: LocationRef = null
var pickup: LocationRef = null
var dropoff: LocationRef = null
var recipient: Variant = null
var target_character: Variant = null
var target_faction: Variant = null
var area: LocationRef = null
var gather_resource_name: String = ""
var target_locale: Variant = null
var enemies_remaining: int = 0
var count: int = 0
var coordinates := Vector2(NAN, NAN)
var area_name: String = ""
var progress: String = ""

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("title"): title = str(data.title)
    if data.has("description"): description = str(data.description)
    if data.has("questType"): quest_type = str(data.questType)
    elif data.has("type"): quest_type = str(data.type)
    if data.has("state"): state = str(data.state)
    if data.has("acceptedBy"): accepted_by = str(data.acceptedBy)

    if data.has("item"): item = data.item
    if data.has("quantity"): quantity = int(data.quantity)
    if data.has("source") and data.source is Dictionary: source = LocationRef.new(data.source)
    if data.has("pickup") and data.pickup is Dictionary: pickup = LocationRef.new(data.pickup)
    if data.has("dropoff") and data.dropoff is Dictionary: dropoff = LocationRef.new(data.dropoff)
    if data.has("recipient"): recipient = data.recipient
    if data.has("targetCharacter"): target_character = data.targetCharacter
    if data.has("targetFaction"): target_faction = data.targetFaction
    if data.has("area") and data.area is Dictionary: area = LocationRef.new(data.area)
    if data.has("resourceName"): gather_resource_name = str(data.resourceName)
    if data.has("targetLocale"): target_locale = data.targetLocale
    if data.has("enemiesRemaining"): enemies_remaining = int(data.enemiesRemaining)
    if data.has("count"): count = int(data.count)
    if data.has("coordinates") and data.coordinates is Dictionary:
        var x = data.coordinates.get("x", null)
        var y = data.coordinates.get("y", null)
        if x != null and y != null:
            coordinates = Vector2(float(x), float(y))
    if data.has("areaName"): area_name = str(data.areaName)

static func from_dict(d: Dictionary) -> Quest:
    var t := String(d.get("questType", d.get("type", "")))
    var low := t.to_lower()
    match low:
        "clear":
            return load("res://scripts/models/ClearQuest.gd").new(d)
        "kill":
            return load("res://scripts/models/KillQuest.gd").new(d)
        "fetch":
            return load("res://scripts/models/FetchQuest.gd").new(d)
        "deliver":
            return load("res://scripts/models/DeliverQuest.gd").new(d)
        "gather":
            return load("res://scripts/models/GatherQuest.gd").new(d)
        "explore":
            return load("res://scripts/models/ExploreQuest.gd").new(d)
        _:
            return Quest.new(d)

func progress_text() -> String:
    var low := quest_type.to_lower()
    if low == "kill":
        var who := ""
        if target_faction != null:
            who = "enemies"
        elif target_character != null:
            who = "target(s)"
        else:
            who = "enemies"
        return "Defeat %d %s" % [max(1, count), who]
    if low == "fetch":
        return "Collect %d item(s)" % [max(1, quantity)]
    if low == "deliver":
        return "Deliver %d item(s)" % [max(1, quantity)]
    if low == "gather":
        var res := gather_resource_name if gather_resource_name != "" else "resources"
        return "Gather %d %s" % [max(1, quantity), res]
    if low == "explore":
        return "Explore the target area"
    if low == "clear":
        return "%d enemies remaining" % max(0, enemies_remaining)
    return ""

func to_dict() -> Dictionary:
    var out := {
        "id": id,
        "title": title,
        "description": description,
        "questType": quest_type,
        "state": state,
        "acceptedBy": accepted_by,
        "item": item,
        "quantity": quantity,
        "recipient": recipient,
        "targetCharacter": target_character,
        "targetFaction": target_faction,
        "resourceName": gather_resource_name,
        "targetLocale": target_locale,
        "enemiesRemaining": enemies_remaining,
        "count": count,
        "areaName": area_name,
    }
    if source != null: out["source"] = source.to_dict()
    if pickup != null: out["pickup"] = pickup.to_dict()
    if dropoff != null: out["dropoff"] = dropoff.to_dict()
    if area != null: out["area"] = area.to_dict()
    if not is_nan(coordinates.x) and not is_nan(coordinates.y):
        out["coordinates"] = {"x": coordinates.x, "y": coordinates.y}
    if progress != "":
        out["progress"] = progress
    return out

# Runtime initialization hook for quest instances.
# Subclasses may override to set up references, preload data, etc.
func init(world) -> void:
    # Base quest has no special runtime setup.
    pass

# Compute or refresh human-readable progress text for this quest.
func update_progress(world) -> void:
    progress = progress_text()


# Derived classes moved to individual files with class_name for clarity.
