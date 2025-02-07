using System;

namespace loomlight.models
{
    public class ChatCompletionRequest
    {
        public string Model { get; set; }
        public Message[] Messages { get; set; }
        public int MaxTokens { get; set; }
        public double Temperature { get; set; }
    }

    public class Message
    {
        public string Role { get; set; }
        public string Content { get; set; }
    }
}