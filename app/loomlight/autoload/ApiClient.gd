extends Node

## Simple HTTP JSON client for Godot 4

var base_url: String
var _http: HTTPRequest

func _ready() -> void:
	base_url = ProjectSettings.get_setting("loomlight/api_base_url", "http://localhost:3000")
	_http = HTTPRequest.new()
	add_child(_http)

func _build_url(path: String) -> String:
	if path.begins_with("http://") or path.begins_with("https://"):
		return path
	if not path.begins_with("/"):
		path = "/" + path
	return base_url.rstrip("/") + path

func _json_headers() -> PackedStringArray:
	return PackedStringArray(["Content-Type: application/json"]) 

func _parse_json(bytes: PackedByteArray) -> Variant:
	var text := bytes.get_string_from_utf8()
	# Avoid typed inference from Variant; either annotate or use untyped assignment
	var parsed: Variant = JSON.parse_string(text)
	return parsed

func _result_dict(ok: bool, code: int, data: Variant = null, error: String="") -> Dictionary:
	return {"ok": ok, "code": code, "data": data, "error": error}

## Public: GET JSON
func get_json(path: String) -> Dictionary:
	return await _request_json(HTTPClient.METHOD_GET, path)

## Public: POST JSON
func post_json(path: String, payload: Variant) -> Dictionary:
	return await _request_json(HTTPClient.METHOD_POST, path, payload)

## Public: GET raw bytes (e.g., images)
func get_bytes(path: String) -> PackedByteArray:
	return await _request_bytes(HTTPClient.METHOD_GET, path)

## Core request handler (awaits)
func _request_json(method: int, path: String, payload: Variant = null) -> Dictionary:
	var url := _build_url(path)
	var body := ""
	var headers := PackedStringArray()
	if payload != null:
		body = JSON.stringify(payload)
		headers = _json_headers()

	var err := _http.request(url, headers, method, body)
	if err != OK:
		return _result_dict(false, -1, null, "Request error: %s" % err)

	var result: Array = await _http.request_completed
	var res_code: int = result[1]
	var res_body: PackedByteArray = result[3]

	if res_code >= 200 and res_code < 300:
		var data = _parse_json(res_body)
		return _result_dict(true, res_code, data, "")
	else:
		var err_text := res_body.get_string_from_utf8()
		return _result_dict(false, res_code, null, err_text)

## Core request handler for bytes
func _request_bytes(method: int, path: String, payload: Variant = null) -> PackedByteArray:
	var url := _build_url(path)
	var body := ""
	var headers := PackedStringArray()
	if payload != null:
		body = JSON.stringify(payload)
		headers = _json_headers()

	var err := _http.request(url, headers, method, body)
	if err != OK:
		return PackedByteArray()

	var result: Array = await _http.request_completed
	var res_code: int = result[1]
	var res_body: PackedByteArray = result[3]

	if res_code >= 200 and res_code < 300:
		return res_body
	return PackedByteArray()
