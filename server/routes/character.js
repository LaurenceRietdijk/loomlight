const express = require("express");
const router = express.Router();
const CharacterDAL = require("../dal/characterDAL");

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

// Removed /character/kill endpoint; client handles local-only kill state

module.exports = router;
