const getDatabaseConnection = require("../config/worldDBs");
const BuildingSchema = require("../models/building");

class BuildingDAL {
  /**
   * Inserts a single building into the world database.
   * @param {string} world_id
   * @param {Object} buildingData
   * @returns {Promise<Object>}
   */
  static async insertBuilding(world_id, buildingData) {
    const db = getDatabaseConnection(world_id);
    const BuildingModel = db.model("Building", BuildingSchema);
    const building = new BuildingModel(buildingData);
    return await building.save();
  }

  /**
   * Inserts multiple buildings into the world database.
   * @param {string} world_id
   * @param {Array<Object>} buildings
   * @returns {Promise<Array<Object>>}
   */
  static async insertBuildings(world_id, buildings) {
    const db = getDatabaseConnection(world_id);
    const BuildingModel = db.model("Building", BuildingSchema);
    return await BuildingModel.insertMany(buildings);
  }

  /**
   * Fetch a building by id.
   * @param {string} world_id
   * @param {string} building_id
   */
  static async getBuildingById(world_id, building_id) {
    const db = getDatabaseConnection(world_id);
    const BuildingModel = db.model("Building", BuildingSchema);
    return await BuildingModel.findById(building_id);
  }

  /**
   * Get all buildings for a locale.
   * @param {string} world_id
   * @param {string} locale_id
   */
  static async getBuildingsByLocale(world_id, locale_id) {
    const db = getDatabaseConnection(world_id);
    const BuildingModel = db.model("Building", BuildingSchema);
    return await BuildingModel.find({ locale: locale_id });
  }
}

module.exports = BuildingDAL;

