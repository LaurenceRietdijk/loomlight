extends Control

@export var background_color: Color = Color(0, 0, 0, 0.75)
@export var bar_color: Color = Color(0.5, 0.0, 0.0, 1.0)
@export var bar_bg_color: Color = Color(0.2, 0.2, 0.2, 1.0)

@onready var _panel: ColorRect = $Overlay
@onready var _label: Label = $VBox/Label
@onready var _bar: ProgressBar = $VBox/ProgressBar

func _ready() -> void:
	# Apply exported style values to scene nodes
	if _panel:
		_panel.color = background_color
	if _bar:
		_bar.add_theme_color_override("fg_color", bar_color)
		_bar.add_theme_color_override("bg_color", bar_bg_color)
	show_loading() # default to visible until Game instructs otherwise

func show_loading(text: String = "Loading...", progress: float = 0.0) -> void:
	visible = true
	set_status(text)
	set_progress(progress)

func hide_loading() -> void:
	visible = false

func set_status(text: String) -> void:
	if not _label: return
	_label.text = text

func set_progress(value: float) -> void:
	if not _bar: return
	var v := value
	if v <= 1.0: # allow 0..1 input
		v = clampf(v * 100.0, 0.0, 100.0)
	else:
		v = clampf(v, 0.0, 100.0)
	_bar.value = v
