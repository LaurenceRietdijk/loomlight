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

module.exports = router;
