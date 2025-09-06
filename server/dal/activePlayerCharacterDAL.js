const mongoose = require("mongoose");
const getDatabaseConnection = require("../config/worldDBs");
const ActivePlayerCharacterSchema = require("../models/activePlayerCharacter");

class ActivePlayerCharacterDAL {
  /**
   * Ensure an ActivePlayerCharacter doc exists in the world DB with _id = playerCharacterId.
   * @param {string} world_id
   * @param {string} playerCharacterId - ObjectId string
   * @returns {Promise<Object>} Upserted/fetched document
   */
  static async ensure(world_id, playerCharacterId) {
    const db = getDatabaseConnection(world_id);
    const Model = db.model("ActivePlayerCharacter", ActivePlayerCharacterSchema);
    const id = new mongoose.Types.ObjectId(String(playerCharacterId));
    return await Model.findByIdAndUpdate(
      id,
      { $setOnInsert: { quests: [] } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  /**
   * Add a quest id into the quests array (no duplicates). Ensures doc exists.
   * @param {string} world_id
   * @param {string} playerCharacterId
   * @param {string} questId
   * @returns {Promise<Object>} Updated document
   */
  static async addQuest(world_id, playerCharacterId, questId) {
    const db = getDatabaseConnection(world_id);
    const Model = db.model("ActivePlayerCharacter", ActivePlayerCharacterSchema);
    const id = new mongoose.Types.ObjectId(String(playerCharacterId));
    const qid = new mongoose.Types.ObjectId(String(questId));
    return await Model.findByIdAndUpdate(
      id,
      { $addToSet: { quests: qid } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  /**
   * Fetch active player character doc by id.
   */
  static async get(world_id, playerCharacterId) {
    const db = getDatabaseConnection(world_id);
    const Model = db.model("ActivePlayerCharacter", ActivePlayerCharacterSchema);
    return await Model.findById(playerCharacterId).exec();
  }
}

module.exports = ActivePlayerCharacterDAL;

