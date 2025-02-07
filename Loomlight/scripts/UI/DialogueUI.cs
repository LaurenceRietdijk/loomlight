using Godot;
using System;
using System.Threading.Tasks;
using loomlight;
using loomlight.models;
using loomlight.characters;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System.Diagnostics;

namespace loomlight.UI
{
    public class DialogueUI : Node2D
    {
        private bool _active = false;
        private GameManager _gameManager;
        private Sprite _icon;
        private Label _dialogueBox;
        private Label _statusBox;
        private Label _descriptionBox;
        private Button _speakBTN;
        private Character _character;

        // Called when the node enters the scene tree for the first time.
        public override void _Ready()
        {
            //create an npc
            _character = CharacterGenerator.GenerateCharacter();

            //Find Nodes
            _gameManager = GetNode<GameManager>("/root/GameManager");
            _icon = GetNode<Sprite>("Icon");
            _dialogueBox = GetNode<Label>("dialogueBox");
            _statusBox = GetNode<Label>("statusBox");
            _descriptionBox = GetNode<Label>("descriptionBox");
            _speakBTN = GetNode<Button>("speakBTN");

            // Connect button signals
            _speakBTN.Connect("pressed", this, nameof(send));

            // Initialize window.speechResult in the browser environment
            string jsCode = @"
            window.speechResult = null;
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.onresult = (event) => {
                window.speechResult = event.results[0][0]?.transcript || 'error:invalid_structure';
            };
            recognition.onerror = (event) => {
                window.speechResult = 'error:' + (event.error || 'unknown');
            };
            recognition.ontimeout = () => {
                window.speechResult = 'error:timeout';
            };
            window.recognition = recognition;
        ";
            JavaScript.Eval(jsCode);

            // Warm up the async system
            Task.Run(() => { /* Simple no-op */ }).ContinueWith(_ =>
            {
                _statusBox.Text = "DialogueUI innitialised!";
            });
        }

        public void OpenDialogue(Character character)
        {
            _character = character;
            _active = true;
            _descriptionBox.Text = _character.GetDescription();
            _dialogueBox.Text = $"{_character.Name}: Hmmm?";
        }

        public void CloseDialogue()
        {
            _character = null;
            _active = false;
        }

        public override void _Process(float delta)
        {
            _icon.Rotation = _icon.Rotation + 1 * delta;
        }



        private async void send()
        {
            _statusBox.Text = "Listening...";

            // Reset `window.speechResult` and start recognition
            JavaScript.Eval(@"
                window.speechResult = null;
                window.recognition.start();
            ");

            // await speech to text results
            string userText = await _gameManager.Helper.CheckForResultsAsync("speechResult");

            // ignore attempt if userText is invalid
            if (userText == null)
            {
                GD.Print("userText is invalid. Interupting progression");
                _statusBox.Text = "Didn't hear you speak...";
                return;
            }

            //update UI with user's speech
            _statusBox.Text = "Processing...";
            _dialogueBox.Text += $"\nYou: {userText}";

            //Await a response from Character
            _statusBox.Text = "Awaiting response...";
            string response = await _character.Talk(userText);

            // Update UI with Chracter response and trigger text to speach
            _dialogueBox.Text += $"\n{_character.Name}: {response}";
            _gameManager.Helper.TextToSpeech(response);
            _statusBox.Text = "Idle...";
        }

    }
}


