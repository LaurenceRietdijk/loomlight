extends Node

const CONFIG_PATH := "user://settings.cfg"
const SECTION := "openai"
const KEY_API_KEY := "api_key"

var _config := ConfigFile.new()
var api_key: String = ""

func _ready() -> void:
    _load()

func _load() -> void:
    var err := _config.load(CONFIG_PATH)
    if err != OK:
        # Fresh config; ensure defaults
        api_key = ""
        return
    api_key = str(_config.get_value(SECTION, KEY_API_KEY, ""))

func save() -> void:
    _config.set_value(SECTION, KEY_API_KEY, api_key)
    var err := _config.save(CONFIG_PATH)
    if err != OK:
        push_warning("[Settings] Failed to save settings.cfg (err=" + str(err) + ")")

func set_api_key(key: String) -> void:
    api_key = key.strip_edges()
    save()

func get_api_key() -> String:
    return api_key

func has_api_key() -> bool:
    return api_key != null and api_key.strip_edges() != ""

