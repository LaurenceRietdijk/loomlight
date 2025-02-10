const World = require("../models/world"); // ✅ Ensure it's correctly imported

class WorldDAL {
  /**
   * Creates and inserts a new world into the central database.
   * @param {string} creator - The name or ID of the creator.
   * @param {string} name - The world’s name.
   * @param {string} worldBuilding - A description of the world’s lore.
   * @returns {Promise<Object>} - The inserted world document.
   */
  static async insertWorld(creator, name, worldBuilding) {
    const world = new World({
      name,
      worldBuilding,
      creator,
    });

    return await world.save(); // ✅ Save world to the database
  }

  static async getWorld(world_id) {
    return await World.findById(world_id).exec(); // ✅ Uses Mongoose API
  }

  /**
   * Retrieves all worlds from the central database.
   * @returns {Promise<Object[]>} - Array of world documents.
   */
  static async getAllWorlds() {
    return await World.find().exec();
  }

  /**
   * Deletes a world entry from the central database.
   * @param {string} world_id - The world ID.
   * @returns {Promise<Object>} - The deleted world document.
   */
  static async deleteWorld(world_id) {
    return await World.findByIdAndDelete(world_id).exec();
  }
}

module.exports = WorldDAL;
