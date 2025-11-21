const express = require("express");
const router = express.Router();
const VegetationDAL = require("../dal/vegetationDAL");
const VegetationGenerator = require("../generation/vegetationGenerator");
const World = require("../models/world");

/**
 * Fetch all vegetations stored in the central Worlds database.
 */
router.get("/", async (req, res) => {
  try {
    const vegetations = await VegetationDAL.getVegetations();
    return res.status(200).json({ message: "Vegetations found", vegetations });
  } catch (error) {
    console.error("Error fetching vegetations:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Create a new vegetation entry.
 */
router.post("/", async (req, res) => {
  try {
    const { name, description, type } = req.body || {};
    if (!name || !description || !type) {
      return res.status(400).json({ error: "Name, description, and type are required" });
    }

    const validTypes = ['flower', 'grass', 'bush', 'tree', 'fungus', 'moss', 'lichen', 'briar', 'lily'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Type must be one of: ${validTypes.join(', ')}` });
    }

    const vegetationData = {
      name: String(name).trim(),
      description: String(description).trim(),
      type: String(type).trim(),
    };

    const vegetation = await VegetationDAL.insertVegetation(vegetationData);
    res.status(201).json({ message: "Vegetation created", vegetation });
  } catch (error) {
    console.error("Error creating vegetation:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch a specific vegetation by Mongo ObjectId.
 */
router.get("/:vegetation_id", async (req, res) => {
  try {
    const { vegetation_id } = req.params;
    if (!vegetation_id) {
      return res.status(400).json({ error: "Missing vegetation_id" });
    }

    const vegetation = await VegetationDAL.getVegetationById(vegetation_id);
    if (vegetation) {
      return res.status(200).json({ message: "Vegetation found", vegetation });
    }

    return res.status(404).json({ error: "Vegetation not found" });
  } catch (error) {
    console.error("Error fetching vegetation:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Generate a single vegetation document.
 * Optional body: { world_id?: string, preferredName?: string, preferredType?: string }
 */
router.post("/generate", async (req, res) => {
  try {
    const { world_id, preferredName, preferredType } = req.body || {};

    let world = null;
    if (world_id) {
      world = await World.findById(world_id).exec();
      if (!world) {
        return res.status(404).json({ error: "World not found" });
      }
    }

    const options = {};
    if (preferredName) {
      options.preferredName = preferredName;
    }
    if (preferredType) {
      options.preferredType = preferredType;
    }

    const vegetation = await VegetationGenerator.generateVegetation(world, options);
    res.status(201).json({ message: "Vegetation generated", vegetation });
  } catch (error) {
    console.error("Error generating vegetation:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Trigger image generation for a specific vegetation or the next pending one.
 * Optional body: { vegetation_id?: string }
 */
router.post("/generate-image", async (req, res) => {
  try {
    const { vegetation_id } = req.body || {};
    const vegetationImageJob = require("../jobs/vegetationImageJob");
    
    let result;
    if (vegetation_id) {
      // Generate for specific vegetation
      const vegetation = await VegetationDAL.getVegetationById(vegetation_id);
      if (!vegetation) {
        return res.status(404).json({ error: "Vegetation not found" });
      }
      result = await vegetationImageJob.generateVegetationImage(vegetation);
    } else {
      // Generate for next pending vegetation
      result = await vegetationImageJob.generateNextVegetationImage();
    }
    
    if (result) {
      return res.status(200).json({ 
        message: "Image generation completed", 
        vegetation: result.vegetation,
        target: result.target 
      });
    } else {
      return res.status(404).json({ error: "No vegetation images pending" });
    }
  } catch (error) {
    console.error("Error generating vegetation image:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Delete a vegetation by Mongo ObjectId.
 */
router.delete("/:vegetation_id", async (req, res) => {
  try {
    const { vegetation_id } = req.params;
    if (!vegetation_id) {
      return res.status(400).json({ error: "Missing vegetation_id" });
    }

    const removed = await VegetationDAL.deleteVegetationById(vegetation_id);
    if (!removed) {
      return res.status(404).json({ error: "Vegetation not found" });
    }

    res.status(200).json({ message: "Vegetation deleted", vegetation: removed });
  } catch (error) {
    console.error("Error deleting vegetation:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
