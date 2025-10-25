const mongoose = require("mongoose");
const gpt = require("../services/gptService");
const CharacterDAL = require("../dal/characterDAL");

class CharacterGenerator {
  /**
   * Generates a new character using OpenAI and inserts it via the DAL.
   * @param {string} locale_id - The ID of the locale the character belongs to.
   * @param {string} buildingName - The name of the building the character works in.
   * @param {string} buildingRole - The character's role within the building.
   * @returns {Promise<Object>} - The newly inserted character.
   */
  static async generateAndInsertCharacter(
    world_id,
    locale_id,
    building,
    buildingRole
  ) {
    console.log(
      `Generating character for locale ${locale_id} in ${building?.name || "Building"} as ${buildingRole}...`
    );

    // Fetch the locale for context
    const Locale = mongoose.model("Locale");
    const locale = await Locale.findById(locale_id).lean();

    if (!locale) {
      throw new Error(`Locale with ID ${locale_id} not found`);
    }

    const localeName = locale.name || "Unnamed Locale";
    const localeType = locale.type || "Unknown";
    const localeDescription = locale.description || "No description available.";

    // Build the GPT prompt
    const userPrompt = `Generate a character who works as a ${buildingRole} in the ${building?.name || "building"} of ${localeName}, a ${localeType.toLowerCase()}.
This is a medieval fantasy world.
Locale description: ${localeDescription}.
Give the character an immersive backstory and clear personality traits.`;

    const parsed = await gpt.chatJSONPrompt(
      "You are an AI that creates NPCs for a medieval fantasy game.\n" +
            "Your response must be valid JSON and contain no extra text.\n\n" +
            "The character format is:\n{\n  \"name\": \"Full Name\",\n  \"title\": \"Optional title\",\n  \"role\": \"Role in the building\",\n  \"description\": \"Short summary of appearance and background.\",\n  \"personality\": \"Brief temperament or habits.\",\n  \"race\": \"Fantasy race like Elf, Human, Dwarf, etc.\",\n  \"gender\": \"male\" | \"female\" | \"nonbinary\",\n  \"age\": Number\n}",
      userPrompt,
      { max_tokens: 400, temperature: 0.85 }
    );


    let raceName = parsed.race;
    if (locale.primary_race) {
      const Race = mongoose.model("Race");
      const raceDoc = await Race.findById(locale.primary_race).lean();
      raceName = raceDoc?.name || raceName;
    }

    // Construct the character document
    const characterData = {
      _id: new mongoose.Types.ObjectId(),
      name: parsed.name,
      title: parsed.title || "",
      description: parsed.description,
      personality: parsed.personality,
      race: raceName,
      age: parsed.age || null,
      gender: allowedGenders.includes(parsed.gender)
        ? parsed.gender
        : "unknown",
      faction: null,
      location: { locale: locale._id, building: building?._id || null, room: null },
      home: null,
      work: building?._id || null,
      role: buildingRole,
      status: "active",
      relationships: [],
    };

    return await CharacterDAL.insertCharacter(world_id, characterData);
  }

