const express = require("express");
const router = express.Router();
const BiomeDAL = require("../dal/biomeDAL");
const BiomeGenerator = require("../generation/biomeGenerator");
const World = require("../models/world");

/**
 * Fetch all biomes (global across worlds).
 */
router.get("/", async (req, res) => {
  try {
    const biomes = await BiomeDAL.getBiomes();
    return res.status(200).json({ message: "Biomes found", biomes });
  } catch (error) {
    console.error("Error fetching biomes:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch a specific biome by ID (global).
 */
router.get("/:biome_id", async (req, res) => {
  try {
    const { biome_id } = req.params;
    if (!biome_id) {
      return res.status(400).json({ error: "Missing biome_id" });
    }

    const biome = await BiomeDAL.getBiomeById(biome_id);
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
 * Generate a single global biome using AI.
 * Optional body: { world_id?: string } to provide world context for GPT.
 */
router.post("/generate", async (req, res) => {
  try {
    const { world_id } = req.body || {};

    let world = null;
    if (world_id) {
      world = await World.findById(world_id).exec();
      if (!world) {
        return res.status(404).json({ error: "World not found" });
      }
    }

    const biome = await BiomeGenerator.generateBiome(world);
    res.status(201).json({ message: "Biome generated", biome });
  } catch (error) {
    console.error("Error generating biome:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
