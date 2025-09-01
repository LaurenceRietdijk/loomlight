const getDatabaseConnection = require("../config/worldDBs");
const CharacterSchema = require("../models/character");
const FactionSchema = require("../models/faction");
const LocaleSchema = require("../models/locale");
const BuildingSchema = require("../models/building");
const ItemSchema = require("../models/item");
const { ensureQuestModel } = require("../models/quest");

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
    return await CharacterModel.find({ "location.locale": locale_id });
  }

  /**
   * Append a quest reference to a character's quests array.
   * @param {string} world_id
   * @param {string} character_id
   * @param {string} quest_id
   * @returns {Promise<Object|null>} Updated character
   */
  static async addQuestToCharacter(world_id, character_id, quest_id) {
    const db = getDatabaseConnection(world_id);
    const CharacterModel = db.model("Character", CharacterSchema);
    return await CharacterModel.findByIdAndUpdate(
      character_id,
      { $addToSet: { quests: quest_id } },
      { new: true }
    );
  }

  /**
   * Fetch a character by id with all referenced ObjectIds populated.
   * Replaces ids with nested documents wherever a ref is defined.
   * Note: location.room is an ObjectId of an embedded subdocument and cannot
   * be populated since it's not a separate collection.
   * @param {string} world_id
   * @param {string} character_id
   * @returns {Promise<Object|null>}
   */
  static async getCharacterFullById(world_id, character_id) {
    const db = getDatabaseConnection(world_id);

    // Ensure referenced models are registered for populate
    db.model("Faction", FactionSchema);
    db.model("Locale", LocaleSchema);
    db.model("Building", BuildingSchema);
    db.model("Item", ItemSchema);
    db.model("Character", CharacterSchema);
    ensureQuestModel(db);

    const CharacterModel = db.model("Character", CharacterSchema);

    const doc = await CharacterModel.findById(character_id)
      .populate("faction")
      .populate("location.locale")
      .populate({
        path: "location.building",
        populate: [
          { path: "rooms.characters", model: "Character" },
          { path: "rooms.containers.items", model: "Item" },
        ],
      })
      .populate({
        path: "home",
        populate: [
          { path: "rooms.characters", model: "Character" },
          { path: "rooms.containers.items", model: "Item" },
        ],
      })
      .populate({
        path: "work",
        populate: [
          { path: "rooms.characters", model: "Character" },
          { path: "rooms.containers.items", model: "Item" },
        ],
      })
      .populate("relationships.character_id")
      .populate("relationships.shared_children")
      .populate({
        path: "quests",
        populate: [
          { path: "item", model: "Item" },
          { path: "recipient", model: "Character" },
          { path: "targetCharacter", model: "Character" },
          { path: "targetFaction", model: "Faction" },
          { path: "targetLocale", model: "Locale" },
          { path: "pickup.locale", model: "Locale" },
          { path: "pickup.building", model: "Building" },
          { path: "dropoff.locale", model: "Locale" },
          { path: "dropoff.building", model: "Building" },
          { path: "source.locale", model: "Locale" },
          { path: "source.building", model: "Building" },
          { path: "area.locale", model: "Locale" },
          { path: "area.building", model: "Building" },
        ],
      })
      .exec();

    return doc;
  }
}

module.exports = CharacterDAL;
