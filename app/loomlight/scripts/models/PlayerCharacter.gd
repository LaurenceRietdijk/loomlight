class_name PlayerCharacter
extends Resource

const WORLD = preload("res://scripts/models/World.gd")

var id: String = ""
var name: String = "Unnamed"
var clazz: String = ""
var level: int = 1
var active_world_id: String = ""
var quests: Array = [] # active quests ids for the selected world

func _init(data: Dictionary = {}):
    if data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("class"): clazz = str(data["class"]) # avoid keyword
    if data.has("level"): level = int(data.level)
    if data.has("quests") and data.quests is Array:
        quests = data.quests.duplicate(true)

static func from_dict(d: Dictionary) -> PlayerCharacter:
    return PlayerCharacter.new(d)

func to_dict() -> Dictionary:
    return {
        "id": id,
        "name": name,
        "class": clazz,
        "level": level,
        "quests": quests,
    }

# Initialize active state for a world: ensure active doc exists and merge quests
func init_for_world(world: World) -> void:
    if id == "" or world == null:
        return
    var wid := str(world.db_world_id if world.db_world_id != "" else world.id)
    if wid == "":
        return
    var dal := CharacterDAL.new()
    var active: Dictionary = await dal.ensure_active(wid, id)
    if active is Dictionary and active.size() > 0:
        active_world_id = wid
        if active.has("quests") and active.quests is Array:
            quests = active.quests.duplicate(true)
            # Ask world to ensure quests are hydrated in its cache
            var qmap: Dictionary = await world.ensure_quests(quests)
            # Initialize accepted quests (runtime setup) and compute progress
            for k in qmap.keys():
                var q: Quest = qmap[k]
                if q is Quest and String(q.state).to_lower() == "acepted":
                    await q.init(world)
                    await q.update_progress(world)
    else:
        # On failure, still record world id for future attempts
        active_world_id = wid

