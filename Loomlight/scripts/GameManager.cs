using System;
using Godot;
using loomlight.Services;
using loomlight.UI;
using loomlight.characters;

namespace loomlight
{
    public class GameManager : Node
    {
        private DialogueUI _dialogueUI;
        private World _world;
        public OpenAIClient OpenAIClient { get; private set; }
        public Helper Helper { get; private set; }

        public override void _Ready()
        {
            //Find child nodes
            _dialogueUI = GetNode<DialogueUI>("DialogueUI");
            _world = GetNode<World>("World");
            Helper = GetNode<Helper>(path: "/root/Helper");

            //Instantiate services
            OpenAIClient = new OpenAIClient();
            AddChild(OpenAIClient);

            //create an npc and assign it to UI for dialogue testing
            var character = CharacterGenerator.GenerateCharacter();
            _world.AddCharacter(character);
            _dialogueUI.OpenDialogue(character);
        }
    }
}