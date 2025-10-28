extends Control

const WORLD = preload("res://scripts/models/World.gd")
const PLAYER_CHARACTER = preload("res://scripts/models/PlayerCharacter.gd")
const WORLD_DAL = preload("res://scripts/dal/WorldDAL.gd")
const CHARACTER_DAL = preload("res://scripts/dal/CharacterDAL.gd")

@onready var world_option: OptionButton = $"CenterContainer/VBox/HBox/WorldSelect"
@onready var character_option: OptionButton = $"CenterContainer/VBox/HBox/CharacterSelect"
@onready var play_button: Button = $"CenterContainer/VBox/PlayButton"
@onready var back_button: Button = $"CenterContainer/VBox/BackButton"

var _worlds: Array[World] = []
var _characters: Array[PlayerCharacter] = []

func _ready() -> void:
	play_button.disabled = true
	await _load_worlds()
	world_option.item_selected.connect(_on_world_selected)
	character_option.item_selected.connect(_on_character_selected)
	play_button.pressed.connect(_on_play_pressed)
	back_button.pressed.connect(_on_back_pressed)

func _on_back_pressed() -> void:
	get_tree().change_scene_to_file("res://scenes/MainMenu.tscn")

func _on_world_selected(index: int) -> void:
	var world: World = _worlds[index]
	await _load_characters(world)

func _on_character_selected(_index: int) -> void:
	_update_play_state()

func _update_play_state() -> void:
	var has_world := world_option.get_selected() >= 0
	var has_char := character_option.get_selected() >= 0 and character_option.get_item_count() > 0
	play_button.disabled = not (has_world and has_char)

func _on_play_pressed() -> void:
	var w_idx := world_option.get_selected()
	var c_idx := character_option.get_selected()
	if w_idx < 0 or c_idx < 0:
		return
	var world: World = _worlds[w_idx]
	var character: PlayerCharacter = _characters[c_idx]
	GameManager.load_world(character, world)
	# TODO: change to gameplay scene when available

func _load_worlds() -> void:
	world_option.clear()
	_worlds = await WORLD_DAL.fetch_all()
	for i in _worlds.size():
		world_option.add_item(_worlds[i].name, i)
	if _worlds.size() > 0:
		world_option.select(0)
		await _load_characters(_worlds[0])
	_update_play_state()

func _load_characters(world: World) -> void:
	character_option.clear()
	_characters = await CHARACTER_DAL.fetch_by_world(world.id)
	for i in _characters.size():
		character_option.add_item(_characters[i].name, i)
	if _characters.size() > 0:
		character_option.select(0)
	_update_play_state()
