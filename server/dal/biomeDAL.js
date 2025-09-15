const mongoose = require("mongoose");
const BiomeSchema = require("../models/biome");

class BiomeDAL {
  /**
   * Inserts a new biome into the central Worlds database.
   * @param {Object} biomeData - Biome details.
   * @returns {Promise<Object>} - Inserted biome document.
   */
  static async insertBiome(biomeData) {
    const BiomeModel = mongoose.model("Biome", BiomeSchema);
    try {
      return await new BiomeModel(biomeData).save();
    } catch (error) {
      console.error("Failed biomeData:", JSON.stringify(biomeData, null, 2));
      console.error("Error inserting biome:", error);
      throw error;
    }
  }

  /**
   * Retrieves all biomes from the central Worlds database.
   * @returns {Promise<Object[]>} - List of biomes.
   */
  static async getBiomes() {
    const BiomeModel = mongoose.model("Biome", BiomeSchema);
    return await BiomeModel.find().exec();
  }

  /**
   * Finds a specific biome by ID from the central Worlds database.
   * @param {string} biome_id - The biome ID.
   * @returns {Promise<Object|null>} - Biome document or null.
   */
  static async getBiomeById(biome_id) {
    const BiomeModel = mongoose.model("Biome", BiomeSchema);
    return await BiomeModel.findById(biome_id).exec();
  }

  /**
   * Sets the boolean flag for a locale type within a biome's locales map.
   * @param {string} biome_id
   * @param {string} locale_type
   * @param {boolean} value
   * @returns {Promise<Object|null>} Updated biome document or null.
   */
  static async setLocaleFlag(biome_id, locale_type, value = true) {
    const BiomeModel = mongoose.model("Biome", BiomeSchema);
    const pathKey = `locales.${locale_type}`;
    return await BiomeModel.findByIdAndUpdate(
      biome_id,
      { $set: { [pathKey]: Boolean(value) } },
      { new: true }
    ).exec();
  }
}

module.exports = BiomeDAL;
