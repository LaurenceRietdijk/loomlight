const express = require("express");
const router = express.Router();
const WorldDAL = require("../dal/worldDAL");
const WorldGenerator = require("../generation/worldGenerator");
const FactionGenerator = require("../generation/factionGenerator");
const getDatabaseConnection = require("../config/worldDBs");

/**
 * List all worlds in the central database.
 */
router.get("/", async (req, res) => {
  try {
    const worlds = await WorldDAL.getAllWorlds();
    res.status(200).json({ worlds });
  } catch (error) {
    console.error("Error listing worlds:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch an existing world from the database (no AI generation).
 */
router.get("/:world_id", async (req, res) => {
  try {
    const { world_id } = req.params;
    if (!world_id) {
      return res.status(400).json({ error: "Missing world_id" });
    }

    const world = await WorldDAL.getWorld(world_id);
    if (world) {
      return res.status(200).json({ message: "World found", world });
    } else {
      return res.status(404).json({ error: "World not found" });
    }
  } catch (error) {
    console.error("Error fetching world:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Generate a new world using AI and insert it via the DAL.
 */
router.post("/generate", async (req, res) => {
  try {
    const { creator } = req.body;
    if (!creator) {
      return res.status(400).json({ error: "Missing creator ID" });
    }

    // AI generation + database insertion
    const newWorld = await WorldGenerator.generateWorld(creator);
    await FactionGenerator.generateFactions(newWorld);

    res.status(201).json({ message: "World generated", world: newWorld });
  } catch (error) {
    console.error("Error generating world:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Delete a specific world and drop its dedicated database.
 */
router.delete("/:world_id", async (req, res) => {
  try {
    const { world_id } = req.params;
    if (!world_id) {
      return res.status(400).json({ error: "Missing world_id" });
    }

    // Drop the per-world database
    const worldDB = getDatabaseConnection(world_id);
    await worldDB.dropDatabase();

    // Remove world document from central database
    await WorldDAL.deleteWorld(world_id);

    res.status(200).json({ message: "World deleted", world_id });
  } catch (error) {
    console.error("Error deleting world:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
