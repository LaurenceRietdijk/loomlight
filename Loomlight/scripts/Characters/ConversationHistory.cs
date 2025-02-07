using System;
using System.Collections.Generic;
using loomlight.models;

namespace loomlight.characters
{
    public class ConversationHistory
    {
        private List<Message> _history;

        public ConversationHistory()
        {
            _history = new List<Message>();
        }

        // Add a new prompt-response pair to the history
        public void AddInteraction(Message msg)
        {
            _history.Add(msg);
        }

        // Retrieve the entire history
        public List<Message> GetHistory()
        {
            return new List<Message>(_history);
        }

        // Retrieve the last N interactions
        public List<Message> GetLastInteractions(int count)
        {
            int start = Math.Max(0, _history.Count - count);
            return _history.GetRange(start, _history.Count - start);
        }

        // Clear the conversation history
        public void ClearHistory()
        {
            _history.Clear();
        }

        // Display the history as a formatted string
        public override string ToString()
        {
            var result = "";
            foreach (Message msg in _history)
            {
                result += $"{msg.Role}: {msg.Content}\n";
            }
            return result.Trim();
        }
    }
}
