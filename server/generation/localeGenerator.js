const mongoose = require("mongoose");
const gpt = require("../services/gptService");
const LocaleDAL = require("../dal/localeDAL");
const characterDAL = require("../dal/characterDAL");
const CharacterGenerator = require("./characterGenerator");
const BuildingGenerator = require("./buildingGenerator");
const RaceDAL = require("../dal/raceDAL");
const BiomeDAL = require("../dal/biomeDAL");

class LocaleGenerator {
  /**
   * Generates a new locale using OpenAI and inserts it via the DAL.
   * @param {string} world_id - The world database ID.
   * @param {number} x - The X coordinate.
   * @param {number} y - The Y coordinate.
   * @param {string} locale_type - e.g. "Camp", "Hamlet", "Village", "Town".
   * @param {string|null} primaryRaceId - Optional race ObjectId to force as primary race.
   * @returns {Promise<Object>} - The newly inserted locale from the database.
   */
  static async generateAndInsertLocale(world_id, x, y, locale_type, primaryRaceId = null) {
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
      case "camp":
        populationRange = [5, 10];
        break;
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
      case "camp":
        buildings = [];
        break;
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

    const generatedLocale = await gpt.chatJSONPrompt(
      "You are an AI that generates JSON data for locales in a medieval fantasy world.\n" +
            "Your response must be valid JSON and contain no extra text.\n\n" +
            "Use this format:\n{\n  \"name\": \"Locale Name\",\n  \"type\": \"Camp\", \"Hamlet\", \"Village\", \"Wilderness\", \"Cave\", \"Dungeon\",\n  \"description\": \"A short but immersive description of the location.\",\n  \"special_features\": [\"A list of unique landmarks, events, or history tied to this place.\"]\n}",
      prompt,
      { max_tokens: 300, temperature: 0.8 }
    );


    // Choose a primary race
    const races = await RaceDAL.getRaces(world_id);
    let primaryRace = null;
    if (primaryRaceId) {
      // If caller provided a primary race, use it directly when available
      primaryRace = await RaceDAL.getRaceById(world_id, primaryRaceId);
    } else {
      // Auto-select: for camps use any race; for settlements prefer sapient races
      if (locale_type.toLowerCase() === "camp") {
        primaryRace = races.length
          ? races[Math.floor(Math.random() * races.length)]
          : null;
      } else {
        const sentientRaces = races.filter((r) => r.classification === "Sapient");
        primaryRace = sentientRaces.length
          ? sentientRaces[Math.floor(Math.random() * sentientRaces.length)]
          : (races.length ? races[Math.floor(Math.random() * races.length)] : null);
      }
    }

    // Initialize localeData
    const localeData = {
      _id: new mongoose.Types.ObjectId(),
      name: generatedLocale.name,
      type: generatedLocale.type,
      description: generatedLocale.description,
      coordinates: { x, y },
      primary_race: primaryRace ? primaryRace._id : null,
      factions: [],
      characters: [],
      population,
      resources: {
        wealth: "unknown",
        military_presence: "unknown",
        political_importance: "unknown",
      },
      special_features: generatedLocale.special_features || [],
      buildings: [],
    };

    // Assign a biome randomly from available biomes (global), not via GPT
    try {
      const biomes = await BiomeDAL.getBiomes();
      if (Array.isArray(biomes) && biomes.length) {
        const random = biomes[Math.floor(Math.random() * biomes.length)];
        if (random && random._id) {
          localeData.biome = random._id;
        }
      }
    } catch (e) {
      console.warn("Could not assign biome to locale:", e?.message || e);
    }

    // If this is a camp, we follow a simplified flow: no buildings or families
    if (locale_type.toLowerCase() === "camp") {
      // Build a simple set of characters equal to population
      const raceName = primaryRace?.name || "Human";
      const characters = [];
      for (let i = 0; i < population; i++) {
        const id = new mongoose.Types.ObjectId();
        // Simple randomization for age and gender
        const genders = ["male", "female", "nonbinary"];
        const gender = genders[Math.floor(Math.random() * genders.length)];
        const age = 16 + Math.floor(Math.random() * 45); // 16-60

        characters.push({
          _id: id,
          name: `Camper ${i + 1}`,
          title: "",
          description: "A member of the traveling camp.",
          personality: "Tight-knit, resourceful, and communal.",
          race: raceName,
          age,
          gender,
          faction: null,
          location: { locale: localeData._id, building: null, room: null },
          home: null,
          work: null,
          role: "camper",
          status: "active",
          relationships: [],
        });
      }

      // Everyone knows everyone else: add "camp mate" relationships
      for (const c of characters) {
        c.relationships = characters
          .filter((o) => o._id.toString() !== c._id.toString())
          .map((o) => ({ character_id: o._id, connection: "camp mate" }));
      }

      // Insert characters
      await characterDAL.insertCharacters(world_id, characters);

      // Reference characters in the locale summary
      localeData.characters = characters.map((c) => ({
        _id: c._id,
        building: null,
        role: c.role,
      }));

      // Insert the complete locale
      return await LocaleDAL.insertLocale(world_id, localeData);
    }

    // Generate characters for each building type first
    const allCharacters = [];
    const workRosters = [];
    for (const buildingType of buildings) {
      const characters = await CharacterGenerator.generateCharactersForBuilding(
        world_id,
        localeData,
        buildingType,
        primaryRace
      );
      allCharacters.push(...characters);
      workRosters.push(
        characters.map((c) => ({
          character_id: c._id.toString(),
          name: c.name,
          role: c.role,
          tags: ["employee"],
        }))
      );
    }

    // Assign spouses and create families
    const couples = assignSpouses(allCharacters);
    const families = [];
    for (const [partnerA, partnerB] of couples) {
      const children = await CharacterGenerator.createFamily(
        [partnerA, partnerB],
        localeData,
        primaryRace
      ) || [];
      if (Array.isArray(children) && children.length) {
        allCharacters.push(...children);
      }
      families.push({ parents: [partnerA, partnerB], children: Array.isArray(children) ? children : [] });
    }

    // Compose full list of building types and rosters (workplaces first, then houses)
    const houseTypes = families.map(() => "House");
    const houseRosters = families.map((fam) =>
      [
        ...(Array.isArray(fam.parents) ? fam.parents : []),
        ...(Array.isArray(fam.children) ? fam.children : []),
      ].map((c) => ({
        character_id: c._id.toString(),
        name: c.name,
        role: c.role,
        tags: ["resident"].concat(
          c.role === "child" ? ["child"] : ["parent"]
        ),
      }))
    );

    const allBuildingTypes = [...buildings, ...houseTypes];
    const allRosters = [...workRosters, ...houseRosters];

    // Generate buildings with AI, leveraging rosters to get room assignments
    const insertedBuildings = await BuildingGenerator.generateBuildingsForLocale(
      world_id,
      localeData,
      allBuildingTypes,
      allRosters
    );
    localeData.buildings = insertedBuildings.map((b) => b._id);

    // Build lookup: building type sequence aligns with insertedBuildings
    const workBuildings = insertedBuildings.slice(0, buildings.length);
    const houseBuildings = insertedBuildings.slice(buildings.length);

    // Assign work/home and room locations based on room.character assignments
    const roomAssignmentsByCharWork = new Map();
    for (const b of workBuildings) {
      for (const room of b.rooms || []) {
        for (const cid of room.characters || []) {
          roomAssignmentsByCharWork.set(String(cid), { building: b._id, room: room._id });
        }
      }
    }
    const roomAssignmentsByCharHome = new Map();
    for (const b of houseBuildings) {
      for (const room of b.rooms || []) {
        for (const cid of room.characters || []) {
          roomAssignmentsByCharHome.set(String(cid), { building: b._id, room: room._id });
        }
      }
    }

    // Update character home/work and locations
    const workIdByChar = new Map();
    for (const [idx, b] of workBuildings.entries()) {
      for (const entry of allRosters[idx] || []) {
        workIdByChar.set(entry.character_id, b._id);
      }
    }
    const homeIdByChar = new Map();
    for (let i = 0; i < houseBuildings.length; i++) {
      const b = houseBuildings[i];
      const roster = houseRosters[i] || [];
      for (const entry of roster) {
        homeIdByChar.set(entry.character_id, b._id);
      }
    }

    for (const c of allCharacters) {
      const id = String(c._id);
      // Set work/home ids
      if (workIdByChar.has(id)) c.work = workIdByChar.get(id);
      if (homeIdByChar.has(id)) c.home = homeIdByChar.get(id);

      // Determine where they are located: prefer work if exists, else home
      const workAssign = roomAssignmentsByCharWork.get(id);
      const homeAssign = roomAssignmentsByCharHome.get(id);
      const chosen = workAssign || homeAssign || null;
      c.location = {
        locale: localeData._id,
        building: chosen ? chosen.building : c.work || c.home || null,
        room: chosen ? chosen.room : null,
      };
    }

    // Rebuild locale character summaries after home/work assignments
    localeData.characters = allCharacters.map((c) => ({
      _id: c._id,
      building: c.work || (c.location ? c.location.building : null) || c.home || null,
      role: c.role,
    }));


    // Insert all characters
    await characterDAL.insertCharacters(world_id, allCharacters);

    // Insert the complete locale
    return await LocaleDAL.insertLocale(world_id, localeData);
  }
}




