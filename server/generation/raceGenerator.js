const gpt = require("../services/gptService");
const RaceDAL = require("../dal/raceDAL");

class RaceGenerator {
  /**
   * Generates races for a given world.
   * @param {Object} world - The world object containing the world description.
   * @param {number} count - Number of races to generate.
   * @returns {Promise<Object[]>} - Array of inserted races.
   */
  static async generateRaces(world, count = 3) {
    console.log(`Generating ${count} races for world ${world.name}...`);

    const worldDescription =
      world.worldBuilding || world.description || "No description provided.";

    const generatedRaces = await gpt.chatJSONPrompt(
      "You are an AI that generates JSON data for races in a fantasy world.\n" +
            "Your response must be valid JSON and contain no extra text.\n\n" +
            "Use the world description to create races that fit into the setting.\n\n" +
            "Avoid stereotypes and aim for fresh, imaginative designs that reflect the world's unique aspects. Use concise but descriptive explanations.\n\n" +
            "All enum fields must use only the exact predefined values. Any deviation is not allowed.\n\n" +
            "Enum Restrictions:\n- classification: \"Sapient\", \"Semi-Sapient\", or \"Beast\".\n- diet: \"Herbivore\", \"Carnivore\", \"Omnivore\", or \"Other\".\n- societal_structure: \"None\", \"Tribal\", \"Feudal\", \"Democratic\", \"Hive Mind\", or \"Other\".\n\n" +
            "Each race should follow this structure:\n{\n  \"name\": \"Race Name\",\n  \"classification\": \"Sapient, Semi-Sapient, Beast\",\n  \"origins\": {\n    \"first_appearance\": \"Location of origin\",\n    \"creation_myth\": \"Brief mythological or scientific origin\",\n    \"natural_habitat\": [\"Forest\", \"Desert\", \"Caverns\"]\n  },\n  \"physiology\": {\n    \"lifespan\": Number,\n    \"size_range\": { \"min\": Number, \"max\": Number },\n    \"diet\": \"Herbivore, Carnivore, Omnivore, Other\"\n  },\n  \"intelligence\": {\n    \"tool_usage\": Boolean,\n    \"societal_structure\": \"None, Tribal, Feudal, Democratic, Hive Mind\"\n  }\n}",
      `Generate ${count} races for the world **${world.name}**.\n\n### World Context:\n${worldDescription}`,
      { max_tokens: 4096, temperature: 0.8 }
    );


      
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
