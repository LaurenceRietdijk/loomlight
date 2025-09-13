const express = require("express");
const router = express.Router();
const BiomeDAL = require("../dal/biomeDAL");
const BiomeGenerator = require("../generation/biomeGenerator");
const World = require("../models/world");

/**
 * Fetch all biomes for a given world.
 */
router.get("/:world_id", async (req, res) => {
  try {
    const { world_id } = req.params;
    if (!world_id) {
      return res.status(400).json({ error: "Missing world_id" });
    }

    const biomes = await BiomeDAL.getBiomes(world_id);
    return res.status(200).json({ message: "Biomes found", biomes });
  } catch (error) {
    console.error("Error fetching biomes:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch a specific biome by ID within a world.
 */
router.get("/:world_id/:biome_id", async (req, res) => {
  try {
    const { world_id, biome_id } = req.params;
    if (!world_id || !biome_id) {
      return res.status(400).json({ error: "Missing world_id or biome_id" });
    }

    const biome = await BiomeDAL.getBiomeById(world_id, biome_id);
    if (biome) {
      return res.status(200).json({ message: "Biome found", biome });
    } else {
      return res.status(404).json({ error: "Biome not found" });
    }
  } catch (error) {
    console.error("Error fetching biome:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Generate new biomes for a world using AI and insert them via the DAL.
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

    const biomes = await BiomeGenerator.generateBiomes(world, count);
    res.status(201).json({ message: "Biomes generated", biomes });
  } catch (error) {
    console.error("Error generating biomes:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
