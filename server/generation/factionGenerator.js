const mongoose = require("mongoose");
const OpenAI = require("openai");
const FactionDAL = require("../dal/factionDAL");
const FactionPactDAL = require("../dal/factionPactDAL");
const EventDAL = require("../dal/eventDAL");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class FactionGenerator {
  /**
   * Generates factions for a given world.
   * @param {Object} world - The world object containing the world description.
   * @param {number} count - Number of factions to generate.
   * @returns {Promise<Object[]>} - Array of inserted factions.
   */
  static async generateFactions(world, count = 3) {
    console.log(`Generating ${count} factions for world ${world.name}...`);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for factions in a medieval fantasy world.
                    Your response **must be valid JSON and contain no extra text**.

                    Use the world description to create factions that fit into the setting.

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
          content: `Generate ${count} factions for the world **${world.name}**.

                    ### World Context:
                    ${world.description}`,
        },
      ],
      max_tokens: 700,
      temperature: 0.8,
    });

    let generatedFactions = JSON.parse(completion.choices[0].message.content);

    let insertedFactions = [];
    for (let faction of generatedFactions) {
      let insertedFaction = await FactionDAL.insertFaction(world._id, faction);
      insertedFactions.push(insertedFaction);
    }

    console.log(
      "Factions successfully generated. Now generating faction pacts..."
    );

    await FactionGenerator.generateFactionPacts(world, insertedFactions);

    return insertedFactions;
  }

  /**
   * Generates faction pacts for a given world by detecting missing relationships.
   * @param {Object} world - The world object.
   * @param {Object[]} factions - Array of generated factions.
   * @returns {Promise<void>}
   */
  static async generateFactionPacts(world, factions) {
    console.log(`Generating faction pacts for world ${world.name}...`);

    const existingPacts = await FactionPactDAL.getFactionPacts(world._id);

    const existingPairs = new Set(
      existingPacts.map((pact) => pact.factions.sort().join("-"))
    );

    for (let i = 0; i < factions.length; i++) {
      for (let j = i + 1; j < factions.length; j++) {
        const pairKey = [factions[i]._id, factions[j]._id].sort().join("-");
        if (!existingPairs.has(pairKey)) {
          await FactionGenerator.generateFactionPact(
            world,
            factions[i],
            factions[j]
          );
        }
      }
    }

    console.log("All missing faction pacts generated.");
  }

  /**
   * Generates a single faction pact between two factions.
   * @param {Object} world - The world object containing the world description.
   * @param {Object} factionA - The first faction object.
   * @param {Object} factionB - The second faction object.
   * @returns {Promise<Object>} - The inserted faction pact.
   */
  static async generateFactionPact(world, factionA, factionB) {
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

                    The events should outline a clear progression of interactions between these factions, starting from their **first recorded encounter** up to the **current date** (${new Date().toISOString().split("T")[0]}). 

                    Ensure that the **earliest events** establish how these factions first became aware of each other, whether through diplomacy, war, trade, or conflict. 

                    Subsequent events should reflect their **changing relationship over time**, including key moments such as betrayals, alliances, escalating conflicts, or significant treaties. 

                    The final event should be dated as close as possible to today's date and should establish the **current nature of their relationship** as reflected in the faction pact.`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.8,
    });

    let generatedPact = JSON.parse(completion.choices[0].message.content);

    let pactData = {
      name: generatedPact.name,
      type: generatedPact.type.split(" ")[0].toLowerCase(), //ensure enums are all lowercase and one word.
      factions: [factionA._id, factionB._id].sort(),
      description: generatedPact.description,
      events: [], // Events will be inserted separately later
    };

    // Insert each event and collect IDs
    for (const event of generatedPact.events) {
      try {
        const insertedEvent = await EventDAL.insertEvent(world._id, {
          name: event.name,
          description: event.description,
          realDate: event.realDate,
        });

        pactData.events.push(insertedEvent._id); // Store the inserted event's ID
      } catch (error) {
        console.error("Error inserting event:", error);
        console.error("Failed event data:", JSON.stringify(event, null, 2));
      }
    }

    // Now insert the faction pact with event references
    return await FactionPactDAL.insertFactionPact(world._id, pactData);
  }
}

module.exports = FactionGenerator;
