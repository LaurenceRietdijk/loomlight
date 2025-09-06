const express = require("express");
const router = express.Router();
const PlayerCharacterDAL = require("../dal/playerCharacterDAL");

// List all player characters (global across worlds)
router.get("/", async (req, res) => {
  try {
    const playerCharacters = await PlayerCharacterDAL.getAll();
    res.status(200).json({ playerCharacters });
  } catch (err) {
    console.error("Error listing player characters:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Create a new player character
router.post("/", async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    const pc = await PlayerCharacterDAL.create(String(name).trim());
    res.status(201).json({ message: "PlayerCharacter created", playerCharacter: pc });
  } catch (err) {
    console.error("Error creating player character:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

// Delete a player character by id
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Missing id" });
    }
    const deleted = await PlayerCharacterDAL.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(200).json({ message: "PlayerCharacter deleted", id });
  } catch (err) {
    console.error("Error deleting player character:", err);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;