function assignSpouses(characters) {
  const maxAgeGap = 20;
  const minMarriageAge = 16;
  const maxMarriageLength = 30;

  const g = (c) =>
    String(c.gender || "")
      .trim()
      .toLowerCase();
  const ageNum = (c) => Number(c.age);
  const isAdult = (c) =>
    Number.isFinite(ageNum(c)) && ageNum(c) >= minMarriageAge;
  const hasSpouse = (c) =>
    Array.isArray(c.relationships) &&
    c.relationships.some((r) => r.connection === "spouse");

  const males = characters.filter(
    (c) => (g(c) === "male" || g(c) === "m") && isAdult(c) && !hasSpouse(c)
  );
  const females = characters.filter(
    (c) => (g(c) === "female" || g(c) === "f") && isAdult(c) && !hasSpouse(c)
  );

  const usedIds = new Set();
  const couples = [];

  // optional: shuffle females for fairness
  const shuffledFemales = [...females].sort(() => Math.random() - 0.5);

  for (const male of males) {
    const maleId = String(male._id);
    if (usedIds.has(maleId)) continue;

    for (const female of shuffledFemales) {
      const femaleId = String(female._id);
      if (usedIds.has(femaleId)) continue;

      const mAge = ageNum(male);
      const fAge = ageNum(female);
      if (!Number.isFinite(mAge) || !Number.isFinite(fAge)) continue;

      const ageDiff = Math.abs(mAge - fAge);
      if (ageDiff > maxAgeGap) continue;

      const maxPossibleMarriageLength = Math.min(
        mAge - minMarriageAge,
        fAge - minMarriageAge,
        maxMarriageLength
      );
      if (maxPossibleMarriageLength <= 0) continue;

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

      usedIds.add(maleId);
      usedIds.add(femaleId);

      console.log(`Couple found: "${male.name}" and "${female.name}"...`);
      couples.push([male, female]);
      break;
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
