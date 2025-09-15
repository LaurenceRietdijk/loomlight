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
    const apiKey = process.env.API_KEY || process.env.OPENAI_API_KEY;
    this.client = new OpenAI({ apiKey });
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
   * the result as JSON. Attempts to be resilient to common
   * formatting artifacts (e.g., Markdown code fences).
   *
   * The prompt should instruct the model to return valid JSON.
   *
   * @param {Array<Object>} messages - Chat messages for the model.
   * @param {Object} options - Completion options.
   * @returns {Promise<unknown>} Parsed JSON response.
   */
  async chatJSON(messages, options = {}) {
    const content = await this.chat(messages, options);
    return GPTService.parseJSONLoose(content);
  }

  /**
   * Parse JSON robustly from a model response by trying several
   * common patterns (full string, fenced code block, substring from
   * first bracket). Throws on failure.
   * @param {string} text
   * @returns {unknown}
   */
  static parseJSONLoose(text) {
    if (!text) throw new Error("Empty model response");
    const t = String(text).trim();
    const candidates = [t];
    // Extract fenced code block if present
    const fence = t.match(/```(?:json|JSON)?\s*([\s\S]*?)\s*```/);
    if (fence && fence[1]) candidates.push(fence[1].trim());
    // From first JSON-looking bracket
    const firstArr = t.indexOf("[");
    const firstObj = t.indexOf("{");
    const firstBrace =
      firstArr === -1 && firstObj === -1
        ? -1
        : firstArr === -1
        ? firstObj
        : firstObj === -1
        ? firstArr
        : Math.min(firstArr, firstObj);
    if (firstBrace !== -1) candidates.push(t.slice(firstBrace));
    for (const c of candidates) {
      try {
        return JSON.parse(c);
      } catch (_) {}
    }
    const err = new Error("Failed to parse JSON from model response");
    err.raw = t;
    throw err;
  }
}

module.exports = new GPTService();
