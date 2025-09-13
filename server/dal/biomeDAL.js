const mongoose = require("mongoose");
const BiomeSchema = require("../models/biome");
const getDatabaseConnection = require("../config/worldDBs");

class BiomeDAL {
  /**
   * Inserts a new biome into the world database.
   * @param {string} world_id - The world database ID.
   * @param {Object} biomeData - Biome details.
   * @returns {Promise<Object>} - Inserted biome document.
   */
  static async insertBiome(world_id, biomeData) {
    const db = getDatabaseConnection(world_id);
    const BiomeModel = db.model("Biome", BiomeSchema);

    try {
      return await new BiomeModel(biomeData).save();
    } catch (error) {
      console.error("Failed biomeData:", JSON.stringify(biomeData, null, 2));
      console.error("Error inserting biome:", error);
      throw error;
    }
  }

  /**
   * Retrieves all biomes for a given world.
   * @param {string} world_id - The world database ID.
   * @returns {Promise<Object[]>} - List of biomes.
   */
  static async getBiomes(world_id) {
    const db = getDatabaseConnection(world_id);
    const BiomeModel = db.model("Biome", BiomeSchema);
    return await BiomeModel.find().exec();
  }

  /**
   * Finds a specific biome by ID.
   * @param {string} world_id - The world database ID.
   * @param {string} biome_id - The biome ID.
   * @returns {Promise<Object|null>} - Biome document or null.
   */
  static async getBiomeById(world_id, biome_id) {
    const db = getDatabaseConnection(world_id);
    const BiomeModel = db.model("Biome", BiomeSchema);
    return await BiomeModel.findById(biome_id).exec();
  }
}

module.exports = BiomeDAL;
