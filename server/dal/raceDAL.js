const mongoose = require("mongoose");
const RaceSchema = require("../models/race");
const getDatabaseConnection = require("../config/worldDBs");

class RaceDAL {
  /**
   * Inserts a new race into the world database.
   * @param {string} world_id - The world database ID.
   * @param {Object} raceData - Race details.
   * @returns {Promise<Object>} - Inserted race document.
   */
  static async insertRace(world_id, raceData) {
    const db = getDatabaseConnection(world_id);
    const RaceModel = db.model("Race", RaceSchema);
      
    try {
        return await new RaceModel(raceData).save();
    } catch (error) {
        console.error(
            "Failed pactData:",
            JSON.stringify(raceData, null, 2)
        );
        console.error("Error inserting faction pact:", error);
        throw error;
    }
  }

  /**
   * Retrieves all races for a given world.
   * @param {string} world_id - The world database ID.
   * @returns {Promise<Object[]>} - List of races.
   */
  static async getRaces(world_id) {
    const db = getDatabaseConnection(world_id);
    const RaceModel = db.model("Race", RaceSchema);
    return await RaceModel.find().exec();
  }

  /**
   * Finds a specific race by ID.
   * @param {string} world_id - The world database ID.
   * @param {string} race_id - The race ID.
   * @returns {Promise<Object|null>} - Race document or null.
   */
  static async getRaceById(world_id, race_id) {
    const db = getDatabaseConnection(world_id);
    const RaceModel = db.model("Race", RaceSchema);
    return await RaceModel.findById(race_id).exec();
  }
}

module.exports = RaceDAL;
