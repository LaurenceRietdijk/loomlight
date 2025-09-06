const OpenAI = require("openai");
const express = require("express");
const router = express.Router();
const CharacterDAL = require("../dal/characterDAL");

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
 * Accepts either:
 *  - { world_id: string, character_id: string, history?: [{role, content}], user: string }
 *  - { character: object, history?: [{role, content}], user: string } (fallback)
 * Returns: { text: string, commands: Array<object> }
 */
router.post("/character", async (req, res) => {
  try {
    const { world_id, character_id, character: characterInput, history, user } = req.body || {};
    if (!user) return res.status(400).json({ error: "Missing user message" });

    // Prefer server-side retrieval of fully populated character
    let character = null;
    if (world_id && character_id) {
      character = await CharacterDAL.getCharacterFullById(world_id, character_id);
      if (!character) return res.status(404).json({ error: "Character not found" });
    } else if (characterInput) {
      // Fallback for older clients sending a character object directly
      character = characterInput;
    } else {
      return res.status(400).json({ error: "Missing world_id/character_id or character object" });
    }

    // Build system prompt with full character doc and strict JSON output policy
    const example = {
      text: 'Very well, the task is yours. Travel east to the old ruins.',
      commands: [ { action: 'QUEST_ACCEPTED', quest_id: '68b3f7b73ecf80439bbd740b' } ]
    };
    const guidelines = [
      'You are roleplaying as the following character. Stay in character, respond concisely and naturally.',
      'Do not reveal that you are an AI.',
      'Keep responses grounded in the character\'s knowledge and context.',
      'If asked about world details, rely on what\'s in the document or reasonable in-universe assumptions.',
      '',
      'Output format policy (STRICT):',
      '- Reply ONLY with a single line of valid JSON (no backticks, no commentary, no prefixes).',
      '- Shape must be: { "text": string, "commands": array }',
      '- The "text" is the character\'s spoken reply.',
      '- The "commands" is an array of command objects describing side effects, e.g. { "action": "QUEST_ACCEPTED", "quest_id": "..." }.',
      '- If there are no commands, set "commands": [].',
      '- Never include markdown code fences, XML, or extra fields not asked for.'
    ].join('\n');
    const system = `${guidelines}\n\nExample JSON:\n${JSON.stringify(example)}\n\nCHARACTER DOCUMENT (JSON):\n${JSON.stringify(character, null, 2)}`;

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

    const raw = completion.choices?.[0]?.message?.content ?? "";
    const tryParse = (s) => {
      if (!s) return null;
      let t = String(s).trim();
      t = t.replace(/^```(?:json)?/i, '').replace(/```$/,'').trim();
      try { return JSON.parse(t); } catch {}
      const first = t.indexOf('{'); const last = t.lastIndexOf('}');
      if (first !== -1 && last !== -1 && last > first) {
        const sub = t.slice(first, last + 1);
        try { return JSON.parse(sub); } catch {}
      }
      return null;
    };
    const parsed = tryParse(raw);
    const text = parsed && typeof parsed.text === 'string' ? parsed.text : String(raw).trim();
    const commands = parsed && Array.isArray(parsed.commands) ? parsed.commands : [];
    res.status(200).json({ text, commands });
  } catch (error) {
    console.error("Error in /chat/character:", error);
    res.status(500).json({ error: "Failed to generate character reply" });
  }
});

module.exports = router;
