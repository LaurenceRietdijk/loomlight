class_name ClearQuest
extends "res://scripts/models/Quest.gd"

var _subscribed_char_ids: Dictionary = {}

func init(world: World) -> void:
    var loc_id := ""
    if target_locale is Dictionary:
        if target_locale.has("_id"):
            loc_id = str(target_locale._id)
        elif target_locale.has("id"):
            loc_id = str(target_locale.id)
    elif typeof(target_locale) == TYPE_STRING:
        loc_id = str(target_locale)
    if loc_id != "" and world != null:
        var _ := await world.ensure_locale(loc_id)
        # Subscribe to character state changes in this locale
        for key in world.characters.keys():
            var ch = world.characters[key]
            if ch is Character:
                var ch_loc := ""
                if ch.location is Dictionary:
                    ch_loc = str(ch.location.get("locale", ""))
                if ch_loc == loc_id:
                    var cid := String(ch.id)
                    if not _subscribed_char_ids.has(cid):
                        _subscribed_char_ids[cid] = true
                        ch.state_changed.connect(Callable(self, "_on_character_state_changed").bind(world))

func update_progress(world: World) -> void:
    var loc_id := ""
    if target_locale is Dictionary:
        if target_locale.has("_id"):
            loc_id = str(target_locale._id)
        elif target_locale.has("id"):
            loc_id = str(target_locale.id)
    elif typeof(target_locale) == TYPE_STRING:
        loc_id = str(target_locale)
    if loc_id == "" or world == null:
        progress = progress_text()
        return
    var _ := await world.ensure_locale(loc_id)
    var count_active := 0
    for key in world.characters.keys():
        var ch = world.characters[key]
        if ch != null and ch is Character:
            var ch_loc = ""
            if ch.location is Dictionary:
                var lid = ch.location.get("locale", null)
                ch_loc = str(lid)
            if ch_loc == loc_id and String(ch.status).to_lower() == "active":
                count_active += 1
    enemies_remaining = count_active
    progress = "%d enemies remaining" % max(0, enemies_remaining)

func _on_character_state_changed(_ch: Character, _old: String, _new: String, world: World) -> void:
    await update_progress(world)