  /**
   * Generates 2–4 unique characters for a building within a locale and inserts them.
   *
   * Returns list of documents only; DOES NOT INSERT INTO DB!!!
   *
   * @param {Object} locale - The full locale document (must include _id, name, type, description, population).
   * @param {string} buildingName - Name of the building (e.g. "Blacksmith's Forge").
   * @returns {Promise<Array>} - Array of inserted character objects.
   */
  static async generateCharactersForBuilding(
    world_id,
    locale,
    buildingType,
    primaryRace
  ) {
    console.log(
      `Generating characters for building type "${buildingType}" in locale "${locale.name}"...`
    );

    const prompt = `Generate 2 to 4 unique NPCs who work in a "${buildingType}" in the ${locale.type.toLowerCase()} "${
      locale.name
    }".

The locale has a population of ${locale.population || "unknown"}.
Locale description: ${locale.description}
All characters should be of the ${primaryRace?.name || "Human"} race.

Each character should have a distinct role (e.g. forge master, apprentice, bookkeeper) and personality. Avoid repeating names or roles.

Return your answer as a valid JSON array with no extra text. Use this format:
[
  {
    "name": "Full Name",
    "title": "Optional title",
    "role": "Role in the building",
    "description": "Short summary of appearance and background.",
    "personality": "Brief temperament or habits.",
    "race": "Fantasy race like Elf, Human, Dwarf, etc.",
    "gender": "male" | "female" | "nonbinary",
    "age": Number
  }
]`;

    let generatedList;
    try {
      const content = await gpt.chatJSONPrompt(
      "You are an AI that creates immersive NPCs for medieval fantasy games. Only return valid JSON arrays.",
      prompt,
      { max_tokens: 600, temperature: 0.85 }
    );

      if (!Array.isArray(content)) throw new Error("GPT response is not an array");
      generatedList = content;
    } catch (err) {
      console.error("Failed to parse GPT character array:", err);
      throw new Error("Character generation failed: Invalid JSON");
    }

    // Insert characters into DB
    // Build all character documents first
    const characterDocuments = generatedList.map((c) => ({
      _id: new mongoose.Types.ObjectId(),
      name: c.name,
      title: c.title || "",
      description: c.description,
      personality: c.personality,
      race: primaryRace?.name || c.race,
      age: c.age || null,
      gender: allowedGenders.includes(c.gender) ? c.gender : "unknown",
      faction: null,
      location: { locale: locale._id, building: null, room: null },
      home: null,
      work: null,
      role: c.role,
      status: "active",
      relationships: [],
    }));

    // Link coworkers before insert
    for (const character of characterDocuments) {
      character.relationships = characterDocuments
        .filter((other) => other._id.toString() !== character._id.toString())
        .map((other) => ({
          character_id: other._id,
          connection: "coworker",
        }));
    }

    // Insert all characters at once
    const db = require("../config/worldDBs")(world_id);
    const CharacterModel = db.model(
      "Character",
      require("../models/character")
    );

    return characterDocuments;
  }

