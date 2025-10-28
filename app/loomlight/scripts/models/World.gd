class_name World
extends Resource

var LOCALE_DAL = load("res://scripts/dal/LocaleDAL.gd")
var QUEST_DAL = load("res://scripts/dal/QuestDAL.gd")
var NPC_CHARACTER_DAL = load("res://scripts/dal/NpcCharacterDAL.gd")
var BIOME_DAL = load("res://scripts/dal/BiomeDAL.gd")
var TERRAIN_DAL = load("res://scripts/dal/TerrainDAL.gd")
var TILESET_DAL = load("res://scripts/dal/TilesetDAL.gd")

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
var biomes: Array[Biome] = [] # global biomes
var _biomes_by_id: Dictionary = {}
var _terrain_docs_by_id: Dictionary = {}
var _tileset_docs_by_id: Dictionary = {} # raw DAL docs (Dictionary)
var _tileset_meta_by_id: Dictionary = {} # normalized meta { remote_path, local_path, lowerTerrainId, upperTerrainId }
var _tileset_pairs_by_biome: Dictionary = {}

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
        return
    var list: Array[Locale] = await LOCALE_DAL.fetch_list(wid)
    locales.clear()
    for loc in list:
        if loc is Locale and loc.id != "":
            locales[loc.id] = loc
    # Keep db id handy
    db_world_id = wid

func get_locale(locale_id: String) -> Locale:
    return locales.get(str(locale_id), null)

func set_biomes(list: Array[Biome]) -> void:
    biomes = []
    _biomes_by_id.clear()
    for b in list:
        if b is Biome and str(b.id) != "":
            var bid := str(b.id)
            _biomes_by_id[bid] = b
            biomes.append(b)

func cache_biome(biome: Biome) -> void:
    if biome == null:
        return
    var bid := str(biome.id)
    if bid == "":
        return
    _biomes_by_id[bid] = biome
    var found := false
    for i in range(biomes.size()):
        var existing: Biome = biomes[i]
        if existing != null and str(existing.id) == bid:
            biomes[i] = biome
            found = true
            break
    if not found:
        biomes.append(biome)

func get_biome_by_id(biome_id: String) -> Biome:
    return _biomes_by_id.get(str(biome_id), null)

func ensure_biome_loaded(biome_id: String) -> Biome:
    var bid := str(biome_id)
    if bid == "":
        return null
    if _biomes_by_id.has(bid):
        return _biomes_by_id[bid]
    var fetched: Biome = await BIOME_DAL.fetch_by_id(bid)
    if fetched != null:
        cache_biome(fetched)
    return fetched

func cache_terrain_doc(doc: Dictionary) -> void:
    if doc == null or doc.size() == 0:
        return
    var tid := str(doc.get("_id", doc.get("id", "")))
    if tid == "":
        return
    _terrain_docs_by_id[tid] = doc

func get_terrain_doc(tid: String) -> Dictionary:
    return _terrain_docs_by_id.get(str(tid), {})

func ensure_terrain_doc(tid: String) -> Dictionary:
    var key := str(tid)
    if key == "":
        return {}
    if _terrain_docs_by_id.has(key):
        return _terrain_docs_by_id[key]
    var doc: Dictionary = await TERRAIN_DAL.fetch_by_id(key)
    if doc != null and doc.size() > 0:
        _terrain_docs_by_id[key] = doc
    return doc

func cache_tileset_doc(tsid: String, doc: Dictionary) -> void:
    var key := str(tsid)
    if key == "":
        return
    if doc != null:
        _tileset_docs_by_id[key] = doc

func get_tileset_doc(tsid: String) -> Dictionary:
    return _tileset_docs_by_id.get(str(tsid), {})

func ensure_tileset_doc(tsid: String) -> Dictionary:
    var key := str(tsid)
    if key == "":
        return {}
    if _tileset_docs_by_id.has(key):
        return _tileset_docs_by_id[key]
    var doc: Dictionary = await TILESET_DAL.fetch_by_id(key)
    if doc != null and doc.size() > 0:
        _tileset_docs_by_id[key] = doc
    return doc

func cache_tileset_meta(tsid: String, meta: Dictionary) -> void:
    var key := str(tsid)
    if key == "":
        return
    _tileset_meta_by_id[key] = meta.duplicate(true)

func get_tileset_meta(tsid: String) -> Dictionary:
    return _tileset_meta_by_id.get(str(tsid), {})

func cache_tileset_pairs(biome_id: String, pairs: Dictionary) -> void:
    var key := str(biome_id)
    if key == "" or pairs == null:
        return
    _tileset_pairs_by_biome[key] = pairs.duplicate(true)

func get_tileset_pairs_for_biome(biome_id: String) -> Dictionary:
    var biome := await ensure_biome_loaded(biome_id)
    if biome == null:
        return {}
    var pairs := await biome.get_tileset_pairs(self)
    cache_tileset_pairs(biome_id, pairs)
    return pairs

func get_tileset_pairs_for_locale(loc: Locale) -> Dictionary:
    if loc == null:
        return {}
    var bid := loc.get_biome_id() if loc.has_method("get_biome_id") else str(loc.biome)
    if bid == "":
        return {}
    return await get_tileset_pairs_for_biome(bid)

func get_cached_tileset_pairs_for_biome(biome_id: String) -> Dictionary:
    var key := str(biome_id)
    if key != "" and _tileset_pairs_by_biome.has(key):
        var val: Dictionary = _tileset_pairs_by_biome[key]
        if val is Dictionary:
            var stored: Dictionary = val
            return stored.duplicate(true)
    var biome := get_biome_by_id(biome_id)
    if biome == null:
        return {}
    var cached := biome.get_cached_tileset_pairs()
    if cached.size() > 0:
        cache_tileset_pairs(biome_id, cached)
    return cached

func get_cached_tileset_pairs_for_locale(loc: Locale) -> Dictionary:
    if loc == null:
        return {}
    var bid := loc.get_biome_id() if loc.has_method("get_biome_id") else str(loc.biome)
    if bid == "":
        return {}
    var cached := get_cached_tileset_pairs_for_biome(bid)
    return cached

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
    var fetched: Dictionary = await QUEST_DAL.fetch_many(wid, missing)
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
            if loc.biome_ref == null:
                var bid := loc.get_biome_id()
                if bid != "":
                    loc.biome_ref = await ensure_biome_loaded(bid)
            return loc
        await loc.ensure_loaded(db_world_id)
        if loc.biome_ref == null:
            var bid2 := loc.get_biome_id()
            if bid2 != "":
                loc.biome_ref = await ensure_biome_loaded(bid2)
        await _ingest_locale(loc)
        return loc
    var fetched: Locale = await LOCALE_DAL.fetch_by_id((db_world_id if db_world_id != "" else id), lid)
    if fetched != null:
        fetched._loaded_full = true
        var bid3 := fetched.get_biome_id()
        if bid3 != "":
            fetched.biome_ref = await ensure_biome_loaded(bid3)
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
        var fetched_chars: Dictionary = await NPC_CHARACTER_DAL.fetch_many(wid, ids)
        for key in fetched_chars.keys():
            var ch = fetched_chars[key]
            if ch is Character and ch.id != "":
                characters[ch.id] = ch


