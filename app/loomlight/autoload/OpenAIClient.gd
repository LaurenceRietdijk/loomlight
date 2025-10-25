extends Node

## Minimal OpenAI Chat Client for Godot 4
## Uses HTTPS requests with bearer token from Settings autoload

const CHAT_URL := "https://api.openai.com/v1/chat/completions"

var api_key: String = ""
var _http: HTTPRequest

func _ready() -> void:
    _http = HTTPRequest.new()
    add_child(_http)
    # Pull key from Settings if available
    if Engine.get_main_loop() and get_tree().root.has_node("Settings"):
        var s := get_tree().root.get_node("Settings")
        if s and s.has_method("get_api_key"):
            api_key = s.call("get_api_key")

func set_api_key(key: String) -> void:
    api_key = key.strip_edges()

func is_configured() -> bool:
    return api_key != null and api_key.strip_edges() != ""

func _auth_headers() -> PackedStringArray:
    var headers := PackedStringArray()
    headers.append("Content-Type: application/json")
    headers.append("Authorization: Bearer %s" % api_key)
    return headers

## Call chat.completions with the given messages array
## messages: Array[Dictionary] with keys: role ("system"|"user"|"assistant"), content (String)
## returns Dictionary { ok: bool, text: String, raw: Variant, error: String }
func chat(messages: Array, model: String = "gpt-4o-mini") -> Dictionary:
    if not is_configured():
        return {"ok": false, "text": "", "raw": null, "error": "Missing API key"}
    var payload := {
        "model": model,
        "messages": messages,
        "temperature": 0.7
    }
    var body := JSON.stringify(payload)
    var err := _http.request(CHAT_URL, _auth_headers(), HTTPClient.METHOD_POST, body)
    if err != OK:
        return {"ok": false, "text": "", "raw": null, "error": "Request error: %s" % err}
    var result: Array = await _http.request_completed
    var code: int = result[1]
    var res_body: PackedByteArray = result[3]
    var text := res_body.get_string_from_utf8()
    if code < 200 or code >= 300:
        return {"ok": false, "text": "", "raw": text, "error": "HTTP %d" % code}
    var parsed: Variant = JSON.parse_string(text)
    if typeof(parsed) != TYPE_DICTIONARY:
        return {"ok": false, "text": "", "raw": text, "error": "Invalid JSON"}
    var choices = parsed.get("choices", [])
    if choices.size() == 0:
        return {"ok": false, "text": "", "raw": parsed, "error": "No choices"}
    var first = choices[0]
    var msg = first.get("message", {})
    var content: String = str(msg.get("content", ""))
    return {"ok": true, "text": content, "raw": parsed, "error": ""}

## Convenience: build a roleplay system prompt based on current world/player
func make_system_prompt(character_name: String, world_name: String = "", player_name: String = "") -> String:
    var parts: Array[String] = []
    parts.append("You are roleplaying as %s." % character_name)
    if world_name != "":
        parts.append("The setting is the world '%s'." % world_name)
    if player_name != "":
        parts.append("You are speaking with the player '%s'." % player_name)
    parts.append("Respond as the character would speak in-world. Keep replies concise unless asked to elaborate.")
    return " ".join(parts)


