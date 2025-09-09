class_name World
extends Resource

const LocaleDAL = preload("res://scripts/dal/LocaleDAL.gd")
const QuestDAL = preload("res://scripts/dal/QuestDAL.gd")
const NpcCharacterDAL = preload("res://scripts/dal/NpcCharacterDAL.gd")

var id: String = ""
var name: String = "Unnamed World"
var world_building: String = ""
var creator: String = ""
var db_world_id: String = "" # convenience alias for per-world DB name (same as id)

# Per-world DB collections (dictionaries keyed by id -> model)
var locales: Dictionary = {}
var buildings: Dictionary = {}
var items: Dictionary = {}
var rooms: Dictionary = {}
var factions: Dictionary = {}
var faction_pacts: Dictionary = {}
var races: Dictionary = {}
var events: Dictionary = {}
var quests: Dictionary = {}
var characters: Dictionary = {} # NPC/Character docs keyed by id
var active_player_characters: Dictionary = {}

# Optional cached associations (client-side)
var player_characters: Array = [] # Array[PlayerCharacter]

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    db_world_id = id
    if data.has("name"): name = str(data.name)
    if data.has("worldBuilding"): world_building = str(data.worldBuilding)
    if data.has("creator"): creator = str(data.creator)

static func from_dict(d: Dictionary) -> World:
    return World.new(d)

func to_dict() -> Dictionary:
    var out := {
        "id": id,
        "name": name,
        "worldBuilding": world_building,
        "creator": creator,
    }
    return out

# Initialize per-world collections needed at startup (dehydrated locales)
func init_collections(world_id: String = "") -> void:
    var wid := world_id if world_id != "" else (db_world_id if db_world_id != "" else id)
    if wid == "":
        print("[World] init_collections skipped: missing world id")
        return
    var list: Array[Locale] = await LocaleDAL.fetch_list(wid)
    locales.clear()
    for loc in list:
        if loc is Locale and loc.id != "":
            locales[loc.id] = loc
    # Keep db id handy
    db_world_id = wid

func get_locale(locale_id: String) -> Locale:
    return locales.get(str(locale_id), null)

# Ensure quests are present in cache; fetch missing by id via DAL
func ensure_quests(ids: Array) -> Dictionary:
    var result: Dictionary = {}
    var missing: Array = []
    for any_id in ids:
        var qid := str(any_id)
        if qid == "":
            continue
        if quests.has(qid):
            result[qid] = quests[qid]
        else:
            missing.append(qid)
    if missing.size() == 0:
        return result
    var wid := (db_world_id if db_world_id != "" else id)
    var fetched: Dictionary = await QuestDAL.fetch_many(wid, missing)
    for key in fetched.keys():
        var q: Quest = fetched[key]
        if q is Quest:
            quests[q.id] = q
            result[q.id] = q
    return result

func get_quest(quest_id: String) -> Quest:
    return quests.get(str(quest_id), null)

# Ensure locale exists in cache and is hydrated; returns the Locale
func ensure_locale(locale_id: String) -> Locale:
    var lid := str(locale_id)
    if lid == "":
        return null
    if locales.has(lid):
        var loc: Locale = locales[lid]
        if loc != null and loc._loaded_full:
            return loc
        await loc.ensure_loaded(db_world_id)
        await _ingest_locale(loc)
        return loc
    var fetched: Locale = await LocaleDAL.fetch_by_id((db_world_id if db_world_id != "" else id), lid)
    if fetched != null:
        locales[fetched.id] = fetched
        await _ingest_locale(fetched)
    return fetched

# Ingest a hydrated locale into world caches: buildings, rooms, items, characters
func _ingest_locale(loc: Locale) -> void:
    if loc == null:
        return
    # Buildings/Rooms/Items
    for b in (loc.buildings if loc.buildings is Array else []):
        if b is Building and b.id != "":
            buildings[b.id] = b
            for r in (b.rooms if b.rooms is Array else []):
                if r is Room and r.id != "":
                    rooms[r.id] = r
                    for c in (r.containers if r.containers is Array else []):
                        if c is ItemContainer:
                            for it in (c.items if c.items is Array else []):
                                if it is Item and it.id != "":
                                    items[it.id] = it
    # Characters (light ids present in loc.characters)
    var ids: Array = []
    for ref in (loc.characters if loc.characters is Array else []):
        if ref is Dictionary:
            var cid := str(ref.get("_id", ref.get("id", "")))
            if cid != "" and not characters.has(cid):
                ids.append(cid)
        elif typeof(ref) == TYPE_STRING:
            var cid2 := str(ref)
            if cid2 != "" and not characters.has(cid2):
                ids.append(cid2)
    if ids.size() > 0:
        var wid := (db_world_id if db_world_id != "" else id)
        var fetched_chars: Dictionary = await NpcCharacterDAL.fetch_many(wid, ids)
        for key in fetched_chars.keys():
            var ch = fetched_chars[key]
            if ch is Character and ch.id != "":
                characters[ch.id] = ch
