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
    if (!apiKey) {
      throw new Error("Missing OpenAI API key. Set API_KEY or OPENAI_API_KEY in the environment.");
    }

    this.client = new OpenAI({ apiKey });

    const envModel =
      process.env.OPENAI_MODEL ||
      process.env.GPT_MODEL ||
      process.env.OPENAI_DEFAULT_MODEL ||
      process.env.DEFAULT_OPENAI_MODEL ||
      "gpt-3.5-turbo";

    this.chatModel = typeof envModel === "string" ? envModel.trim() : "";
    if (!this.chatModel) {
      throw new Error("Missing OpenAI model. Set OPENAI_MODEL in the environment.");
    }
  }

  /**
   * Executes a chat completion request and returns the raw text
   * of the first choice.
   *
   * @param {Array<Object>} messages - Array of chat messages
   *   following the OpenAI format.
   * @param {Object} options - Additional completion options such
   *   as temperature or max_tokens. The model is configured via environment variables.
   * @returns {Promise<string>} The message content from the first choice.
   */
  async chat(messages, options = {}) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error("GPTService.chat requires a non-empty messages array");
    }

    if (Object.prototype.hasOwnProperty.call(options, "model") && options.model !== undefined) {
      throw new Error("GPTService no longer allows per-request model overrides. Configure OPENAI_MODEL via environment variables.");
    }

    const { model: _ignoredModel, ...rest } = options;

    const completion = await this.client.chat.completions.create({
      model: this.chatModel,
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
   * Executes a chat completion using high-level prompt inputs instead of raw
   * message arrays. Accepts strings or message objects/arrays for both the
   * system preamble and the conversation turns.
   *
   * @param {string|Object|Array} systemInput - Content applied with system role.
   * @param {string|Object|Array} conversationInput - Content applied with user role
   *   by default. Supply message objects to control roles manually.
   * @param {Object} options - Completion options forwarded to the API.
   * @returns {Promise<string>} Raw text response from the first choice.
   */
  async chatPrompt(systemInput, conversationInput, options = {}) {
    const messages = GPTService.buildMessages(systemInput, conversationInput);
    if (!messages.length) {
      throw new Error("No messages provided for chatPrompt");
    }
    return this.chat(messages, options);
  }

  /**
   * Runs a prompt-based chat completion and parses the response as JSON.
   *
   * @param {string|Object|Array} systemInput - System context applied first.
   * @param {string|Object|Array} conversationInput - Primary prompt / turns.
   * @param {Object} options - Completion options forwarded to the API.
   * @returns {Promise<unknown>} Parsed JSON payload.
   */
  async chatJSONPrompt(systemInput, conversationInput, options = {}) {
    const content = await this.chatPrompt(systemInput, conversationInput, options);
    return GPTService.parseJSONLoose(content);
  }

  /**
   * Normalises arbitrary prompt inputs (strings, message objects, nested arrays)
   * into an array of OpenAI chat message objects. When a role is not provided,
   * the supplied defaultRole is used.
   * @param {string|Object|Array|undefined} input
   * @param {string} defaultRole
   * @returns {Array<{role: string, content: string}>}
   */
  static normalizeMessages(input, defaultRole) {
    if (input === undefined || input === null) return [];

    const stack = Array.isArray(input) ? input : [input];
    const normalised = [];

    for (const entry of stack) {
      if (entry === undefined || entry === null) continue;

      if (Array.isArray(entry)) {
        normalised.push(...GPTService.normalizeMessages(entry, defaultRole));
        continue;
      }

      if (typeof entry === "string") {
        const trimmed = entry.trim();
        if (trimmed) normalised.push({ role: defaultRole, content: trimmed });
        continue;
      }

      if (typeof entry === "object") {
        const role =
          typeof entry.role === "string" && entry.role.trim()
            ? entry.role
            : defaultRole;
        const source =
          entry.content ?? entry.text ?? entry.message ?? entry.value;
        if (source === undefined || source === null) continue;
        const content = String(source).trim();
        if (content) normalised.push({ role, content });
        continue;
      }

      const fallback = String(entry).trim();
      if (fallback) normalised.push({ role: defaultRole, content: fallback });
    }

    return normalised;
  }

  /**
   * Builds a chat message array from high-level prompt pieces.
   * @param {string|Object|Array} systemInput
   * @param {string|Object|Array} conversationInput
   * @returns {Array<{role: string, content: string}>}
   */
  static buildMessages(systemInput, conversationInput) {
    return [
      ...GPTService.normalizeMessages(systemInput, "system"),
      ...GPTService.normalizeMessages(conversationInput, "user"),
    ];
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
