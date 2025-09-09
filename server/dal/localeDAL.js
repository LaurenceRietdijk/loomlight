const getDatabaseConnection = require("../config/worldDBs");
const LocaleSchema = require("../models/locale");
const RaceSchema = require("../models/race");
const FactionSchema = require("../models/faction");
const CharacterSchema = require("../models/character");
const BuildingSchema = require("../models/building");
const ItemSchema = require("../models/item");

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

  /**
   * Retrieves all locales for a world in dehydrated form.
   * Returns only: id, name, type, coordinates.
   */
  static async getAllLocales(world_id) {
    const db = getDatabaseConnection(world_id);
    const LocaleModel = db.model("Locale", LocaleSchema);
    const docs = await LocaleModel.find({}, { name: 1, type: 1, coordinates: 1 })
      .lean()
      .exec();
    return (docs || []).map((d) => ({
      id: String(d._id),
      name: d.name,
      type: d.type,
      coordinates: d.coordinates,
    }));
  }

  /**
   * Retrieves a locale with populated references for full detail view.
   */
  static async getLocaleFull(world_id, x, y) {
    const db = getDatabaseConnection(world_id);

    // Ensure referenced models are registered on this connection for populate to work
    db.model("Race", RaceSchema);
    db.model("Faction", FactionSchema);
    db.model("Character", CharacterSchema);
    db.model("Building", BuildingSchema);
    db.model("Item", ItemSchema);

    const LocaleModel = db.model("Locale", LocaleSchema);

    const doc = await LocaleModel.findOne({
      "coordinates.x": x,
      "coordinates.y": y,
    })
      .populate("primary_race")
      .populate("factions._id")
      .populate("characters._id")
      .populate("characters.building")
      .populate({
        path: "buildings",
        populate: [
          {
            path: "rooms.containers.items",
            model: "Item",
          },
          {
            path: "rooms.characters",
            model: "Character",
          },
        ],
      });

    return doc;
  }

  /**
   * Fetch a locale by its id with populated references (full version).
   * @param {string} world_id
   * @param {string} locale_id
   * @returns {Promise<Object|null>}
   */
  static async getLocaleFullById(world_id, locale_id) {
    const db = getDatabaseConnection(world_id);

    // Ensure referenced models are registered on this connection for populate to work
    db.model("Race", RaceSchema);
    db.model("Faction", FactionSchema);
    db.model("Character", CharacterSchema);
    db.model("Building", BuildingSchema);
    db.model("Item", ItemSchema);

    const LocaleModel = db.model("Locale", LocaleSchema);
    const doc = await LocaleModel.findById(locale_id)
      .populate("primary_race")
      .populate("factions._id")
      .populate("characters._id")
      .populate("characters.building")
      .populate({
        path: "buildings",
        populate: [
          { path: "rooms.containers.items", model: "Item" },
          { path: "rooms.characters", model: "Character" },
        ],
      })
      .exec();
    return doc;
  }

  /**
   * Fetch many locales by ids and return a dictionary keyed by id with full docs.
   * @param {string} world_id
   * @param {Array<string>} ids
   * @returns {Promise<Object<string,Object>>}
   */
  static async getLocalesFullByIds(world_id, ids) {
    const db = getDatabaseConnection(world_id);

    // Ensure referenced models are registered on this connection for populate to work
    db.model("Race", RaceSchema);
    db.model("Faction", FactionSchema);
    db.model("Character", CharacterSchema);
    db.model("Building", BuildingSchema);
    db.model("Item", ItemSchema);

    const LocaleModel = db.model("Locale", LocaleSchema);
    const docs = await LocaleModel.find({ _id: { $in: ids } })
      .populate("primary_race")
      .populate("factions._id")
      .populate("characters._id")
      .populate("characters.building")
      .populate({
        path: "buildings",
        populate: [
          { path: "rooms.containers.items", model: "Item" },
          { path: "rooms.characters", model: "Character" },
        ],
      })
      .exec();

    const out = {};
    for (const d of docs || []) {
      out[String(d._id)] = d;
    }
    return out;
  }
}

module.exports = LocaleDAL;
