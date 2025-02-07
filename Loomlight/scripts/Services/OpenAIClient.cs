using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using System.Threading.Tasks;
using loomlight.models;
using Godot;



namespace loomlight.Services
{
    public class OpenAIClient : Node
    {
        private readonly string _apiKey;

        public OpenAIClient()
        {
            _apiKey = Settings.ApiKey;
        }

        public async Task<ChatCompletionResponse> GetChatCompletionAsync(ChatCompletionRequest request)
        {
            GD.Print("request null:" + (request == null).ToString());
            //if (request == null)
                //throw new ArgumentNullException(nameof(request));

            var endpoint = "https://api.openai.com/v1/chat/completions";
            var placeholder = "ChatCompletion";

            // Serialize the request object to JSON
            var settings = new JsonSerializerSettings
            {
                ContractResolver = new DefaultContractResolver
                {
                    NamingStrategy = new SnakeCaseNamingStrategy()
                },
                Formatting = Formatting.Indented
            };

            string jsonBody = JsonConvert.SerializeObject(request, settings);
            if(Settings.HttpLoggingEnabled) GD.Print("Request: " + jsonBody);

            // Send the HTTP POST request
            string fetchRequestJs = $@"
                window.{placeholder} = null;
                fetch('{endpoint}', {{
                    method: 'POST',
                    headers: {{
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer {_apiKey}'
                    }},
                    body: JSON.stringify({jsonBody})
                }})
                .then(response => {{
                    if (!response.ok) {{
                        return response.text().then(errorText => {{
                            throw new Error('HTTP ' + response.status + ': ' + errorText);
                        }});
                    }}
                    return response.json();
                }})
                .then(data => {{
                    window.{placeholder} = JSON.stringify(data);
                }})
                .catch(error => {{
                    console.error('Error:', error);
                }});
                ";

            JavaScript.Eval(fetchRequestJs);

            Helper helper = GetNode<GameManager>("/root/GameManager").Helper;
            var responseJson = await helper.CheckForResultsAsync(placeholder);
            if (responseJson != null)
            {
                var response = JsonConvert.DeserializeObject<ChatCompletionResponse>(responseJson, settings);
                if (Settings.HttpLoggingEnabled) GD.Print("Response: " + JsonConvert.SerializeObject(response, settings));
                return response;
            }else{
                GD.Print("error: null reply. default response object sent.");
                return new ChatCompletionResponse
                {
                    Choices = new[]
                    {
                        new Choice
                        {
                            Message = new Message
                            {
                                Role = "assistant",
                                Content = "Sorry, there was an error retriving a GPT response."
                            }
                        }
                    }
                };
            }
        }
    }

}