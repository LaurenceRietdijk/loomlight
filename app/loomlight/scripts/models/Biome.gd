class_name Biome
extends Resource

## Global biome model (not per-world)

var id: String = ""
var name: String = ""
var description: String = ""
var locales: Dictionary = {} # map of locale type -> bool
var terrains: Array[String] = [] # list of terrain ids (order preserved)
var terrain_weights: Dictionary = {} # id -> float weight
var _tileset_pairs_cache: Dictionary = {}
var _tileset_pairs_world_id: String = ""

func _init(data: Dictionary = {}):
	if data.has("_id"): id = str(data._id)
	elif data.has("id"): id = str(data.id)
	if data.has("name"): name = str(data.name)
	if data.has("description"): description = str(data.description)
	if data.has("locales") and data.locales is Dictionary:
		locales = data.locales.duplicate(true)
	if data.has("terrains") and data.terrains is Array:
		terrains = []
		terrain_weights = {}
		for t in data.terrains:
			# New weighted shape: { terrain: <id>, weight: <number> }
			if typeof(t) == TYPE_DICTIONARY and t.has("terrain"):
				var sid := str(t.terrain)
				if sid.length() > 0:
					terrains.append(sid)
					var w := 1.0
					if t.has("weight") and typeof(t.weight) in [TYPE_INT, TYPE_FLOAT]:
						w = float(t.weight)
					terrain_weights[sid] = w
			# Legacy shapes
			elif typeof(t) == TYPE_DICTIONARY and t.has("_id"):
				var sid2 := str(t._id)
				if sid2.length() > 0:
					terrains.append(sid2)
					terrain_weights[sid2] = 1.0
			elif typeof(t) == TYPE_STRING:
				var sid3 := str(t)
				if sid3.length() > 0:
					terrains.append(sid3)
					terrain_weights[sid3] = 1.0

static func from_dict(d: Dictionary) -> Biome:
	return Biome.new(d)

func to_dict() -> Dictionary:
	return {
		"id": id,
		"name": name,
		"description": description,
		"terrains": terrains,
		"locales": locales,
	}

func allows_locale_type(locale_type: String) -> bool:
	return bool(locales.get(locale_type, false))

func terrain_ids() -> Array[String]:
	return terrains.duplicate()

func terrain_index_map() -> Dictionary:
	var out: Dictionary = {}
	for i in range(terrains.size()):
		out[str(terrains[i])] = i
	return out

func clear_runtime_cache() -> void:
	_tileset_pairs_cache.clear()
	_tileset_pairs_world_id = ""

func get_tileset_pairs(world: World) -> Dictionary:
	if world == null:
		return {}
	var wid := str(world.id)
	if _tileset_pairs_world_id == wid and _tileset_pairs_cache.size() > 0:
		return _tileset_pairs_cache.duplicate(true)

	var ids := terrain_ids()
	if ids.size() < 2:
		_tileset_pairs_cache.clear()
		_tileset_pairs_world_id = wid
		return {}

	var index_map := terrain_index_map()
	var result: Dictionary = {}

	for i in range(ids.size()):
		var tid1 := ids[i]
		var doc1 := await world.ensure_terrain_doc(tid1)
		var neighbours1: Dictionary = doc1.get("neighbours", {}) if doc1.size() > 0 else {}
		for j in range(i + 1, ids.size()):
			var tid2 := ids[j]
			var ts_ref = neighbours1.get(tid2, null)
			if ts_ref == null:
				var doc2 := await world.ensure_terrain_doc(tid2)
				var neighbours2: Dictionary = doc2.get("neighbours", {}) if doc2.size() > 0 else {}
				ts_ref = neighbours2.get(tid1, null)
			if ts_ref == null:
				continue
			var tsid := ""
			if typeof(ts_ref) == TYPE_DICTIONARY and ts_ref.has("_id"):
				tsid = str(ts_ref.get("_id"))
			else:
				tsid = str(ts_ref)
			if tsid == "":
				continue

			var tileset_doc := await world.ensure_tileset_doc(tsid)
			if tileset_doc != null and tileset_doc.size() > 0:
				world.cache_tileset_doc(tsid, tileset_doc)
				var texture: Dictionary = tileset_doc.get("texture", {})
				var image_path: String = str(texture.get("imagePath", ""))
				if image_path.begins_with("web/"):
					image_path = "/" + image_path.substr(4)
				elif not image_path.begins_with("/") and image_path != "":
					image_path = "/" + image_path
				var lower_id := str(tileset_doc.get("lowerTerrain", tileset_doc.get("lowerTerrainId", "")))
				var upper_id := str(tileset_doc.get("upperTerrain", tileset_doc.get("upperTerrainId", "")))
				var meta := {
					"remote_path": image_path,
					"local_path": "",
					"lowerTerrainId": lower_id,
					"upperTerrainId": upper_id,
				}
				world.cache_tileset_meta(tsid, meta)

			var lower_idx := int(index_map.get(str(tid1), -1))
			var upper_idx := int(index_map.get(str(tid2), -1))
			if lower_idx < 0 or upper_idx < 0:
				continue
			var pair := PackedInt32Array([lower_idx, upper_idx])
			result[pair] = tsid

	_tileset_pairs_cache = result.duplicate(true)
	_tileset_pairs_world_id = wid
	return result

func get_cached_tileset_pairs() -> Dictionary:
	return _tileset_pairs_cache.duplicate(true)
