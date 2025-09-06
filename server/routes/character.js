const express = require("express");
const router = express.Router();
const CharacterDAL = require("../dal/characterDAL");
const QuestTracker = require("../quest/questTracker");

/**
 * Fetch a character by id (unpopulated/minimal refs).
 * Query: world_id, character_id
 */
router.get("/", async (req, res) => {
  try {
    const { world_id, character_id } = req.query;
    if (!world_id || !character_id) {
      return res.status(400).json({ error: "Missing world_id or character_id" });
    }
    const character = await CharacterDAL.getCharacterById(world_id, character_id);
    if (!character) {
      return res.status(404).json({ error: "Character not found" });
    }
    return res.status(200).json({ character });
  } catch (error) {
    console.error("Error fetching character:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch a character by id with fully populated references.
 * Query: world_id, character_id
 */
router.get("/full", async (req, res) => {
  try {
    const { world_id, character_id } = req.query;
    if (!world_id || !character_id) {
      return res.status(400).json({ error: "Missing world_id or character_id" });
    }
    const character = await CharacterDAL.getCharacterFullById(world_id, character_id);
    if (!character) {
      return res.status(404).json({ error: "Character not found" });
    }
    return res.status(200).json({ character });
  } catch (error) {
    console.error("Error fetching full character:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Mark a character as dead by setting status = 'dead'.
 * Body: { world_id: string, character_id: string }
 */
router.post("/kill", async (req, res) => {
  try {
    const { world_id, character_id } = req.body || {};
    if (!world_id || !character_id) {
      return res.status(400).json({ error: "Missing world_id or character_id" });
    }
    const updated = await CharacterDAL.updateCharacterStatus(world_id, character_id, "dead");
    if (!updated) return res.status(404).json({ error: "Character not found" });
    // Notify quest tracker (fire-and-forget)
    try { QuestTracker.onCharacterKilled(world_id, updated); } catch {}
    return res.status(200).json({ message: "Character marked as dead", character: updated });
  } catch (error) {
    console.error("Error killing character:", error);
    return res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
