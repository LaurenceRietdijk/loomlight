using Godot;
using System;
using System.Threading.Tasks;

namespace loomlight
{
    public class Helper : Node
    {
        public static Helper Instance { get; private set; }
        private Timer _timer;

        public override void _Ready()
        {
            Instance = this;
            _timer = new Timer();
            AddChild(_timer);
            GD.Print("Helper is ready!");
        }

        public async Task Delay(int milliseconds)
        {
            // Reset Timer properties for reuse
            _timer.WaitTime = milliseconds / 1000f;
            _timer.OneShot = true;

            // Start the Timer
            if (!_timer.IsStopped())
            {
                _timer.Stop(); // Ensure the timer isn't already running
            }
            _timer.Start();

            // Await the timeout signal
            await ToSignal(_timer, "timeout");
        }

        public string test()
        {
            return "test worked!";
        }

        public async Task<string> CheckForResultsAsync(string field, int timeoutLimit = 50, int delayInterval = 100)
        {
            if (Settings.PollingLoggingEnabled) GD.Print("Starting polling...");

            if (string.IsNullOrWhiteSpace(field))
                throw new ArgumentException("Field name cannot be null or empty.", nameof(field));

            string result = null;
            int attempts = 0;

            while (result == null && attempts < timeoutLimit)
            {
                if (Settings.PollingLoggingEnabled) GD.Print($"Polling attempt: {attempts + 1}/{timeoutLimit}");

                try
                {
                    var evalResult = (string)JavaScript.Eval($"window.{field}");
                    result = evalResult != null ? (string)evalResult : null;
                }
                catch (Exception ex)
                {
                    GD.Print($"Error during JavaScript.Eval: {ex.Message}");
                    break; // Exit on exception
                }

                attempts++;

                if (result == null)
                {
                    if (Settings.PollingLoggingEnabled) GD.Print("before wait");
                    await Delay(delayInterval);
                    if (Settings.PollingLoggingEnabled) GD.Print("after wait");
                }
            }

            if (Settings.PollingLoggingEnabled) GD.Print($"Polling finished. Result null: {result == null}");
            return result;
        }

        public void TextToSpeech(string textToSpeak)
        {
            if (string.IsNullOrWhiteSpace(textToSpeak))
            {
                GD.Print("Error: Empty string sent to Text-to-speach");
                return;
            }

            // Call JavaScript to perform Text-to-Speech
            string jsCode = $@"
            const utterance = new SpeechSynthesisUtterance('{EscapeForJavaScript(textToSpeak)}');
            utterance.lang = 'en-US'; // Set language
            utterance.rate = 1; // Normal speaking rate
            utterance.pitch = 1; // Normal pitch
            utterance.volume = 1; // Full volume

            window.speechSynthesis.cancel();
            window.speechSynthesis.speak(utterance); // Start speaking";
            JavaScript.Eval(jsCode);
        }


        private string EscapeForJavaScript(string input)
        {
            if (string.IsNullOrEmpty(input))
                return input;

            return input
                .Replace("\\", "\\\\") // Escape backslashes
                .Replace("'", "\\'")   // Escape single quotes
                .Replace("\"", "\\\"") // Escape double quotes
                .Replace("\n", " ")    // Replace newlines with spaces
                .Replace("\r", "");    // Remove carriage returns
        }

    }
}