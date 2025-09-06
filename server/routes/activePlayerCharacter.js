const express = require("express");
const router = express.Router();
const ActivePCDAL = require("../dal/activePlayerCharacterDAL");

// Ensure active doc exists when entering a world with a given player character
// Body: { world_id, player_character_id }
router.post("/enter", async (req, res) => {
  try {
    const { world_id, player_character_id } = req.body || {};
    if (!world_id || !player_character_id) {
      return res.status(400).json({ error: "Missing world_id or player_character_id" });
    }
    const doc = await ActivePCDAL.ensure(world_id, player_character_id);
    res.status(200).json({ message: "Active player character ensured", activePlayerCharacter: doc });
  } catch (err) {
    console.error("Error ensuring active player character:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Add a quest to the active player character
// Body: { world_id, player_character_id, quest_id }
router.post("/quests/add", async (req, res) => {
  try {
    const { world_id, player_character_id, quest_id } = req.body || {};
    if (!world_id || !player_character_id || !quest_id) {
      return res.status(400).json({ error: "Missing world_id, player_character_id, or quest_id" });
    }
    const doc = await ActivePCDAL.addQuest(world_id, player_character_id, quest_id);
    res.status(200).json({ message: "Quest added to active player character", activePlayerCharacter: doc });
  } catch (err) {
    console.error("Error adding quest to active player character:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;

