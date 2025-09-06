// Quest generator with initial implementation for "Clear" quests.
const OpenAI = require("openai");
const mongoose = require("mongoose");
const QuestDAL = require("../dal/questDAL");
const CharacterDAL = require("../dal/characterDAL");
const LocaleDAL = require("../dal/localeDAL");
const { QUEST_TYPES, QUEST_STATES } = require("../models/quest");
const LocaleSchema = require("../models/locale");
const getDatabaseConnection = require("../config/worldDBs");
const LocaleGenerator = require("./localeGenerator");

const openai = new OpenAI({ apiKey: process.env.API_KEY });

// Map quest types to the JSON shape expected in prompts/system messages
// Keys align with the quest type enum values
const QUEST_PROMPT_SHAPES = {
  Fetch: {
    questType: "Fetch",
    title: "string",
    description: "string",
    item: "ObjectId(Item)",
    quantity: "number >= 1",
    source: {
      locale: "ObjectId(Locale)",
      building: "ObjectId(Building)",
      room: "ObjectId(Room)",
      container: "ObjectId(Container)",
    },
  },
  Deliver: {
    questType: "Deliver",
    title: "string",
    description: "string",
    item: "ObjectId(Item)",
    quantity: "number >= 1",
    pickup: {
      locale: "ObjectId(Locale)",
      building: "ObjectId(Building)",
      room: "ObjectId(Room)",
      container: "ObjectId(Container)",
    },
    dropoff: {
      locale: "ObjectId(Locale)",
      building: "ObjectId(Building)",
      room: "ObjectId(Room)",
      container: "ObjectId(Container)",
    },
    recipient: "ObjectId(Character)",
  },
  Kill: {
    questType: "Kill",
    title: "string",
    description: "string",
    targetCharacter: "ObjectId(Character) | null",
    targetFaction: "ObjectId(Faction) | null",
    count: "number >= 1",
    area: {
      locale: "ObjectId(Locale)",
      building: "ObjectId(Building)",
      room: "ObjectId(Room)",
      container: "ObjectId(Container)",
    },
  },
  Gather: {
    questType: "Gather",
    title: "string",
    description: "string",
    resourceName: "string",
    resourceType: "string",
    quantity: "number >= 1",
    area: {
      locale: "ObjectId(Locale)",
      building: "ObjectId(Building)",
      room: "ObjectId(Room)",
      container: "ObjectId(Container)",
    },
  },
  Explore: {
    questType: "Explore",
    title: "string",
    description: "string",
    targetLocale: "ObjectId(Locale) | null",
    coordinates: { x: "number | null", y: "number | null" },
    areaName: "string",
  },
  Clear: {
    questType: "Clear",
    title: "string",
    description: "string",
    targetLocale: "ObjectId(Locale)",
  },
};

class QuestGenerator {
  /**
   * Generate and insert a quest for a given character.
   * Implements "Clear" quest type with nearby Camp generation + GPT description.
   *
   * @param {string} world_id
   * @param {string} character_id
   * @param {("Fetch"|"Deliver"|"Kill"|"Gather"|"Explore"|"Clear")} type
   * @returns {Promise<Object|null>} created quest or null on invalid input
   */
  static async generateAndInsertQuest(world_id, character_id, type) {
    // Basic validation
    if (!world_id || !character_id) return null;

    const questType = QUEST_TYPES.includes(type) ? type : QUEST_TYPES[0];

    const base = {
      questType: questType,
      title: "",
      description: "",
    };

    let questData = { ...base };

    // Framework for per-type generation
    switch (questType) {
      case "Fetch":
        questData = {
          ...base,
          item: null,
          quantity: 1,
          source: { locale: null, building: null, room: null, container: null },
        };
        break;
      case "Deliver":
        questData = {
          ...base,
          item: null,
          quantity: 1,
          pickup: { locale: null, building: null, room: null, container: null },
          dropoff: { locale: null, building: null, room: null, container: null },
          recipient: null,
        };
        break;
      case "Kill":
        questData = {
          ...base,
          targetCharacter: null,
          targetFaction: null,
          count: 1,
          area: { locale: null, building: null, room: null, container: null },
        };
        break;
      case "Gather":
        questData = {
          ...base,
          resourceName: "",
          resourceType: "",
          quantity: 1,
          area: { locale: null, building: null, room: null, container: null },
        };
        break;
      case "Explore":
        questData = {
          ...base,
          targetLocale: null,
          coordinates: { x: null, y: null },
          areaName: "",
        };
        break;
      case "Clear":
        // Special handling for Clear quests
        return await QuestGenerator.#generateClearQuest(world_id, character_id);
      default:
        // Keep base if type not recognized
        questData = { ...base };
    }

    // Save quest and link to character
    const quest = await QuestDAL.insertQuest(world_id, questData);
    if (quest && quest._id) {
      try {
        await CharacterDAL.addQuestToCharacter(world_id, character_id, quest._id);
      } catch (err) {
        // Non-fatal linkage failure; quest still created
        // eslint-disable-next-line no-console
        console.warn("Failed to add quest to character:", err);
      }
    }

    return quest;
  }

  /**
   * Generate a Clear quest: find an empty adjacent coordinate near the quest giver's locale,
   * create a Camp there, ask GPT for a title/description with canonical reason, then save.
   */
static async #generateClearQuest(world_id, character_id) {
    // Load quest giver (fully populated)
    const character = await CharacterDAL.getCharacterFullById(world_id, character_id);
    if (!character || !character.location || !character.location.locale) {
      return null;
    }

    // Load the giver's locale to get coordinates and primary race
    const giverLocale = await QuestGenerator.#getLocaleById(world_id, character.location.locale);
    if (!giverLocale) return null;

