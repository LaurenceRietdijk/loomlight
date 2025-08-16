const mongoose = require("mongoose");
const OpenAI = require("openai");
const LocaleDAL = require("../dal/localeDAL");
const CharacterGenerator = require("./characterGenerator");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class LocaleGenerator {
  /**
   * Generates a new locale using OpenAI and inserts it via the DAL.
   * @param {string} world_id - The world database ID.
   * @param {number} x - The X coordinate.
   * @param {number} y - The Y coordinate.
   * @param {string} locale_type
   * @returns {Promise<Object>} - The newly inserted locale from the database.
   */
  static async generateAndInsertLocale(world_id, x, y, locale_type) {
    console.log(
      `Generating new locale at (${x}, ${y}) for world ${world_id}...`
    );

    // Fetch world
    const World = mongoose.model("World");
    const world = await World.findById(world_id).lean();
    if (!world) throw new Error(`World with ID ${world_id} not found`);

    const worldName = world.name || "Unnamed World";
    const worldDescription = world.description || "No description provided.";

    // Population range by type
    let populationRange;
    switch (locale_type.toLowerCase()) {
      case "hamlet":
        populationRange = [5, 20];
        break;
      case "village":
        populationRange = [100, 300];
        break;
      case "town":
        populationRange = [300, 1000];
        break;
      default:
        populationRange = [0, 10];
    }
    const population =
      Math.floor(
        Math.random() * (populationRange[1] - populationRange[0] + 1)
      ) + populationRange[0];

    // Select buildings
    function getRandomItems(list, count) {
      const shuffled = [...list].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, count);
    }

    let buildings = [];
    switch (locale_type.toLowerCase()) {
      case "hamlet":
        buildings = getRandomItems(HAMLET_BUILDINGS, 1);
        break;
      case "village":
        buildings = getRandomItems(
          VILLAGE_BUILDINGS,
          Math.floor(Math.random() * 3) + 2
        );
        break;
      case "town":
        buildings = getRandomItems(
          TOWN_BUILDINGS,
          Math.floor(Math.random() * 4) + 3
        );
        break;
    }

    // Prompt GPT for locale description
    const prompt = `Generate a ${locale_type} locale for the world "${worldName}".
The world is described as follows: ${worldDescription}
The locale is at coordinates (x: ${x}, y: ${y}).
It has a population of about ${population} and contains the following buildings: ${buildings.join(
      ", "
    )}.
Describe the locale as immersive, grounded, and contextually aware.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for locales in a medieval fantasy world.
Your response **must be valid JSON and contain no extra text**.

Use this format:
{
  "name": "Locale Name",
  "type": "Camp", "Hamlet", "Village", "Wilderness", "Cave", "Dungeon",
  "description": "A short but immersive description of the location.",
  "special_features": ["A list of unique landmarks, events, or history tied to this place."]
}`,
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    const generatedLocale = JSON.parse(completion.choices[0].message.content);

    // Initialize localeData
    const localeData = {
      _id: new mongoose.Types.ObjectId(),
      name: generatedLocale.name,
      type: generatedLocale.type,
      description: generatedLocale.description,
      coordinates: { x, y },
      factions: [],
      characters: [],
      population,
      resources: {
        wealth: "unknown",
        military_presence: "unknown",
        political_importance: "unknown",
      },
      special_features: generatedLocale.special_features || [],
      buildings,
    };

    // Generate characters per building
    for (const building of buildings) {
      const characters = await CharacterGenerator.generateCharactersForBuilding(
        world_id,
        localeData,
        building
      );

      for (const character of characters) {
        localeData.characters.push({
          _id: character._id,
          building: building,
          role: character.role,
        });
      }
    }

    const couples = assignSpouses(localeData.characters);

    for (const [partnerA, partnerB] of couples) {
      const children = CharacterGenerator.createFamily(
        [partnerA, partnerB],
        locale
      );
      localeData.characters.push(...children);
    }



    // Insert the complete locale
    return await LocaleDAL.insertLocale(world_id, localeData);
  }
}




function assignSpouses(characters) {
  const minAge = 16;
  const maxAgeGap = 20;
  const minMarriageAge = 16;
  const maxMarriageLength = 30;

  const males = characters.filter(
    (c) =>
      c.gender === "male" &&
      typeof c.age === "number" &&
      c.age >= minMarriageAge
  );
  const females = characters.filter(
    (c) =>
      c.gender === "female" &&
      typeof c.age === "number" &&
      c.age >= minMarriageAge
  );

  const usedIds = new Set();
  const couples = [];

  for (const male of males) {
    if (usedIds.has(male._id.toString())) continue;

    for (const female of females) {
      if (usedIds.has(female._id.toString())) continue;

      const ageDiff = Math.abs(male.age - female.age);
      if (ageDiff <= maxAgeGap) {
        const maxPossibleMarriageLength = Math.min(
          male.age - minMarriageAge,
          female.age - minMarriageAge,
          maxMarriageLength
        );

        const yearsMarried =
          Math.floor(Math.random() * maxPossibleMarriageLength) + 1;

        male.relationships = male.relationships || [];
        female.relationships = female.relationships || [];

        male.relationships.push({
          character_id: female._id,
          connection: "spouse",
          since: yearsMarried,
          shared_children: [],
        });

        female.relationships.push({
          character_id: male._id,
          connection: "spouse",
          since: yearsMarried,
          shared_children: [],
        });

        usedIds.add(male._id.toString());
        usedIds.add(female._id.toString());

        couples.push([male, female]); // collect couple pair for next step
        break;
      }
    }
  }

  return couples;
}


const HAMLET_BUILDINGS = [
  "Hunter's Lodge",
  "Fisherman's Dock",
  "Trapper's Hut",
  "Charcoal Burner's Kiln",
  "Logging Camp",
  "Ore Sluice or Pit Mine",
  "Clay Pit",
  "Salt Evaporation Shed",
  "Peat Cutter's Hut",
  "Bee Yard",
  "Herbalist's Shelter",
  "Shepherd's Pen",
  "Crop Field with Tool Shed",
  "Mushroom Grotto",
  "Stone Quarry Face",
];

const VILLAGE_BUILDINGS = [
  "Lumber Mill",
  "Smelting Yard",
  "Tannery",
  "Grain Mill",
  "Oil Press",
  "Spinning Hall",
  "Cheese House",
  "Pottery Kiln",
  "Brick Oven Yard",
  "Dye Works",
  "Smokehouse",
  "Leather Curing Shed",
  "Paper Press",
  "Brewery",
  "Charcoal Packing Barn",
];

const TOWN_BUILDINGS = [
  "Blacksmith's Forge",
  "Tailor's Shop",
  "Cobbler's Stall",
  "Armorer's Hall",
  "Jeweler's Bench",
  "Bookbinder's Atelier",
  "Glassblower's Studio",
  "Carpenter's Workshop",
  "Mason's Yard",
  "Scribe's Library",
  "Toolmaker's Depot",
  "Tavern",
  "General Market Square",
  "Weaponsmith's Forge",
  "Fine Leatherworking Parlour",
  "Sculptor's Studio",
  "Horologist's Nook",
];


module.exports = LocaleGenerator;
