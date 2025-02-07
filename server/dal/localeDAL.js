const getDatabaseConnection = require("../config/worldDBs");
const { schema: LocaleSchema } = require("../models/locale");

class LocaleDAL {
  /**
   * Fetches a locale by world_id and coordinates.
   * @param {string} world_id - The world database ID.
   * @param {number} x - The X coordinate.
   * @param {number} y - The Y coordinate.
   * @returns {Promise<Object|null>} - The found locale or null if not found.
   */
  static async getLocale(world_id, x, y) {
    const db = getDatabaseConnection(world_id);
    const LocaleModel = db.model("Locale", LocaleSchema);
    return await LocaleModel.findOne({
      "coordinates.x": x,
      "coordinates.y": y,
    });
  }

  /**
   * Saves a new locale to the database.
   * @param {string} world_id - The world database ID.
   * @param {Object} localeData - The locale document to insert.
   * @returns {Promise<Object>} - The inserted locale.
   */
  static async insertLocale(world_id, localeData) {
    const db = getDatabaseConnection(world_id);
    const LocaleModel = db.model("Locale", LocaleSchema);
    const locale = new LocaleModel(localeData);
    return await locale.save();
  }
}

module.exports = LocaleDAL;
