const OpenAI = require("openai");
const express = require("express");
const router = express.Router();

// Create an OpenAI instance
const openai = new OpenAI({
  apiKey: process.env.API_KEY, // Ensure this is set in your .env file
});

// Get all events
router.get("/", async (req, res) => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      store: true,
      messages: [{ role: "user", content: "Write a haiku about AI" }],
    });

    // Respond with the generated message
    res.status(200).send(completion.choices[0].message);
  } catch (error) {
    console.error("Error creating chat completion:", error);
    res.status(500).send({ error: "Failed to generate response" });
  }
});

/**
 * Character dialogue endpoint
 * Expects: { character: <object>, history: [{role, content}], user: <string> }
 * Returns: { reply: <string> }
 */
router.post("/character", async (req, res) => {
  try {
    const { character, history, user } = req.body || {};
    if (!character || !user) {
      return res.status(400).json({ error: "Missing character or user message" });
    }

    // Build system prompt with full character doc
    const system = `You are roleplaying as the following character. Stay in character, respond concisely and naturally.\n\n` +
      `CHARACTER DOCUMENT (JSON):\n${JSON.stringify(character, null, 2)}\n\n` +
      `Guidelines:\n- Do not reveal that you are an AI.\n- Keep responses grounded in the character's knowledge and context.\n- If asked about world details, rely on what's in the document or reasonable in-universe assumptions.`;

    const messages = [{ role: "system", content: system }];
    if (Array.isArray(history)) {
      for (const m of history) {
        if (!m || !m.role || !m.content) continue;
        const role = m.role === 'assistant' ? 'assistant' : 'user';
        messages.push({ role, content: String(m.content) });
      }
    }
    messages.push({ role: "user", content: String(user) });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.8,
    });

    const reply = completion.choices?.[0]?.message?.content ?? "";
    res.status(200).json({ reply });
  } catch (error) {
    console.error("Error in /chat/character:", error);
    res.status(500).json({ error: "Failed to generate character reply" });
  }
});

module.exports = router;
