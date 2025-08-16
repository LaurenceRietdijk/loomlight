const getDatabaseConnection = require("../config/worldDBs");
const CharacterSchema = require("../models/character");

class CharacterDAL {
  /**
   * Inserts a character into the database associated with the given world.
   * @param {string} world_id - The world database ID.
   * @param {Object} characterData - The character document to insert.
   * @returns {Promise<Object>} - The inserted character document.
   */
  static async insertCharacter(world_id, characterData) {
    const db = getDatabaseConnection(world_id);
    const CharacterModel = db.model("Character", CharacterSchema);
    const character = new CharacterModel(characterData);
    return await character.save();
  }

  /**
   * Inserts multiple characters into the database at once.
   * @param {string} world_id - The world database ID.
   * @param {Array<Object>} characterList - Array of character documents.
   * @returns {Promise<Array<Object>>} - Array of inserted character documents.
   */
  static async insertCharacters(world_id, characterList) {
    const db = getDatabaseConnection(world_id);
    const CharacterModel = db.model("Character", CharacterSchema);
    return await CharacterModel.insertMany(characterList);
    }
    
  /**
   * Fetches a character by ID.
   * @param {string} world_id - The world database ID.
   * @param {string} character_id - The character's ObjectId.
   * @returns {Promise<Object|null>} - The found character or null.
   */
  static async getCharacterById(world_id, character_id) {
    const db = getDatabaseConnection(world_id);
    const CharacterModel = db.model("Character", CharacterSchema);
    return await CharacterModel.findById(character_id);
  }

  /**
   * Fetches all characters assigned to a specific locale.
   * @param {string} world_id - The world database ID.
   * @param {string} locale_id - The locale ObjectId.
   * @returns {Promise<Array>} - List of character documents.
   */
  static async getCharactersByLocale(world_id, locale_id) {
    const db = getDatabaseConnection(world_id);
    const CharacterModel = db.model("Character", CharacterSchema);
    return await CharacterModel.find({ locale: locale_id });
  }
}

module.exports = CharacterDAL;
