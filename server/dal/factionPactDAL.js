const mongoose = require("mongoose");
const factionPactSchema = require("../models/factionPact");
const getDatabaseConnection = require("../config/worldDBs");

class FactionPactDAL {
  /**
   * Inserts a new faction pact into the world database after verifying and amending the data.
   * @param {string} world_id - The world database ID.
   * @param {Object} pactData - The faction pact details.
   * @returns {Promise<Object>} - The inserted faction pact document.
   */
  static async insertFactionPact(world_id, pactData) {
    if (
      !pactData ||
      !Array.isArray(pactData.factions) ||
      pactData.factions.length !== 2
    ) {
      throw new Error(
        "Invalid faction pact: Must include exactly two factions."
      );
    }

    // Ensure `events` is an array
    if (!Array.isArray(pactData.events)) {
      pactData.events = [];
    }

    const db = getDatabaseConnection(world_id);
    const FactionPactModel = db.model("FactionPact", factionPactSchema);

    try {
      const factionPact = new FactionPactModel(pactData);
      return await factionPact.save();
    } catch (error) {
      console.error("Failed pactData:", JSON.stringify(pactData, null, 2));
      console.error("Error inserting faction pact:", error);
      throw error;
    }

  }

  /**
   * Retrieves all faction pacts for a given world.
   * @param {string} world_id - The world database ID.
   * @returns {Promise<Object[]>} - List of faction pacts.
   */
  static async getFactionPacts(world_id) {
    const db = getDatabaseConnection(world_id);
    const FactionPactModel = db.model("FactionPact", factionPactSchema);
    return await FactionPactModel.find().exec();
  }

  /**
   * Finds a specific faction pact by ID.
   * @param {string} world_id - The world database ID.
   * @param {string} pact_id - The faction pact ID.
   * @returns {Promise<Object|null>} - Pact document or null.
   */
  static async getFactionPactById(world_id, pact_id) {
    const db = getDatabaseConnection(world_id);
    const FactionPactModel = db.model("FactionPact", factionPactSchema);
    return await FactionPactModel.findById(pact_id).exec();
  }
}

module.exports = FactionPactDAL;
