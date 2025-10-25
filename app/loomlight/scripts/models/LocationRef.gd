class_name LocationRef
extends Resource

var locale: Variant = null
var building: Variant = null
var room: Variant = null
var container: Variant = null

func _init(data: Dictionary = {}):
    if data.has("locale"): locale = data.locale
    if data.has("building"): building = data.building
    if data.has("room"): room = data.room
    if data.has("container"): container = data.container

static func from_variant(v: Variant) -> LocationRef:
    if v is Dictionary:
        return LocationRef.new(v)
    return LocationRef.new({})

func to_dict() -> Dictionary:
    return {
        "locale": locale,
        "building": building,
        "room": room,
        "container": container,
    }