    const origin = giverLocale.coordinates;
    const primaryRaceId = giverLocale.primary_race ? String(giverLocale.primary_race) : null;

    // Find a nearby empty coordinate
    const target = await QuestGenerator.#findNearbyEmptyCoordinate(world_id, origin.x, origin.y, 6);
    if (!target) return null;

    // Generate a new Camp at the target coordinate
    const camp = await LocaleGenerator.generateAndInsertLocale(
      world_id,
      target.x,
      target.y,
      "Camp",
      primaryRaceId
    );

    // Ask GPT for quest title/description with canonical reason
    const questText = await QuestGenerator.#generateClearQuestText({
      characterDoc: character,
      giver: {
        name: character.name,
        role: character.role,
      },
      giverLocale: {
        name: giverLocale.name,
        type: giverLocale.type,
        x: origin.x,
        y: origin.y,
      },
      targetCamp: {
        name: camp.name,
        description: camp.description,
        x: camp.coordinates.x,
        y: camp.coordinates.y,
      },
    });

    const title = questText.title || `Clear ${camp.name}`;
    const description = questText.description || `Drive out the hostile presence at ${camp.name} (${camp.coordinates.x}, ${camp.coordinates.y}).`;

    // Compute initial enemies remaining at target locale (active NPCs)
    let enemiesRemaining = 0;
    try {
      const CharacterDAL = require("../dal/characterDAL");
      enemiesRemaining = await CharacterDAL.countActiveByLocale(world_id, camp._id);
    } catch {}

    // Save quest and link to the character
    const quest = await QuestDAL.insertQuest(world_id, {
      questType: "Clear",
      title,
      description,
      targetLocale: camp._id,
      enemiesRemaining,
    });

    if (quest && quest._id) {
      try {
        await CharacterDAL.addQuestToCharacter(world_id, character_id, quest._id);
      } catch (err) {
        console.warn("Failed to add Clear quest to character:", err);
      }
    }

    return quest;
  }

  /** Get a Locale by _id within the world connection. */
  static async #getLocaleById(world_id, locale_id) {
    const db = getDatabaseConnection(world_id);
    const LocaleModel = db.model("Locale", LocaleSchema);
    const id = typeof locale_id === "string" ? new mongoose.Types.ObjectId(locale_id) : locale_id;
    return await LocaleModel.findById(id);
  }

  /** Find the nearest empty integer coordinate within a max radius (inclusive). */
  static async #findNearbyEmptyCoordinate(world_id, ox, oy, maxRadius = 6) {
    // Helper to check if a locale exists at (x, y)
    const isOccupied = async (x, y) => {
      const existing = await LocaleDAL.getLocale(world_id, x, y);
      return !!existing;
    };

    // Search expanding squares around the origin
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (dx === 0 && dy === 0) continue;
          // Only consider the ring at distance r to avoid duplicates
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = ox + dx;
          const y = oy + dy;
          // eslint-disable-next-line no-await-in-loop
          if (!(await isOccupied(x, y))) {
            return { x, y };
          }
        }
      }
    }
    return null;
  }

  /**
   * Calls GPT to create a Clear quest title and description that includes a canonical reason.
   * Returns an object: { title: string, description: string }
   */
  static async #generateClearQuestText(context) {
    try {
      const system = `You are an AI that writes medieval-fantasy quest briefs as JSON.\n` +
        `Respond with valid JSON only, no extra commentary.\n` +
        `Output exactly: {\n  "title": "...",\n  "description": "..."\n}.\n` +
        `The quest type is Clear (eliminate or drive out hostiles from a specific camp).\n` +
        `The description MUST provide the canonical in-world reason and stakes (who benefits, why now), not just the objective.\n` +
        `Keep it grounded, specific to the provided context, 2-5 sentences.\n\n` +
        `CHARACTER DOCUMENT (JSON):\n${JSON.stringify(context.characterDoc || {}, null, 2)}`;

      const user = `Quest Giver: ${context.giver.name} (${context.giver.role}).\n` +
        `Giver Locale: ${context.giverLocale.name} (${context.giverLocale.type}) at (${context.giverLocale.x}, ${context.giverLocale.y}).\n` +
        `Target Camp: ${context.targetCamp.name} at (${context.targetCamp.x}, ${context.targetCamp.y}).\n` +
        `Camp Summary: ${context.targetCamp.description}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: 250,
        temperature: 0.7,
      });

      const raw = completion?.choices?.[0]?.message?.content?.trim() || "";
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.title === "string" && typeof parsed.description === "string") {
          return parsed;
        }
      } catch (_) {
        // fallthrough to fallback
      }

      // Fallback parsing: try to extract title/description from a loose JSON-like string
      const titleMatch = raw.match(/\"title\"\s*:\s*\"([^\"]+)\"/i);
      const descMatch = raw.match(/\"description\"\s*:\s*\"([^]+)\"\s*}?$/i);
      return {
        title: titleMatch ? titleMatch[1] : "Clear the Nearby Camp",
        description: descMatch ? descMatch[1] : "Eliminate the hostile presence entrenched in the nearby camp before their raids grow bolder.",
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("GPT Clear quest generation failed; using fallback.", err?.message || err);
      return {
        title: "Clear the Nearby Camp",
        description: "Eliminate the hostile presence entrenched in the nearby camp before their raids grow bolder.",
      };
    }
  }
}

// Export the class as the main export for compatibility with route usage,
// and also expose helper constants as properties.
module.exports = QuestGenerator;
module.exports.QUEST_PROMPT_SHAPES = QUEST_PROMPT_SHAPES;
module.exports.QUEST_TYPES = QUEST_TYPES;
module.exports.QUEST_STATES = QUEST_STATES;
