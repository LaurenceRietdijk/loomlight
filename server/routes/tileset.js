const express = require("express");
const router = express.Router();
const TilesetDAL = require("../dal/tilesetDAL");

// Fetch a tileset document by ObjectId
router.get("/:tileset_id", async (req, res) => {
  try {
    const { tileset_id } = req.params || {};
    if (!tileset_id) {
      return res.status(400).json({ error: "Missing tileset_id" });
    }
    const tileset = await TilesetDAL.getById(tileset_id);
    if (!tileset) {
      return res.status(404).json({ error: "Tileset not found" });
    }
    return res.status(200).json({ message: "Tileset found", tileset });
  } catch (error) {
    console.error("Error fetching tileset:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;

