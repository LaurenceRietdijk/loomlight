extends Control

@onready var name_label: Label = $Panel/HBox/Left/NameLabel
@onready var portrait: TextureRect = $Panel/HBox/Left/Portrait
@onready var log_view: RichTextLabel = $Panel/HBox/Right/Scroll/Log
@onready var input_field: LineEdit = $Panel/HBox/Right/InputRow/InputField
@onready var send_button: Button = $Panel/HBox/Right/InputRow/SendButton
@onready var close_button: Button = $Panel/HBox/Right/TopRow/CloseButton

var _messages: Array = []
var _character_name: String = ""

func _ready() -> void:
	visible = false
	# Configure defaults that aren't set in the scene
	if is_instance_valid(log_view):
		log_view.fit_content = true
		log_view.bbcode_enabled = true
		log_view.scroll_following = true
		log_view.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART

	# Default portrait texture if none is assigned
	if is_instance_valid(portrait) and portrait.texture == null:
		if ResourceLoader.exists("res://assets/images/default.png"):
			portrait.texture = load("res://assets/images/default.png")

	# Wire up signals
	if is_instance_valid(close_button):
		close_button.pressed.connect(func(): hide_dialogue())
	if is_instance_valid(send_button):
		send_button.pressed.connect(_on_send_pressed)
	if is_instance_valid(input_field):
		input_field.text_submitted.connect(func(_t): _on_send_pressed())

func begin_conversation(character_name: String, portrait_tex: Texture2D = null) -> void:
	_character_name = character_name
	name_label.text = character_name
	if portrait_tex != null:
		portrait.texture = portrait_tex
	_messages.clear()
	log_view.clear()
	# Build system context
	var world_name := ""
	var player_name := ""
	if Engine.get_main_loop() and get_tree().root.has_node("GameManager"):
		var gm := get_tree().root.get_node("GameManager")
		if gm != null:
			if gm.current_world != null and gm.current_world.name != null:
				world_name = str(gm.current_world.name)
			if gm.current_player != null and gm.current_player.name != null:
				player_name = str(gm.current_player.name)
	var sys := OpenAIClient.make_system_prompt(character_name, world_name, player_name)
	_messages.append({"role": "system", "content": sys})
	add_message("system", "System ready for roleplay.")
	show_dialogue()

func add_message(role: String, text: String) -> void:
	var who := role
	if role == "assistant":
		who = _character_name
	elif role == "user":
		who = "You"
	elif role == "system":
		who = "System"
	log_view.append_text("[b]%s:[/b] %s\n" % [who, text])

func show_dialogue() -> void:
	visible = true

func hide_dialogue() -> void:
	visible = false

func _on_send_pressed() -> void:
	var txt := input_field.text.strip_edges()
	if txt == "":
		return
	if not OpenAIClient.is_configured():
		add_message("system", "No API key configured. Open Options on main menu to set one.")
		return
	input_field.editable = false
	send_button.disabled = true
	_messages.append({"role": "user", "content": txt})
	add_message("user", txt)
	input_field.text = ""
	await _do_chat()
	input_field.editable = true
	send_button.disabled = false

func _do_chat() -> void:
	var res := await OpenAIClient.chat(_messages)
	if not res.get("ok", false):
		add_message("system", "Error: %s" % res.get("error", "Unknown"))
		return
	var reply: String = str(res.get("text", ""))
	_messages.append({"role": "assistant", "content": reply})
	add_message("assistant", reply)
