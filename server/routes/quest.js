const express = require("express");
const router = express.Router();

const QuestGenerator = require("../generation/questGenerator");
const QuestDAL = require("../dal/questDAL");
const CharacterDAL = require("../dal/characterDAL");
const ActivePCDAL = require("../dal/activePlayerCharacterDAL");

const ALLOWED_TYPES = ["Fetch", "Deliver", "Kill", "Gather", "Explore", "Clear"];

/**
 * Fetch a quest by id with fully populated references.
 * Query: world_id, quest_id
 */
router.get("/full", async (req, res) => {
  try {
    const { world_id, quest_id } = req.query || {};
    if (!world_id || !quest_id) {
      return res.status(400).json({ error: "Missing world_id or quest_id" });
    }
    const quest = await QuestDAL.getQuestFullById(world_id, quest_id);
    if (!quest) return res.status(404).json({ error: "Quest not found" });
    return res.status(200).json({ quest });
  } catch (error) {
    console.error("Error fetching full quest:", error);
    return res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Request generation of a new quest for a specified character.
 * Body: { world_id: string, character_id: string, type?: one of ALLOWED_TYPES }
 */
router.post("/generate", async (req, res) => {
  try {
    const { world_id, character_id, type } = req.body || {};
    if (!world_id || !character_id) {
      return res.status(400).json({ error: "Missing world_id or character_id" });
    }

    if (type && !ALLOWED_TYPES.includes(type)) {
      return res.status(400).json({ error: `Invalid quest type. Must be one of: ${ALLOWED_TYPES.join(", ")}` });
    }

    // Pick a random type if not specified
    const selectedType = type || ALLOWED_TYPES[Math.floor(Math.random() * ALLOWED_TYPES.length)];

    const result = await QuestGenerator.generateAndInsertQuest(world_id, character_id, selectedType);

    if (!result) {
      return res.status(501).json({
        message: "Quest generation not implemented yet",
        type: selectedType,
      });
    }

    return res.status(201).json({ message: "Quest generated", quest: result, type: selectedType });
  } catch (error) {
    console.error("Error handling quest generation:", error);
    return res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Accept a quest: set its state to 'acepted'. Optionally ensure linkage to character.
 * Body: { world_id: string, quest_id: string, character_id?: string }
 */
router.post("/accept", async (req, res) => {
  try {
    const { world_id, quest_id, character_id, player_character_id } = req.body || {};
    if (!world_id || !quest_id) {
      return res.status(400).json({ error: "Missing world_id or quest_id" });
    }

    // Update quest state (enum uses 'acepted') and record accepting active player character
    let quest = await QuestDAL.updateQuestState(world_id, quest_id, "acepted", player_character_id || undefined);
    if (!quest) return res.status(404).json({ error: "Quest not found" });

    // Optionally ensure quest is linked to NPC character
    if (character_id) {
      try {
        await CharacterDAL.addQuestToCharacter(world_id, character_id, quest._id);
      } catch (e) {
        // non-fatal
      }
    }

    // Add quest to active player character doc for this world
    if (player_character_id) {
      try {
        await ActivePCDAL.addQuest(world_id, player_character_id, quest._id);
      } catch (e) {
        // non-fatal
      }
    }

    // For Clear quests, recompute enemiesRemaining at acceptance for safety
    try {
      if (quest.questType === 'Clear') {
        quest = await QuestDAL.recomputeClearQuest(world_id, quest._id);
      }
    } catch {}

    return res.status(200).json({ message: "Quest accepted", quest });
  } catch (error) {
    console.error("Error accepting quest:", error);
    return res.status(500).json({ error: "Server Error" });
  }
});

/**
 * List quests accepted by a given active player character.
 * Query: world_id, player_character_id
 */
router.get("/accepted", async (req, res) => {
  try {
    const { world_id, player_character_id } = req.query || {};
    if (!world_id || !player_character_id) {
      return res.status(400).json({ error: "Missing world_id or player_character_id" });
    }
    const quests = await QuestDAL.getQuestsByAcceptedBy(world_id, player_character_id, ["acepted", "completed"]);
    return res.status(200).json({ quests });
  } catch (error) {
    console.error("Error listing accepted quests:", error);
    return res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
