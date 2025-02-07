using System;
using System.Collections.Generic;

namespace loomlight.characters
{
    public static class CharacterGenerator
    {
        // List of fantasy names
        private static readonly List<string> Names = new List<string>
    {
        "Elarion", "Sylvaris", "Thalindra", "Kaelthar", "Myralis", "Zantherion", "Lyssara", "Fenlorin", "Aerendyl",
        "Voryn", "Elowen", "Thamior", "Arannis", "Calithil", "Felandris", "Nythra", "Vaeloria", "Quenlynn",
        "Isilwen", "Lorien", "Therion", "Maelis", "Galadriel", "Aerenar", "Valindra", "Rilthain", "Arthion",
        "Saryndel", "Tirion", "Faelith", "Mirathis", "Aldaren", "Velyndra", "Kynthar", "Eryndor", "Zalthor",
        "Amarion", "Selith", "Nytheris", "Valthran", "Myrren", "Kalindra", "Oroneth", "Celyndra", "Zyrion",
        "Belthar", "Tariel", "Lytherion", "Ethariel", "Feyndor", "Caladorn", "Velthar", "Myrilion", "Zynthael",
        "Eredar", "Voranth", "Kaelith", "Thalyndra", "Falyndor", "Vaelin", "Aranel", "Maltheris", "Teyralis",
        "Elaris", "Aerynth", "Xylen", "Quorindor", "Nythriel", "Selyndra", "Aerion", "Zeryndal", "Myronis",
        "Valtherion", "Ithrandir", "Thaldris", "Vaeloris", "Rynelith", "Calenor", "Loryndor", "Xalithar",
        "Eryndriel", "Aelthran", "Nyrandis", "Velisara", "Quendris", "Zaltheris", "Lorindor", "Faelithar",
        "Orindal", "Therindar", "Faylora", "Aeltharis", "Vynthar", "Rilendor", "Galendris", "Thalindor", "Valtheris"
    };

        // List of single-word roles
        private static readonly List<string> Roles = new List<string>
    {
        "Mage", "Knight", "Guardian", "Hunter", "Priestess", "Rogue", "Scholar", "Bard", "Alchemist",
        "Warrior", "Seer", "Druid", "Paladin", "Necromancer", "Ranger"
    };

        // List of single-word personalities (adjectives)
        private static readonly List<string> Personalities = new List<string>
    {
        "Brave", "Cunning", "Wise", "Playful", "Serious", "Charming", "Mysterious", "Kind",
        "Fierce", "Calm", "Bold", "Witty", "Gentle", "Loyal", "Ambitious"
    };

        // Random generator
        private static readonly Random RandomGenerator = new Random();

        public static string GetRandomName()
        {
            int index = RandomGenerator.Next(Names.Count);
            return Names[index];
        }

        public static string GetRandomRole()
        {
            int index = RandomGenerator.Next(Roles.Count);
            return Roles[index];
        }

        public static string GetRandomPersonality()
        {
            int index = RandomGenerator.Next(Personalities.Count);
            return Personalities[index];
        }

        public static Character GenerateCharacter()
        {
            string name = GetRandomName();
            string role = GetRandomRole();
            string personality = $"{GetRandomPersonality()} and {GetRandomPersonality()}";

            return new Character(name, role, personality);
        }
    }
}