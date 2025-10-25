extends Node2D

@onready var map_view: Node2D = $MapView
@onready var loading_screen: Control = $LoadingScreen
@onready var locale_screen: Node2D = $LocaleScreen if has_node("LocaleScreen") else null
@onready var dialogue_screen: Control = $DialogueScreen if has_node("DialogueScreen") else null

var _current_screen: String = "loading" # one of: loading, map, locale, dialogue
var _active_locale: Locale = null

func _ready() -> void:
	# Default: show loading UI until GameManager finishes setup
	show_only_loading()
	# Connect map tile selection to game flow
	if map_view and map_view.has_signal("tile_selected"):
		map_view.connect("tile_selected", Callable(self, "_on_map_tile_selected"))

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
	show_map()

func hide_loading() -> void:
	if loading_screen and loading_screen.has_method("hide_loading"):
		loading_screen.call("hide_loading")

func show_locale(loc: Locale) -> void:
	# Hide map, show locale screen, and pass the locale
	_active_locale = loc
	if map_view:
		map_view.visible = false
		if map_view.has_method("set_process_unhandled_input"):
			map_view.set_process_unhandled_input(false)
	if loading_screen and loading_screen.has_method("hide_loading"):
		loading_screen.call("hide_loading")
	if locale_screen:
		if locale_screen.has_method("show_locale"):
			locale_screen.call("show_locale", loc)
		locale_screen.visible = true
	_current_screen = "locale"

func show_map() -> void:
	# Show the world map and disable other screens
	if loading_screen and loading_screen.has_method("hide_loading"):
		loading_screen.call("hide_loading")
	if locale_screen:
		# Hide locale when switching to map
		if locale_screen.has_method("hide_locale"):
			locale_screen.call("hide_locale")
		locale_screen.visible = false
	if dialogue_screen:
		dialogue_screen.visible = false
	if map_view:
		map_view.visible = true
		if map_view.has_method("set_process_unhandled_input"):
			map_view.set_process_unhandled_input(true)
	_current_screen = "map"

func _on_map_tile_selected(cell: Vector2i) -> void:
	# Delegate to GameManager to enter the locale flow
	if Engine.has_singleton("GameManager"):
		# Autoloads are available as globals; direct call
		GameManager.enter_locale_at_cell(cell)
	else:
		# Fallback: try get node
		var gm := get_tree().root.get_node_or_null("GameManager")
		if gm and gm.has_method("enter_locale_at_cell"):
			gm.call("enter_locale_at_cell", cell)

func open_dialogue(character_name: String, portrait_path: String = "") -> void:
	if dialogue_screen == null:
		return
	var tex: Texture2D = null
	if portrait_path != "" and ResourceLoader.exists(portrait_path):
		tex = load(portrait_path)
	if dialogue_screen.has_method("begin_conversation"):
		dialogue_screen.call("begin_conversation", character_name, tex)
	dialogue_screen.visible = true

# UI button handlers wired in scene
func _on_show_map_pressed() -> void:
	show_map()

func _on_show_locale_pressed() -> void:
	# Switch to locale view using the last active locale if available
	if _active_locale != null:
		show_locale(_active_locale)
	else:
		# If no locale cached yet, keep current state (button will be a no-op)
		pass
