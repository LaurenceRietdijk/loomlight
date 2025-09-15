const mongoose = require("mongoose");
const getDatabaseConnection = require("../config/worldDBs");
const LocaleSchema = require("../models/locale");
const RaceSchema = require("../models/race");
const FactionSchema = require("../models/faction");
const CharacterSchema = require("../models/character");
const BuildingSchema = require("../models/building");
const ItemSchema = require("../models/item");
const { ensureItemModel } = require("../models/item");
const BiomeSchema = require("../models/biome");

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
   * Returns: id, name, type, coordinates, biome (ObjectId as string or null).
   */
  static async getAllLocales(world_id) {
    const db = getDatabaseConnection(world_id);
    const LocaleModel = db.model("Locale", LocaleSchema);
    const docs = await LocaleModel.find({}, { name: 1, type: 1, coordinates: 1, biome: 1 })
      .lean()
      .exec();
    return (docs || []).map((d) => ({
      id: String(d._id),
      name: d.name,
      type: d.type,
      coordinates: d.coordinates,
      biome: d.biome ? String(d.biome) : null,
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
    ensureItemModel(db);
    // Register other models on world DB; Biome now lives in central Worlds DB.
    db.model("Biome", BiomeSchema);

    const LocaleModel = db.model("Locale", LocaleSchema);

    const doc = await LocaleModel.findOne({
      "coordinates.x": x,
      "coordinates.y": y,
    })
      .populate("primary_race")
      .populate({ path: "biome", model: mongoose.model("Biome", BiomeSchema) })
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
    ensureItemModel(db);
    db.model("Biome", BiomeSchema);

    const LocaleModel = db.model("Locale", LocaleSchema);
    const doc = await LocaleModel.findById(locale_id)
      .populate("primary_race")
      .populate({ path: "biome", model: mongoose.model("Biome", BiomeSchema) })
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
    ensureItemModel(db);
    db.model("Biome", BiomeSchema);

    const LocaleModel = db.model("Locale", LocaleSchema);
    const docs = await LocaleModel.find({ _id: { $in: ids } })
      .populate("primary_race")
      .populate({ path: "biome", model: mongoose.model("Biome", BiomeSchema) })
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

  /**
   * Delete a locale and cascade-delete nested entities stored in separate collections.
   * Removes:
   *  - Items where location.locale = locale_id
   *  - Characters where location.locale = locale_id
   *  - Buildings where locale = locale_id (embedded rooms/containers removed with document)
   *  - Pulls locale id from any Faction.locales arrays
   *  - Finally deletes the Locale document itself
   * Returns counts for basic observability.
   * @param {string} world_id
   * @param {string} locale_id
   */
  static async deleteLocaleCascade(world_id, locale_id) {
    const db = getDatabaseConnection(world_id);

    // Register models on the world DB connection
    const LocaleModel = db.model("Locale", LocaleSchema);
    const BuildingModel = db.model("Building", BuildingSchema);
    const CharacterModel = db.model("Character", CharacterSchema);
    const ItemModel = ensureItemModel(db);
    const FactionModel = db.model("Faction", FactionSchema);

    let id = locale_id;
    try { id = new mongoose.Types.ObjectId(String(locale_id)); } catch (_) {}

    // Collect buildings (for potential future use or logging)
    const buildings = await BuildingModel.find({ locale: id }).select("_id").lean();
    const buildingIds = (buildings || []).map((b) => b._id);

    // Delete items at this locale
    const itemsResult = await ItemModel.deleteMany({ "location.locale": id });

    // Delete characters at this locale
    const charsResult = await CharacterModel.deleteMany({ "location.locale": id });

    // Delete buildings at this locale
    const bldgResult = buildingIds.length
      ? await BuildingModel.deleteMany({ _id: { $in: buildingIds } })
      : { deletedCount: 0 };

    // Pull locale reference from factions (to avoid dangling references)
    await FactionModel.updateMany({ locales: id }, { $pull: { locales: id } });

    // Finally, delete the locale document
    const locResult = await LocaleModel.deleteOne({ _id: id });

    return {
      deleted: true,
      counts: {
        items: itemsResult?.deletedCount ?? 0,
        characters: charsResult?.deletedCount ?? 0,
        buildings: bldgResult?.deletedCount ?? 0,
        locales: locResult?.deletedCount ?? 0,
      },
    };
  }
}

module.exports = LocaleDAL;
