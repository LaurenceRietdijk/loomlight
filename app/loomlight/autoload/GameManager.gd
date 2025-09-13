# autoload/GameManager.gd
extends Node
var current_world: World = null
var current_player: PlayerCharacter = null

# Load the selected world with the chosen player character
func load_world(player: PlayerCharacter, world: World) -> void:
	current_player = player
	current_world = world
	print("Starting game with world '%s' and character '%s'" % [world.name, player.name])
	# Initialize world collections (e.g., dehydrated locales) using world.id
	if current_world != null:
		await current_world.init_collections()
	# Initialize player character active state for this world
	if current_player != null and current_world != null:
		await current_player.init_for_world(current_world)

# Called when the node is added to the scene tree
func _ready() -> void:
	print("GameManager loaded")

# Example methods
func reset_game() -> void:
	print("Game reset")

func hydrate_locale(locale_id: String) -> Locale:
	if current_world == null:
		return null
	return await current_world.ensure_locale(locale_id)
