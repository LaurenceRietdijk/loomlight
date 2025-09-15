extends Node2D

@onready var map_view: Node2D = $MapView
@onready var loading_screen: Control = $LoadingScreen
@onready var locale_screen: Node2D = $LocaleScreen if has_node("LocaleScreen") else null
@onready var dialogue_screen: Control = $DialogueScreen if has_node("DialogueScreen") else null

func _ready() -> void:
	# Default: show loading UI until GameManager finishes setup
	show_only_loading()

func show_only_loading(text: String = "Loading...") -> void:
	if loading_screen and loading_screen.has_method("show_loading"):
		loading_screen.call("show_loading", text, 0.0)
	if map_view: map_view.visible = false
	if locale_screen: locale_screen.visible = false
	if dialogue_screen: dialogue_screen.visible = false
	visible = true

func update_loading(progress: float, text: String = "") -> void:
	if text != "" and loading_screen and loading_screen.has_method("set_status"):
		loading_screen.call("set_status", text)
	if loading_screen and loading_screen.has_method("set_progress"):
		loading_screen.call("set_progress", progress)

func finish_loading_show_map() -> void:
	if loading_screen and loading_screen.has_method("hide_loading"):
		loading_screen.call("hide_loading")
	if map_view: map_view.visible = true
	# keep other screens hidden by default; they will show when invoked elsewhere

func open_dialogue(character_name: String, portrait_path: String = "") -> void:
	if dialogue_screen == null:
		return
	var tex: Texture2D = null
	if portrait_path != "" and ResourceLoader.exists(portrait_path):
		tex = load(portrait_path)
	if dialogue_screen.has_method("begin_conversation"):
		dialogue_screen.call("begin_conversation", character_name, tex)
	dialogue_screen.visible = true
