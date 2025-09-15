extends AcceptDialog

@onready var api_key_edit: LineEdit = $VBox/ApiKeyEdit
@onready var save_button: Button = $VBox/HBox/SaveButton
@onready var close_button: Button = $VBox/HBox/CloseButton

func _ready() -> void:
    title = "Options"
    # Prefill existing key (masked display); LineEdit will show dots
    if Settings and Settings.has_method("get_api_key"):
        api_key_edit.text = str(Settings.get_api_key())
    save_button.pressed.connect(_on_save)
    close_button.pressed.connect(func(): hide())

func _on_save() -> void:
    var key := api_key_edit.text.strip_edges()
    Settings.set_api_key(key)
    if OpenAIClient:
        OpenAIClient.set_api_key(key)
    hide()
