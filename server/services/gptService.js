const OpenAI = require("openai");

/**
 * Thin wrapper around OpenAI's chat completions API.
 *
 * The service exposes helper methods that will be reused by
 * the various content generators, keeping their code concise
 * and centralized in one place.
 */
class GPTService {
  constructor() {
    this.client = new OpenAI({ apiKey: process.env.API_KEY });
  }

  /**
   * Executes a chat completion request and returns the raw text
   * of the first choice.
   *
   * @param {Array<Object>} messages - Array of chat messages
   *   following the OpenAI format.
   * @param {Object} options - Additional completion options such
   *   as model, temperature, or max_tokens.
   * @returns {Promise<string>} The message content from the first choice.
   */
  async chat(messages, options = {}) {
    const { model = "gpt-3.5-turbo", ...rest } = options;

    const completion = await this.client.chat.completions.create({
      model,
      messages,
      ...rest,
    });

    return completion.choices[0].message.content;
  }

  /**
   * Convenience method that runs a chat completion and parses
   * the result as JSON. The prompt **must** instruct the model
   * to return valid JSON for this to succeed.
   *
   * @param {Array<Object>} messages - Chat messages for the model.
   * @param {Object} options - Completion options.
   * @returns {Promise<Object>} Parsed JSON response.
   */
  async chatJSON(messages, options = {}) {
    const content = await this.chat(messages, options);
    return JSON.parse(content);
  }
}

module.exports = new GPTService();
