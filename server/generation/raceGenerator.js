const mongoose = require("mongoose");
const OpenAI = require("openai");
const RaceDAL = require("../dal/raceDAL");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class RaceGenerator {
  /**
   * Generates races for a given world.
   * @param {Object} world - The world object containing the world description.
   * @param {number} count - Number of races to generate.
   * @returns {Promise<Object[]>} - Array of inserted races.
   */
  static async generateRaces(world, count = 3) {
    console.log(`Generating ${count} races for world ${world.name}...`);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for races in a fantasy world.
                    Your response **must be valid JSON and contain no extra text**.

                    Use the world description to create races that fit into the setting.

                    Avoid stereotypes and aim for fresh, imaginative designs that reflect the world's unique aspects. Use concise but descriptive explanations, maintaining a balance between clarity and depth.

                    All enum fields must use only the exact predefined values. Any deviation or variation is not allowed.

                    **Enum Restrictions:**
                    - **classification:** Must be one of \`"Sapient"\`, \`"Semi-Sapient"\`, or \`"Beast"\`.
                    - **diet:** Must be one of \`"Herbivore"\`, \`"Carnivore"\`, \`"Omnivore"\`, or \`"Other"\`.
                    - **societal_structure:** Must be one of \`"None"\`, \`"Tribal"\`, \`"Feudal"\`, \`"Democratic"\`, \`"Hive Mind"\`, or \`"Other"\`.

                    If a field does not match one of these exact values, the response is invalid.

                    Each race should follow this structure:
                    {
                      "name": "Race Name",
                      "classification": "Sapient, Semi-Sapient, Beast",
                      "origins": {
                        "first_appearance": "Location of origin",
                        "creation_myth": "Brief mythological or scientific origin",
                        "natural_habitat": ["Forest", "Desert", "Caverns"]
                      },
                      "physiology": {
                        "lifespan": Number,
                        "size_range": { "min": Number, "max": Number },
                        "diet": "Herbivore, Carnivore, Omnivore, Other",
                      },
                      "intelligence": {
                        "tool_usage": Boolean,
                        "societal_structure": "None, Tribal, Feudal, Democratic, Hive Mind"
                      }
                    }`,
        },
        {
          role: "user",
          content: `Generate ${count} races for the world **${world.name}**.
                    
                    ### World Context:
                    ${world.description}`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.8,
    });

    
    let generatedRaces;
    try {
      let rawResponse = completion.choices[0].message.content.trim();

      // Remove Markdown code block markers (e.g., ```json and ```)
      rawResponse = rawResponse.replace(/^```json\s*|```$/g, "");

      // Ensure the response is wrapped in an array if it isn't already
      if (!rawResponse.startsWith("[")) {
        rawResponse = `[${rawResponse}]`;
      }

      // Attempt to auto-fix common JSON issues
      rawResponse = rawResponse
        .replace(/,\s*([\]}])/g, "$1") // Remove trailing commas before closing brackets
        .replace(/}\s*{/g, "}, {") // Ensure objects are properly separated in arrays
        .replace(/]\s*\[/g, "],["); // Ensure nested arrays are properly formatted

      console.log("Cleaned JSON before parsing:", rawResponse); // Debugging

      generatedRaces = JSON.parse(rawResponse);
    } catch (error) {
        console.error("Failed to parse generated races:", error);
        console.error("Raw response:", completion.choices[0].message.content);
        throw new Error("Race generation failed due to invalid JSON format.");
    }

      
    let insertedRaces = [];
    for (let race of generatedRaces) {
      let insertedRace = await RaceDAL.insertRace(world._id.toString(), race);
      insertedRaces.push(insertedRace);
    }

    console.log("Races successfully generated.");
    return insertedRaces;
  }
}

module.exports = RaceGenerator;
