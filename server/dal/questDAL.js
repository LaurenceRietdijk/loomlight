const getDatabaseConnection = require("../config/worldDBs");
const { ensureQuestModel } = require("../models/quest");
const ItemSchema = require("../models/item");
const { ensureItemModel } = require("../models/item");
const CharacterSchema = require("../models/character");
const FactionSchema = require("../models/faction");
const LocaleSchema = require("../models/locale");

class QuestDAL {
  /**
   * Insert a single quest document into the world database.
   * @param {string} world_id
   * @param {Object} questData
   * @returns {Promise<Object>}
   */
  static async insertQuest(world_id, questData) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    const quest = new QuestModel(questData);
    return await quest.save();
  }

  /**
   * Fetch a quest by id.
   * @param {string} world_id
   * @param {string} quest_id
   * @returns {Promise<Object|null>}
   */
  static async getQuestById(world_id, quest_id) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    return await QuestModel.findById(quest_id);
  }

  /**
   * Fetch a quest by id with populated references similar to character full fetch.
   * Populates fields appropriate to the quest type discriminators.
   * @param {string} world_id
   * @param {string} quest_id
   * @returns {Promise<Object|null>}
   */
  static async getQuestFullById(world_id, quest_id) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    // Ensure referenced models are registered for populate on this connection
    ensureItemModel(db);
    db.model("Character", CharacterSchema);
    db.model("Faction", FactionSchema);
    db.model("Locale", LocaleSchema);
    return await QuestModel.findById(quest_id)
      .populate({ path: "item", model: "Item" }) // Fetch / Deliver
      .populate({ path: "recipient", model: "Character" }) // Deliver
      .populate({ path: "targetCharacter", model: "Character" }) // Kill
      .populate({ path: "targetFaction", model: "Faction" }) // Kill
      .populate({ path: "targetLocale", model: "Locale" }) // Explore / Clear
      .exec();
  }

  /**
   * Fetch quests by acceptedBy id and (optionally) states.
   * Returns lightly populated docs for client consumption.
   * @param {string} world_id
   * @param {string} playerCharacterId
   * @param {Array<string>} states - e.g. ['acepted','completed']
   * @returns {Promise<Array<Object>>}
   */
  static async getQuestsByAcceptedBy(world_id, playerCharacterId, states = ["acepted", "completed"]) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    // Ensure referenced models are registered for populate on this connection
    ensureItemModel(db);
    db.model("Character", CharacterSchema);
    db.model("Faction", FactionSchema);
    db.model("Locale", LocaleSchema);

    const query = { acceptedBy: playerCharacterId };
    if (Array.isArray(states) && states.length) {
      query.state = { $in: states };
    }

    return await QuestModel.find(query)
      .populate({ path: "targetLocale", model: "Locale" })
      .sort({ updatedAt: -1 })
      .exec();
  }

  /**
   * Insert multiple quests.
   * @param {string} world_id
   * @param {Array<Object>} quests
   * @returns {Promise<Array<Object>>}
   */
  static async insertQuests(world_id, quests) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    return await QuestModel.insertMany(quests);
  }

  /**
   * Update quest state (optionally set acceptedBy when transitioning to 'acepted').
   * @param {string} world_id
   * @param {string} quest_id
   * @param {('avaliable'|'acepted'|'completed'|'failed')} state
   * @param {string|undefined} acceptedById - Active player character id
   * @returns {Promise<Object|null>}
   */
  static async updateQuestState(world_id, quest_id, state, acceptedById) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    const update = { state };
    if (typeof acceptedById !== 'undefined' && acceptedById !== null) {
      update.acceptedBy = acceptedById;
    }
    return await QuestModel.findByIdAndUpdate(
      quest_id,
      update,
      { new: true }
    );
  }

  /**
   * Recompute enemiesRemaining for all accepted Clear quests targeting a locale.
   * Completes a quest when enemiesRemaining reaches 0.
   * @param {string} world_id
   * @param {string} locale_id
   * @returns {Promise<Array<Object>>}
   */
  static async recomputeClearQuestsForLocale(world_id, locale_id) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    const CharacterDAL = require("./characterDAL");

    // Count current active NPCs in the locale
    const count = await CharacterDAL.countActiveByLocale(world_id, locale_id);

    // Find all accepted Clear quests for this locale (support legacy field 'type')
    const quests = await QuestModel.find({
      $and: [
        { $or: [{ questType: "Clear" }, { type: "Clear" }] },
        { state: { $in: ["acepted", "completed"] } },
        { targetLocale: locale_id },
      ],
    }).exec();

    const updated = [];
    for (const q of quests) {
      q.enemiesRemaining = Math.max(0, count);
      if (q.enemiesRemaining === 0) q.state = "completed";
      else if (q.state !== "acepted") q.state = "acepted";
      // eslint-disable-next-line no-await-in-loop
      const saved = await q.save();
      updated.push(saved);
    }
    return updated;
  }

  /**
   * Recompute enemiesRemaining for a single Clear quest and update its state if needed.
   * @param {string} world_id
   * @param {string} quest_id
   * @returns {Promise<Object|null>} updated quest or null
   */
  static async recomputeClearQuest(world_id, quest_id) {
    const db = getDatabaseConnection(world_id);
    const QuestModel = ensureQuestModel(db);
    const CharacterDAL = require("./characterDAL");
    const quest = await QuestModel.findById(quest_id).exec();
    if (!quest) return quest;
    const qType = String(quest.questType || quest.type || '').toLowerCase();
    if (qType !== 'clear' || !quest.targetLocale) return quest;
    const count = await CharacterDAL.countActiveByLocale(world_id, quest.targetLocale);
    quest.enemiesRemaining = Math.max(0, count);
    if (quest.enemiesRemaining === 0) quest.state = "completed";
    else if (quest.state !== "acepted") quest.state = "acepted";
    return await quest.save();
  }
}

module.exports = QuestDAL;
