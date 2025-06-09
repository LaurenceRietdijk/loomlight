const express = require("express");
const { Body } = require("node-fetch");
const router = express.Router();

const RaceDAL = require("../dal/raceDAL");
const RaceGenerator = require("../generation/raceGenerator");
const World = require("../models/world"); 

//get
router.get("/", async (req, res) => {
    reply = { Body: "Success! Server responding!" };
    res.status(200).json(reply);
});

//post
router.post("/", async (req, res) => {
    reply = { Body: "post request accepted. This is just a testing endpoint" };
    res.status(200).json(reply);
});

router.post("/races/:world_id", async (req, res) => {
  try {
    const { world_id } = req.params;
    if (!world_id) {
      return res.status(400).json({ error: "Missing world_id" });
    }

    const world = await World.findById(world_id).exec();

    if (world) {
      const races = await RaceGenerator.generateRaces(world);
      return res.status(200).json({ message: "Races generated:", races });
    } else {
      return res.status(404).json({ error: "World not found" });
    }
  } catch (error) {
    console.error("Error fetching world:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;