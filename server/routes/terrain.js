const express = require("express");
const router = express.Router();
const TerrainDAL = require("../dal/terrainDAL");
const TerrainGenerator = require("../generation/terrainGenerator");
const pixelLabTilesetService = require("../services/pixelLabTilesetService");
const World = require("../models/world");
const mongoose = require("mongoose");

function ensureObjectId(value) {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(value);
  }
  return null;
}

/**
 * Fetch all terrains stored in the central Worlds database.
 */
router.get("/", async (req, res) => {
  try {
    const terrains = await TerrainDAL.getTerrains();
    return res.status(200).json({ message: "Terrains found", terrains });
  } catch (error) {
    console.error("Error fetching terrains:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Create a new terrain entry.
 */
router.post("/", async (req, res) => {
  try {
    const { name, description, neighbours } = req.body || {};
    if (!name || !description) {
      return res.status(400).json({ error: "Name and description are required" });
    }

    const terrainData = {
      name: String(name).trim(),
      description: String(description).trim(),
    };

    if (neighbours && typeof neighbours === "object" && !Array.isArray(neighbours)) {
      terrainData.neighbours = neighbours;
    }

    const terrain = await TerrainDAL.insertTerrain(terrainData);
    res.status(201).json({ message: "Terrain created", terrain });
  } catch (error) {
    console.error("Error creating terrain:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch a specific terrain by Mongo ObjectId.
 */
router.get("/:terrain_id", async (req, res) => {
  try {
    const { terrain_id } = req.params;
    if (!terrain_id) {
      return res.status(400).json({ error: "Missing terrain_id" });
    }

    const terrain = await TerrainDAL.getTerrainById(terrain_id);
    if (terrain) {
      return res.status(200).json({ message: "Terrain found", terrain });
    }

    return res.status(404).json({ error: "Terrain not found" });
  } catch (error) {
    console.error("Error fetching terrain:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Generate a single terrain document.
 * Optional body: { world_id?: string }
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

    const terrain = await TerrainGenerator.generateTerrain(world);
    res.status(201).json({ message: "Terrain generated", terrain });
  } catch (error) {
    console.error("Error generating terrain:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Manually trigger PixelLab tileset generation between two terrains.
 */
router.post("/tilesets", async (req, res) => {
  try {
    const { lower_id, upper_id, options } = req.body || {};
    const lowerId = ensureObjectId(lower_id);
    const upperId = ensureObjectId(upper_id);

    if (!lowerId || !upperId) {
      return res.status(400).json({ error: "lower_id and upper_id must be valid terrain ObjectIds" });
    }
    if (lowerId.equals(upperId)) {
      return res.status(400).json({ error: "Select two different terrains" });
    }

    console.log("[TerrainRoute] Manual tileset generation requested", {
      lowerId: lowerId.toString(),
      upperId: upperId.toString(),
    });

    const lowerTerrain = await TerrainDAL.getTerrainById(lowerId);
    if (!lowerTerrain) {
      return res.status(404).json({ error: "Lower terrain not found" });
    }

    const upperTerrain = await TerrainDAL.getTerrainById(upperId);
    if (!upperTerrain) {
      return res.status(404).json({ error: "Upper terrain not found" });
    }

    const tilesetOptions = options && typeof options === "object" ? options : {};
    tilesetOptions.allowUpperBaseUid = false; // ← enable the probe

    const tilesetJob = await pixelLabTilesetService.generateTileset(
      lowerTerrain,
      upperTerrain,
      tilesetOptions
    );

    console.log("[TerrainRoute] Manual tileset generation completed", {
      jobId: tilesetJob?.jobId,
      tilesetId: tilesetJob?.tilesetId,
    });

    return res.status(200).json({
      message: "Tileset generated",
      tilesetJob,
      terrains: {
        lower: {
          _id: lowerTerrain._id ? lowerTerrain._id.toString() : null,
          name: lowerTerrain.name,
        },
        upper: {
          _id: upperTerrain._id ? upperTerrain._id.toString() : null,
          name: upperTerrain.name,
        },
      },
    });
  } catch (error) {
    console.error("[TerrainRoute] Manual tileset generation failed", error);
    const message = error?.message || "Tileset generation failed";
    return res.status(500).json({ error: "Tileset generation failed", details: message });
  }
});

/**
 * Delete a terrain by Mongo ObjectId.
 */
router.delete("/:terrain_id", async (req, res) => {
  try {
    const { terrain_id } = req.params;
    if (!terrain_id) {
      return res.status(400).json({ error: "Missing terrain_id" });
    }

    const removed = await TerrainDAL.deleteTerrainById(terrain_id);
    if (!removed) {
      return res.status(404).json({ error: "Terrain not found" });
    }

    res.status(200).json({ message: "Terrain deleted", terrain: removed });
  } catch (error) {
    console.error("Error deleting terrain:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
