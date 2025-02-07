const mongoose = require("mongoose");
const OpenAI = require("openai");
const express = require("express");
const router = express.Router();
const World = require("../models/world");
const getDatabaseConnection = require("../config/worldDBs"); 
const { schema: FactionSchema } = require("../models/faction"); 

// Create an OpenAI instance
const openai = new OpenAI({
  apiKey: process.env.API_KEY, // Ensure this is set in your .env file
});

// Get all events
router.get("/", async (req, res) => {
  let worldName;
  let worldBuilding;

  // Generate name
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: "Generate a creative and unique name for a fantasy world. The name should be evocative and suitable for a medieval fantasy setting. Only provide the name without any additional text or explanation.",
        },
      ],
      max_tokens: 10,
      temperature: 0.7,
    });
    worldName = completion.choices[0].message.content;
    console.log("Generated World Name:", worldName);
  } catch (error) {
    console.error(
      "Error generating world name:",
      error.response?.data || error.message
    );
    return res.status(500).json({ error: "Error generating world name" });
  }

  // Generate WorldBuilding text
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Provide detailed worldbuilding for a medieval fantasy world named "${worldName}".`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.8,
    });
    worldBuilding = completion.choices[0].message.content;
    console.log("Worldbuilding Text:", worldBuilding);
  } catch (error) {
    console.error(
      "Error generating worldbuilding text:",
      error.response?.data || error.message
    );
    return res
      .status(500)
      .json({ error: "Error generating worldbuilding text" });
  }

  // Prepare additional fields automatically
  const now = new Date();
  // Using en-GB locale for "DD/MM/YYYY" format; adjust if needed.
  const dateCreated = now.toLocaleDateString("en-GB");
  // Format time as "HH:mm"
  const timeStamp = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  try {
    // Create new world instance with all required fields
    const world = new World({
      _id: new mongoose.Types.ObjectId().toString(), // Generate a unique string ID
      name: worldName,
      WorldBuilding: worldBuilding,
      dateCreated, // Automatically set date
      timeStamp, // Automatically set time
      creator: "no_creator", // Placeholder creator value
    });

    const newWorld = await world.save();

    res.status(201).json({ world: newWorld });
  } catch (error) {
    console.error("Error saving world to database:", error);
    res.status(500).json({ error: "Server Error" });
  }
});




// fill in world
router.get("/:world_id/factions", async (req, res) => {
  const { world_id } = req.params;
  let world;

  try {
    world = await World.findOne({ _id: world_id });
    if (!world) {
      return res.status(404).json({ error: "World not found" });
    }
  } catch (error) {
    console.error("Error fetching world:", error);
    return res.status(500).json({ error: "Server Error" });
  }

  // Establish dynamic connection to the new database
  const db = getDatabaseConnection(world_id);
  const Faction = db.model("Faction", FactionSchema);

  // OpenAI prompt
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that generates JSON for factions in a medieval fantasy world.
                    Your response **must be valid JSON and contain no extra text**.
                    Each faction should follow this structure:
                    {
                        "faction_id": "unique_faction_id",
                        "name": "Faction Name",
                        "description": "A brief but immersive description of the faction.",
                        "alignment": "One of: Lawful Good, Neutral Good, Chaotic Good, Lawful Neutral, True Neutral, Chaotic Neutral, Lawful Evil, Neutral Evil, Chaotic Evil.",
                        "resources": {
                            "wealth": "low / moderate / high",
                            "military_strength": "weak / average / strong",
                            "political_influence": "low / medium / high"
                        },
                        "allies": ["faction_id_1", "faction_id_2"],
                        "enemies": ["faction_id_3", "faction_id_4"]
                    }

                    **Important Rules:**
                        - You must generate at least 4 factions.
                        - "allies" and "enemies" **must only reference names from the generated factions**.
                        - Do not create factions outside of the generated list.
                        - Do not add factions to "allies" or "enemies" that were not previously generated.

                    Return an **array of multiple factions** inside a JSON array.`,
        },
        {
          role: "user",
          content: `Generate factions for a world with the following worldbuilding:

                    ${world.WorldBuilding}

                    The factions should fit the world and feel natural within its politics, conflicts, and cultures.`,
        },
      ],
      max_tokens: 1500,
      temperature: 0.8,
    });

    // Log the raw GPT response to confirm allies/enemies are correct
    console.log("Raw GPT Response:", completion.choices[0].message.content);

    // Parse GPT response
    let factions = JSON.parse(completion.choices[0].message.content);

    // Step 1: Assign predefined ObjectIds to each faction using faction_id
    const factionMap = {};
    factions.forEach((faction) => {
      factionMap[faction.faction_id] = new mongoose.Types.ObjectId(); // Assign new ObjectId
    });

    // Step 2: Prepare faction data with correct IDs and references
    const factionData = factions.map((faction) => ({
      _id: factionMap[faction.faction_id], // Use assigned ObjectId
      name: faction.name,
      description: faction.description,
      alignment: faction.alignment,
      resources: {
        wealth: faction.resources.wealth,
        military_strength: faction.resources.military_strength,
        political_influence: faction.resources.political_influence,
      },
      allies: (faction.allies || [])
        .map((id) => factionMap[id] || null) // Map faction_id → ObjectId
        .filter((id) => id), // Remove null values
      enemies: (faction.enemies || [])
        .map((id) => factionMap[id] || null) // Map faction_id → ObjectId
        .filter((id) => id), // Remove null values
    }));

    // Log the transformed data before insertion
    console.log(
      "Processed Faction Data:",
      JSON.stringify(factionData, null, 2)
    );

    // Step 3: Insert factions into MongoDB
    const insertedFactions = await Faction.insertMany(factionData);

    res
      .status(201)
      .json({
        message: "Factions generated and saved",
        factions: insertedFactions,
      });
  } catch (error) {
    console.error("Error generating factions:", error);
    res.status(500).json({ error: "Server Error" });
  }
});



router.delete("/:world_id/factions", async (req, res) => {
  const { world_id } = req.params;

  try {
    // Establish dynamic connection to the world-specific database
    const db = getDatabaseConnection(world_id);
    const Faction = db.model("Faction", FactionSchema);

    // Delete all factions
    const result = await Faction.deleteMany({});

    res
      .status(200)
      .json({
        message: "All factions deleted successfully",
        deletedCount: result.deletedCount,
      });
  } catch (error) {
    console.error("Error deleting factions:", error);
    res.status(500).json({ error: "Server Error" });
  }
});


module.exports = router;