  /**
   * Creates a set of child characters based on two married parent characters.
   *
   * Returns list of documents only; DOES NOT INSERT INTO DB!!!
   *
   * Determines the number and age of children based on marriage duration
   * and the fertility window of both parents. Establishes bidirectional
   * relationships: parent-child, sibling-sibling, and shared_children references
   * in the parents' spouse relationship entries.
   *
   * @param {[Object, Object]} parents - A two-element array of parent character objects (must contain `_id`, `age`, `gender`, `relationships`, and `race`).
   * @param {Object} locale - The locale object the children belong to (must contain `_id`).
   * @returns {Array<Object>} An array of child character documents, ready for insertion.
   */
  static async createFamily([parentA, parentB], locale, race) {
    const minChildbearingAge = 16;
    const childbearingInterval = 2;
    const lifespan = race?.physiology?.lifespan || 80;
    const maxChildbearingAge = Math.floor(lifespan / 2);

    const spouseRelation = parentA.relationships.find(
      (r) =>
        r.character_id.toString() === parentB._id.toString() &&
        r.connection === "spouse"
    );
    const yearsMarried = spouseRelation?.since || 0;

    const fertileYears = Math.min(
      yearsMarried,
      parentA.age - minChildbearingAge,
      parentB.age - minChildbearingAge,
      maxChildbearingAge - minChildbearingAge
    );

    if (fertileYears < 1) return [];

    const expected = Math.floor(fertileYears / childbearingInterval);
    const numChildren = Math.max(
      0,
      Math.floor(expected * (0.5 + Math.random()))
    );

    // 1. Build skeletons programmatically
    const skeletons = [];
    for (let i = 0; i < numChildren; i++) {
      const birthGap =
        i * childbearingInterval +
        Math.floor(Math.random() * childbearingInterval);
      const age = Math.max(1, yearsMarried - birthGap);

      const genderRoll = Math.random();
      const gender =
        genderRoll < 0.48 ? "male" : genderRoll < 0.96 ? "female" : "nonbinary";

      skeletons.push({
        _id: new mongoose.Types.ObjectId(),
        age,
        gender,
        race: parentA.race || "Human",
      });
    }

    if (skeletons.length === 0) return [];

    // 2. Ask GPT to flesh them out
    const prompt = `You are helping generate child NPCs in a medieval fantasy world.

Parents:
- ${parentA.name}, age ${parentA.age}, ${parentA.race}. Description: ${parentA.description}
- ${parentB.name}, age ${parentB.age}, ${parentB.race}. Description: ${parentB.description}

Race context:
${JSON.stringify(race, null, 2)}

Children skeletons:
${JSON.stringify(skeletons, null, 2)}

For each skeleton, fill in:
- "name": a fitting name for their culture/race,
- "description": 1–2 sentences describing appearance and personality,
- "personality": a brief temperament,
Keep the age, gender, and race values exactly as given.

Return ONLY a JSON array with the same length as skeletons.`;

    let fleshed;
    try {
      const content = await gpt.chatJSONPrompt(
      "You generate NPC children for a medieval fantasy world. Output must be valid JSON array only.",
      prompt,
      { max_tokens: 500, temperature: 0.8 }
    );

      fleshed = content;
    } catch (e) {
      fleshed = null;
    }

    // Be resilient to non-array responses from the model
    if (!Array.isArray(fleshed)) {
      // Attempt to coerce common shapes into an array
      try {
        if (typeof fleshed === "string") {
          const parsed = JSON.parse(fleshed);
          fleshed = parsed;
        }
        if (!Array.isArray(fleshed) && fleshed && typeof fleshed === "object") {
          const candidateKeys = ["children", "data", "list", "items", "result"];
          for (const k of candidateKeys) {
            if (Array.isArray(fleshed[k])) {
              fleshed = fleshed[k];
              break;
            }
          }
        }
      } catch (_) {
        // ignore parse errors; we'll fall back below
      }
    }

    // If still not an array, synthesize child details locally instead of failing
    if (!Array.isArray(fleshed)) {
      console.warn("Invalid JSON array from model for children; using fallback synthesis.");
      fleshed = skeletons.map((s, i) => ({
        name: `${parentA.name?.split(" ")[0] || "Child"} ${i + 1}`,
        description: `Child of ${parentA.name} and ${parentB.name}.`,
        personality: "Curious and energetic.",
      }));
    }

    // 3. Merge GPT data into skeleton docs
    const children = skeletons.map((s, idx) => {
      const g = fleshed[idx] || {};
      return {
        _id: s._id,
        name: g.name || "(Child)",
        description:
          g.description || `Child of ${parentA.name} and ${parentB.name}`,
        personality: g.personality || "Still developing.",
        race: s.race,
        gender: s.gender,
        age: s.age,
        faction: null,
        location: { locale: locale._id, building: null, room: null },
        home: null,
        work: null,
        role: "child",
        status: "active",
        relationships: [],
      };
    });

    // 4. Relationships (parents, siblings, shared_children)
    for (const child of children) {
      for (const parent of [parentA, parentB]) {
        parent.relationships.push({
          character_id: child._id,
          connection: "child",
        });
        child.relationships.push({
          character_id: parent._id,
          connection: "parent",
        });
      }
      if (spouseRelation && Array.isArray(spouseRelation.shared_children)) {
        spouseRelation.shared_children.push(child._id);
      }
    }

    // Add sibling links
    for (const child of children) {
      child.relationships.push(
        ...children
          .filter((c) => c._id.toString() !== child._id.toString())
          .map((sib) => ({ character_id: sib._id, connection: "sibling" }))
      );
    }

    return children;
  }
}

const allowedGenders = ["male", "female", "nonbinary"];

module.exports = CharacterGenerator;
