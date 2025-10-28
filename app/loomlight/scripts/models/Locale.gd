class_name Locale
extends Resource

const LOCALE_DAL = preload("res://scripts/dal/LocaleDAL.gd")

var id: String = ""
var name: String = ""
var type: String = ""
var description: String = ""
var coordinates := Vector2.ZERO

var primary_race: Variant = null
var biome: String = ""
var biome_ref: Biome = null
var factions: Array = []
var characters: Array = [] # lightweight refs: { _id, building?, role? }
var buildings: Array[Building] = []
var special_features: Array = []
var resources: Dictionary = {}
var population: int = 0

var _loaded_full: bool = false

func _init(data: Dictionary = {}):
    if data.has("_id"): id = str(data._id)
    elif data.has("id"): id = str(data.id)
    if data.has("name"): name = str(data.name)
    if data.has("type"): type = str(data.type)
    if data.has("description"): description = str(data.description)
    if data.has("coordinates") and data.coordinates is Dictionary:
        var x := float(data.coordinates.get("x", 0))
        var y := float(data.coordinates.get("y", 0))
        coordinates = Vector2(x, y)

    if data.has("primary_race"): primary_race = data.primary_race
    if data.has("biome"):
        var b = data.biome
        if b is Dictionary:
            biome = str(b.get("_id", b.get("id", "")))
        elif b is Biome:
            biome = str((b as Biome).id)
            biome_ref = b
        elif typeof(b) == TYPE_STRING:
            biome = str(b)
        else:
            biome = ""
    if data.has("factions") and data.factions is Array:
        factions = data.factions.duplicate(true)

    # Normalize characters to lightweight refs
    characters = []
    if data.has("characters") and data.characters is Array:
        for c in data.characters:
            if c is Dictionary:
                var entry := { "_id": str(c.get("_id", c.get("id", ""))) }
                if c.has("building"):
                    var b = c.building
                    if b is Dictionary:
                        entry["building"] = {"_id": str(b.get("_id", b.get("id", "")))}
                    else:
                        entry["building"] = b
                if c.has("role"): entry["role"] = str(c.role)
                characters.append(entry)
            else:
                characters.append({"_id": str(c)})

    buildings = []
    if data.has("buildings") and data.buildings is Array and data.buildings.size() > 0 and data.buildings[0] is Dictionary:
        for b in data.buildings:
            buildings.append(Building.new(b))

    if data.has("special_features") and data.special_features is Array:
        special_features = data.special_features.duplicate(true)
    if data.has("resources") and data.resources is Dictionary:
        resources = data.resources.duplicate(true)
    if data.has("population"): population = int(data.population)

    _loaded_full = bool(data.get("_loadedFull", false)) or (buildings.size() > 0)

static func from_dict(d: Dictionary) -> Locale:
    return Locale.new(d)

## Returns the expected tile key used for images and tileset mapping: "<biomeId>_<LocaleType>"
func tile_key() -> String:
    if biome == "":
        return ""
    return "%s_%s" % [biome, type]

func get_biome_id() -> String:
    var bval: Variant = biome
    if bval is String:
        return str(bval)
    if bval is Biome:
        return str((bval as Biome).id)
    if biome_ref is Biome:
        return str(biome_ref.id)
    if typeof(bval) == TYPE_DICTIONARY:
        var dict: Dictionary = bval
        if dict.has("_id"):
            return str(dict.get("_id"))
        if dict.has("id"):
            return str(dict.get("id"))
    elif typeof(bval) == TYPE_OBJECT and bval != null:
        if bval is Biome:
            return str((bval as Biome).id)
        if bval.has_method("get"):
            var id_val = str(bval.get("id", ""))
            if id_val != "":
                return id_val
            id_val = str(bval.get("_id", ""))
            if id_val != "":
                return id_val
        if bval.has_method("get_id"):
            var method_id := str(bval.call("get_id"))
            if method_id != "":
                return method_id
    return ""

func get_biome() -> Biome:
    if biome_ref is Biome:
        return biome_ref
    var bval: Variant = biome
    if bval is Biome:
        biome_ref = bval
        return biome_ref
    var bid := get_biome_id()
    if bid == "":
        return null
    if Engine.has_singleton("GameManager"):
        if GameManager.current_world != null and GameManager.current_world.biomes is Array:
            for b in GameManager.current_world.biomes:
                if b != null and str(b.id) == bid:
                    biome_ref = b
                    return biome_ref
        if GameManager.current_world != null:
            var cached: Biome = GameManager.current_world.get_biome_by_id(bid)
            if cached != null:
                biome_ref = cached
                return biome_ref
    return null

func to_dict() -> Dictionary:
    var out := {
        "id": id,
        "name": name,
        "type": type,
        "description": description,
        "coordinates": {"x": coordinates.x, "y": coordinates.y},
        "primary_race": primary_race,
        "biome": biome,
        "factions": factions,
        "characters": characters,
        "buildings": [],
        "special_features": special_features,
        "resources": resources,
        "population": population,
        "_loadedFull": _loaded_full,
    }
    for b in buildings:
        if b is Building:
            out.buildings.append(b.to_dict())
    return out

# Convenience: ensure this locale is fully loaded via API by id
func ensure_loaded(world_id: String, world: World = null) -> Locale:
    if _loaded_full:
        return self
    if id == "":
        return self
    var tree := Engine.get_main_loop() as SceneTree
    if tree == null:
        return self
    # Defer to DAL to fetch full by id
    if tree.root.has_node("LocaleDAL"):
        pass # in-editor class_name, not a node
    var cls = LOCALE_DAL
    var full: Locale = await cls.fetch_by_id(world_id, id)
    if full != null:
        _apply_from(full)
        var bid := get_biome_id()
        if world != null and bid != "":
            biome_ref = await world.ensure_biome_loaded(bid)
    return self

func _apply_from(other: Locale) -> void:
    if other == null:
        return
    id = other.id
    name = other.name
    type = other.type
    description = other.description
    coordinates = other.coordinates
    primary_race = other.primary_race
    factions = other.factions.duplicate(true)
    characters = other.characters.duplicate(true)
    buildings = []
    for b in other.buildings:
        buildings.append(b)
    special_features = other.special_features.duplicate(true)
    resources = other.resources.duplicate(true)
    population = other.population
    biome = other.get_biome_id()
    biome_ref = other.biome_ref if other.biome_ref is Biome else other.get_biome()
    _loaded_full = true

