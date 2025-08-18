const mongoose = require("mongoose");
const OpenAI = require("openai");
const CharacterDAL = require("../dal/characterDAL");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class CharacterGenerator {
  /**
   * Generates a new character using OpenAI and inserts it via the DAL.
   * @param {string} locale_id - The ID of the locale the character belongs to.
   * @param {string} buildingName - The name of the building the character works in.
   * @param {string} buildingRole - The character's role within the building.
   * @returns {Promise<Object>} - The newly inserted character.
   */
  static async generateAndInsertCharacter(
    locale_id,
    buildingName,
    buildingRole
  ) {
    console.log(
      `Generating character for locale ${locale_id} in ${buildingName} as ${buildingRole}...`
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
    const userPrompt = `Generate a character who works as a ${buildingRole} in the ${buildingName} of ${localeName}, a ${localeType.toLowerCase()}.
This is a medieval fantasy world.
Locale description: ${localeDescription}.
Give the character an immersive backstory and clear personality traits.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that creates NPCs for a medieval fantasy game.
Your response **must be valid JSON and contain no extra text**.

The character format is:
{
  "name": "Full Name",
  "title": "Optional title",
  "role": "Role in the building",
  "description": "Short summary of appearance and background.",
  "personality": "Brief temperament or habits.",
  "race": "Fantasy race like Elf, Human, Dwarf, etc.",
  "gender": "male" | "female" | "nonbinary",
  "age": Number
}`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      max_tokens: 400,
      temperature: 0.85,
    });

    const raw = completion.choices[0].message.content;
    const parsed = JSON.parse(raw);

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
      locale: locale._id,
      building: buildingName,
      role: buildingRole,
      status: "active",
      relationships: [],
    };

    return await CharacterDAL.insertCharacter(characterData);
  }

  /**
   * Generates 2–4 unique characters for a building within a locale and inserts them.
   * @param {Object} locale - The full locale document (must include _id, name, type, description, population).
   * @param {string} buildingName - Name of the building (e.g. "Blacksmith's Forge").
   * @returns {Promise<Array>} - Array of inserted character objects.
   */
  static async generateCharactersForBuilding(
    world_id,
    locale,
    buildingName,
    primaryRace
  ) {
    console.log(
      `Generating characters for building "${buildingName}" in locale "${locale.name}"...`
    );

    const prompt = `Generate 2 to 4 unique NPCs who work in the "${buildingName}" of the ${locale.type.toLowerCase()} "${
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

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that creates immersive NPCs for medieval fantasy games. Only return valid JSON arrays.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 600,
      temperature: 0.85,
    });

    const rawContent = completion.choices[0].message.content;
    let generatedList;

    try {
      generatedList = JSON.parse(rawContent);
      if (!Array.isArray(generatedList)) {
        throw new Error("GPT response is not an array");
      }
    } catch (err) {
      console.error("Failed to parse GPT character array:", err);
      console.error("GPT output was:\n", rawContent);
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
      gender: allowedGenders.includes(c.gender)
        ? c.gender
        : "unknown",
      faction: null,
      locale: locale._id,
      building: buildingName,
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
    const insertedCharacters = await CharacterDAL.insertCharacters(
      world_id,
      characterDocuments
    );

    return insertedCharacters;
  }



  /**
   * Creates a set of child characters based on two married parent characters.
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
  static createFamily([parentA, parentB], locale, race) {
    const minChildbearingAge = 16;
    const childbearingInterval = 2; // Avg years between kids

    const lifespan = race?.physiology?.lifespan || 80;
    const maxChildbearingAge = Math.floor(lifespan / 2);
    const maxChildren = Math.max(
      0,
      Math.floor((maxChildbearingAge - minChildbearingAge) / childbearingInterval)
    );

    // Get marriage duration
    const spouseRelation = parentA.relationships.find(
      (r) => r.character_id.toString() === parentB._id.toString()
    );
    const yearsMarried = spouseRelation?.since || 0;

    // Determine shared fertile years
    const fertileYears = Math.min(
      yearsMarried,
      parentA.age - minChildbearingAge,
      parentB.age - minChildbearingAge,
      maxChildbearingAge - minChildbearingAge
    );

    if (fertileYears < 1) return []; // No opportunity to have kids

    const maxPossibleChildren = Math.min(
      Math.floor(fertileYears / childbearingInterval),
      maxChildren
    );
    const numChildren = Math.floor(Math.random() * (maxPossibleChildren + 1)); // 0 to maxPossibleChildren

    const children = [];
    const parentIds = [parentA._id, parentB._id];

    for (let i = 0; i < numChildren; i++) {
      // Age: must be younger than both parents and born within marriage
      const maxChildAge = Math.min(
        yearsMarried,
        parentA.age - minChildbearingAge,
        parentB.age - minChildbearingAge,
        maxChildbearingAge - minChildbearingAge
      );
      const age = Math.max(1, Math.floor(Math.random() * maxChildAge));

      const gender = Math.random() < 0.5 ? "male" : "female";

      const child = {
        _id: new mongoose.Types.ObjectId(),
        name: "(Child)",
        title: "",
        description: `A young ${gender} child born to ${parentA.name} and ${parentB.name}.`,
        personality: "Still developing.",
        race: parentA.race || "Human",
        gender,
        age,
        faction: null,
        locale: locale._id,
        building: null,
        role: "child",
        status: "active",
        relationships: [],
      };

      // Link parents <-> child
      for (const parent of [parentA, parentB]) {
        parent.relationships.push({
          character_id: child._id,
          connection: "child",
        });

        child.relationships.push({
          character_id: parent._id,
          connection: "parent",
        });

        // Add to shared_children (if relationship object exists)
        const rel = parent.relationships.find(
          (r) =>
            r.character_id.toString() ===
              (parent === parentA
                ? parentB._id.toString()
                : parentA._id.toString()) && r.connection === "spouse"
        );
        if (rel && Array.isArray(rel.shared_children)) {
          rel.shared_children.push(child._id);
        }
      }

      children.push(child);
    }

    // Add sibling relationships
    for (const child of children) {
      child.relationships.push(
        ...children
          .filter((c) => c._id.toString() !== child._id.toString())
          .map((sibling) => ({
            character_id: sibling._id,
            connection: "sibling",
          }))
      );
    }

    return children;
  }
}

const allowedGenders = ["male", "female", "nonbinary"];

module.exports = CharacterGenerator;
