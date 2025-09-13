const OpenAI = require("openai");
const BiomeDAL = require("../dal/biomeDAL");
const LocaleSchema = require("../models/locale");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class BiomeGenerator {
  /**
   * Generates biomes for a given world.
   * @param {Object} world - The world object containing the world description.
   * @param {number} count - Number of biomes to generate.
   * @returns {Promise<Object[]>} - Array of inserted biomes.
   */
  static async generateBiomes(world, count = 3) {
    console.log(`Generating ${count} biomes for world ${world.name}...`);

    const worldDescription =
      world.worldBuilding || world.description || "No description provided.";

    const localeTypes = LocaleSchema.path("type").enumValues.join(", ");

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for biomes in a fantasy world.
Your response **must be valid JSON and contain no extra text**.

All keys under "locales" must be one of: ${localeTypes}.

Each biome should follow this structure:
{
  "name": "Biome Name",
  "description": "Biome description",
  "locales": {"Town": true}
}`,
        },
        {
          role: "user",
          content: `Generate ${count} biomes for the world **${world.name}**.\n\n### World Context:\n${worldDescription}`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.8,
    });

    let generatedBiomes;
    try {
      let rawResponse = completion.choices[0].message.content.trim();
      rawResponse = rawResponse.replace(/^```json\s*|```$/g, "");
      if (!rawResponse.startsWith("[")) {
        rawResponse = `[${rawResponse}]`;
      }
      rawResponse = rawResponse
        .replace(/,\s*([\]}])/g, "$1")
        .replace(/}\s*{/g, "}, {")
        .replace(/]\s*\[/g, "],[");
      console.log("Cleaned JSON before parsing:", rawResponse);
      generatedBiomes = JSON.parse(rawResponse);
    } catch (error) {
      console.error("Failed to parse generated biomes:", error);
      console.error("Raw response:", completion.choices[0].message.content);
      throw new Error("Biome generation failed due to invalid JSON format.");
    }

    let insertedBiomes = [];
    for (let biome of generatedBiomes) {
      let insertedBiome = await BiomeDAL.insertBiome(world._id.toString(), biome);
      insertedBiomes.push(insertedBiome);
    }

    console.log("Biomes successfully generated.");
    return insertedBiomes;
  }
}

module.exports = BiomeGenerator;
