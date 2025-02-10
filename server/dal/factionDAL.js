const mongoose = require("mongoose");
const FactionSchema  = require("../models/faction");
const getDatabaseConnection = require("../config/worldDBs");

class FactionDAL {
  /**
   * Inserts a new faction into the world database.
   * @param {string} world_id - The world database ID.
   * @param {Object} factionData - Faction details.
   * @returns {Promise<Object>} - Inserted faction document.
   */
  static async insertFaction(world_id, factionData) {
    const db = getDatabaseConnection(world_id);
    const FactionModel = db.model("Faction", FactionSchema);
    return await new FactionModel(factionData).save();
  }

  /**
   * Retrieves all factions for a given world.
   * @param {string} world_id - The world database ID.
   * @returns {Promise<Object[]>} - List of factions.
   */
  static async getFactions(world_id) {
    const db = getDatabaseConnection(world_id);
    const FactionModel = db.model("Faction", FactionSchema);
    return await FactionModel.find().exec();
  }

  /**
   * Finds a specific faction by ID.
   * @param {string} world_id - The world database ID.
   * @param {string} faction_id - The faction ID.
   * @returns {Promise<Object|null>} - Faction document or null.
   */
  static async getFactionById(world_id, faction_id) {
    const db = getDatabaseConnection(world_id);
    const FactionModel = db.model("Faction", FactionSchema);
    return await FactionModel.findById(faction_id).exec();
  }
}

module.exports = FactionDAL;
