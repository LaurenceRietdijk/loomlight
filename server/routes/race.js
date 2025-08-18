const express = require("express");
const router = express.Router();
const RaceDAL = require("../dal/raceDAL");
const RaceGenerator = require("../generation/raceGenerator");
const World = require("../models/world");

/**
 * Fetch all races for a given world.
 */
router.get("/:world_id", async (req, res) => {
  try {
    const { world_id } = req.params;
    if (!world_id) {
      return res.status(400).json({ error: "Missing world_id" });
    }

    const races = await RaceDAL.getRaces(world_id);
    return res.status(200).json({ message: "Races found", races });
  } catch (error) {
    console.error("Error fetching races:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch a specific race by ID within a world.
 */
router.get("/:world_id/:race_id", async (req, res) => {
  try {
    const { world_id, race_id } = req.params;
    if (!world_id || !race_id) {
      return res.status(400).json({ error: "Missing world_id or race_id" });
    }

    const race = await RaceDAL.getRaceById(world_id, race_id);
    if (race) {
      return res.status(200).json({ message: "Race found", race });
    } else {
      return res.status(404).json({ error: "Race not found" });
    }
  } catch (error) {
    console.error("Error fetching race:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Generate new races for a world using AI and insert them via the DAL.
 */
router.post("/:world_id/generate", async (req, res) => {
  try {
    const { world_id } = req.params;
    const { count } = req.body || {};
    if (!world_id) {
      return res.status(400).json({ error: "Missing world_id" });
    }

    const world = await World.findById(world_id).exec();
    if (!world) {
      return res.status(404).json({ error: "World not found" });
    }

    const races = await RaceGenerator.generateRaces(world, count);
    res.status(201).json({ message: "Races generated", races });
  } catch (error) {
    console.error("Error generating races:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
