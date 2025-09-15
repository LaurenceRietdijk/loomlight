extends Control

@onready var start_button: Button = $"CenterContainer/VBoxContainer/StartButton"
@onready var options_button: Button = $"CenterContainer/VBoxContainer/OptionsButton"
@onready var quit_button: Button = $"CenterContainer/VBoxContainer/QuitButton"

var _options_popup: AcceptDialog = null

func _ready() -> void:
	start_button.pressed.connect(_on_start_pressed)
	options_button.pressed.connect(_on_options_pressed)
	quit_button.pressed.connect(_on_quit_pressed)
	# Preload and add Options popup
	var scene := load("res://scenes/OptionsPopup.tscn")
	if scene:
		_options_popup = scene.instantiate()
		add_child(_options_popup)

func _on_start_pressed() -> void:
	GameManager.reset_game()
	get_tree().change_scene_to_file("res://scenes/SelectScreen.tscn")

func _on_options_pressed() -> void:
	if _options_popup:
		_options_popup.popup_centered()

func _on_quit_pressed() -> void:
	get_tree().quit()
