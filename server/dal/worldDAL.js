const getDatabaseConnection = require("../config/worldDBs");
const { schema: WorldSchema } = require("../models/world");

class WorldDAL {
  /**
   * Fetches a world by its ID.
   * @param {string} world_id - The ID of the world.
   * @returns {Promise<Object|null>} - The found world or null if not found.
   */
  static async getWorld(world_id) {
    const db = getDatabaseConnection(world_id);
    const WorldModel = db.model("World", WorldSchema);
    return await WorldModel.findById(world_id);
  }

  /**
   * Inserts a new world into the database.
   * @param {Object} worldData - The world document to insert.
   * @returns {Promise<Object>} - The inserted world.
   */
  static async insertWorld(worldData) {
    const db = getDatabaseConnection(worldData._id);
    const WorldModel = db.model("World", WorldSchema);
    const world = new WorldModel(worldData);
    return await world.save();
  }
}

module.exports = WorldDAL;
