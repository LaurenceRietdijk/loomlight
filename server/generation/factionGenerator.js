const mongoose = require("mongoose");
const OpenAI = require("openai");
const FactionDAL = require("../dal/factionDAL");
const FactionPactDAL = require("../dal/factionPactDAL");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class FactionGenerator {
  /**
   * Generates and inserts factions into the database.
   * @param {string} world_id - The world database ID.
   * @param {number} count - Number of factions to generate.
   * @returns {Promise<Object[]>} - Array of inserted factions.
   */
  static async generateAndInsertFactions(world_id, count = 3) {
    console.log(`Generating ${count} factions for world ${world_id}...`);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for factions in a medieval fantasy world.
                    Your response **must be valid JSON and contain no extra text**.
                    
                    Each faction should follow this structure:
                    {
                      "name": "Faction Name",
                      "description": "A short but immersive description of the faction's history and values.",
                      "alignment": "Lawful Good, Neutral, Chaotic Evil, etc.",
                      "resources": {
                        "wealth": "low, moderate, high",
                        "military_strength": "weak, average, strong",
                        "political_influence": "low, medium, high"
                      }
                    }`,
        },
        {
          role: "user",
          content: `Generate ${count} factions for the world "${world_id}".`,
        },
      ],
      max_tokens: 700,
      temperature: 0.8,
    });

    let generatedFactions = JSON.parse(completion.choices[0].message.content);

    let insertedFactions = [];
    for (let faction of generatedFactions) {
      let factionData = {
        _id: new mongoose.Types.ObjectId(),
        name: faction.name,
        description: faction.description,
        alignment: faction.alignment,
        world_id: world_id,
        resources: faction.resources,
      };
      let insertedFaction = await FactionDAL.insertFaction(
        world_id,
        factionData
      );
      insertedFactions.push(insertedFaction);
    }

    return insertedFactions;
  }

  /**
   * Identifies missing faction pacts that need to be created.
   * @param {Object} world - The world object.
   * @returns {Promise<Array>} - Array of missing faction pairs as objects.
   */
  static async findMissingFactionPacts(world) {
    console.log(`Identifying missing faction pacts in world ${world.name}...`);

    const factions = await FactionDAL.getFactions(world._id);
    const existingPacts = await FactionPactDAL.getFactionPacts(world._id);

    const existingPairs = new Set(
      existingPacts.map(
        (pact) => pact.factions.sort().join("-") // Convert to a sorted string for easy lookup
      )
    );

    let missingPairs = [];
    for (let i = 0; i < factions.length; i++) {
      for (let j = i + 1; j < factions.length; j++) {
        const pairKey = [factions[i]._id, factions[j]._id].sort().join("-");
        if (!existingPairs.has(pairKey)) {
          missingPairs.push([factions[i], factions[j]]);
        }
      }
    }

    return missingPairs;
  }

  /**
   * Generates and inserts all missing faction pacts for a given world.
   * @param {Object} world - The world object.
   * @returns {Promise<Object[]>} - Array of inserted faction pacts.
   */
  static async generateAndInsertFactionPacts(world) {
    console.log(`Checking missing faction pacts for world ${world.name}...`);

    const missingPairs = await FactionGenerator.findMissingFactionPacts(world);
    if (missingPairs.length === 0) {
      console.log("No missing faction pacts found.");
      return [];
    }

    let insertedPacts = [];
    for (let [factionA, factionB] of missingPairs) {
      let pact = await FactionGenerator.generateAndInsertFactionPact(
        world,
        factionA,
        factionB
      );
      insertedPacts.push(pact);
    }

    return insertedPacts;
  }

  /**
   * Generates and inserts a faction pact for two factions.
   * @param {Object} world - The world object containing the world description.
   * @param {Object} factionA - The first faction object.
   * @param {Object} factionB - The second faction object.
   * @returns {Promise<Object>} - The inserted faction pact.
   */
  static async generateAndInsertFactionPact(world, factionA, factionB) {
    console.log(
      `Generating a faction pact for ${factionA.name} and ${factionB.name} in world ${world.name}...`
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for faction relationships (pacts) in a medieval fantasy world.
                Your response **must be valid JSON and contain no extra text**.

                Each pact must include a **series of historical events** that outline a **progression of interactions** between the factions leading up to the **current date** (${world.currentYear}).

                Each pact should follow this structure:
                {
                  "name": "Pact Name",
                  "type": "alliance, war, trade, vassalage, rivalry, non-aggression",
                  "description": "A short but immersive description of the pact's purpose.",
                  "events": [
                    { "name": "Event Name", "description": "Event details", "realDate": "YYYY-MM-DD" }
                  ]
                }`,
        },
        {
          role: "user",
          content: `Generate a faction pact between **${factionA.name}** and **${factionB.name}** in the world **${world.name}**.
                
                ### World Context:
                ${world.description}

                ### Faction A:
                Name: ${factionA.name}
                Description: ${factionA.description}

                ### Faction B:
                Name: ${factionB.name}
                Description: ${factionB.description}

                The events should show a clear **progression of interactions** (wars, treaties, betrayals, negotiations) leading to their **current relationship**.`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.8,
    });

    let generatedPact = JSON.parse(completion.choices[0].message.content);

    let pactData = {
      _id: new mongoose.Types.ObjectId(),
      name: generatedPact.name,
      type: generatedPact.type,
      factions: [factionA._id, factionB._id].sort(),
      description: generatedPact.description,
      events: [], // Events will be inserted separately later
    };

    return await FactionPactDAL.insertFactionPact(world._id, pactData);
  }
}
