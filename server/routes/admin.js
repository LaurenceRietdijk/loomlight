const express = require("express");
const mongoose = require("mongoose");
const WorldDAL = require("../dal/worldDAL");
const getDatabaseConnection = require("../config/worldDBs");

const router = express.Router();

/**
 * DELETE /admin/dump
 * Deletes all world databases and removes world documents from the central database.
 */
router.delete("/dump", async (req, res) => {
  try {
    console.log("Starting full database dump...");

    // Retrieve all world entries from the central database
    const worlds = await WorldDAL.getAllWorlds();

    if (!worlds.length) {
      return res.status(200).json({ message: "No worlds found to delete." });
    }

    // Loop through each world and delete its database
    for (const world of worlds) {
      const worldId = world._id.toString(); // Ensure it's a string

      console.log(`Deleting database for world: ${worldId}...`);
      const worldDB = getDatabaseConnection(worldId);
      await worldDB.dropDatabase(); // Deletes the dynamically created world database

      console.log(
        `Removing world document: ${worldId} from central database...`
      );
      await WorldDAL.deleteWorld(worldId); // Remove world entry from the central database
    }

    console.log(
      "All worlds and their databases have been successfully deleted."
    );
    res
      .status(200)
      .json({ message: "All worlds and their databases have been deleted." });
  } catch (error) {
    console.error("Error during database dump:", error);
    res
      .status(500)
      .json({ error: "An error occurred while dumping databases." });
  }
});

module.exports = router;
