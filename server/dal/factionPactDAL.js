const mongoose = require("mongoose");
const { FactionPact } = require("../models/factionPact");
const getDatabaseConnection = require("../config/worldDBs");

class FactionPactDAL {
  /**
   * Inserts a new faction pact into the world database.
   * @param {string} world_id - The world database ID.
   * @param {Object} pactData - Pact details.
   * @returns {Promise<Object>} - Inserted pact document.
   */
  static async insertFactionPact(world_id, pactData) {
    const db = getDatabaseConnection(world_id);
    const FactionPactModel = db.model("FactionPact", FactionPact.schema);
    return await new FactionPactModel(pactData).save();
  }

  /**
   * Retrieves all faction pacts for a given world.
   * @param {string} world_id - The world database ID.
   * @returns {Promise<Object[]>} - List of faction pacts.
   */
  static async getFactionPacts(world_id) {
    const db = getDatabaseConnection(world_id);
    const FactionPactModel = db.model("FactionPact", FactionPact.schema);
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
    const FactionPactModel = db.model("FactionPact", FactionPact.schema);
    return await FactionPactModel.findById(pact_id).exec();
  }
}

module.exports = FactionPactDAL;
