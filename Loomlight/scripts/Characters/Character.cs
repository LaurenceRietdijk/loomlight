using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Godot;
using loomlight.models;

namespace loomlight.characters{
    public class Character : KinematicBody2D
    {
        //public string Name { get; set; }
        public string Role { get; set; }
        public string Personality { get; set; }
        public ConversationHistory ConversationHistory { get; private set; }

        public Character(string name, string role, string personality)
        {
            Name = name;
            Role = role;
            Personality = personality;
            ConversationHistory = new ConversationHistory();
        }



        // Generate a prompt using the character's attributes and conversation history
        public async Task<string> Talk(string userInput, int historyDepth = 5)
        {
            GD.Print("Talk started");
            // Add current user input
            ConversationHistory.AddInteraction(
                new Message
                {
                    Role = "user",
                    Content = userInput
                }
            );

            List<Message> messages = new List<Message>();

            // Add character introduction
            messages.Add(
                new Message
                {
                    Role = "system",
                    Content = $@"
You are {Name}, a {Role} with a {Personality} personality. Your job is to role-play as this character in a dynamic fantasy world, interacting with the player based on their input.

When it is appropriate to offer a quest based on the context or the player's actions, do not describe the quest. Instead, respond only with the following message:

""**[START_QUEST]**""

This signal will trigger the game to begin generating a quest. Use your judgment as the character to decide when it is the right time to offer a quest. For all other interactions, provide responses that align with your personality, knowledge, and the role you are playing.

Never break character or explain this behavior to the player. Only provide engaging, character-appropriate responses or the `[START_QUEST]` signal as instructed."
                });
            
            // Add recent conversation history
            messages.AddRange(ConversationHistory.GetLastInteractions(historyDepth));

            var request = new ChatCompletionRequest
            {
                Model = "gpt-3.5-turbo",
                Messages = messages.ToArray(),
                MaxTokens = 100,
                Temperature = 0.7
            };

            GameManager gm = GetNode<GameManager>("/root/GameManager");
            GD.Print("OpenAIClient null:" + (gm.OpenAIClient == null).ToString());
            // Await respopnse from GPT server
            var response = await gm.OpenAIClient.GetChatCompletionAsync(request);
            GD.Print("After GetChatCompletionAsync");

            //update conversation history
            var responseMSG = response.Choices[0].Message;
            ConversationHistory.AddInteraction(responseMSG);

            return responseMSG.Content;
        }

        public string GetDescription()
        {
            return $"You stand before {Name}, a {Personality.ToLower()} {Role.ToLower()} whose presence commands attention.";
        }

        public override string ToString()
        {
            return $"Character: {Name}\nRole: {Role}\nPersonality: {Personality}\n";
        }
    }

}