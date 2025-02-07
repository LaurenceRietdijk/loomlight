using System;
using System.Collections.Generic;
using Godot;
using loomlight.characters;

namespace loomlight{
    public class World : Node2D
    {
        private List<Character> _characters = new List<Character>();
        public void AddCharacter(Character character)
        {
            _characters.Add(character);

            // Add character to the scene tree
            AddChild(character);
        }
    }
}