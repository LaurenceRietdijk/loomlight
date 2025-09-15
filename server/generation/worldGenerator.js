const mongoose = require("mongoose");
const gpt = require("../services/gptService");
const WorldDAL = require("../dal/worldDAL");

class WorldGenerator {
  /**
   * Generates a new world using OpenAI and inserts it via the DAL.
   * @param {string} creator - The ID of the user creating the world.
   * @returns {Promise<Object>} - The newly inserted world from the database.
   */
  static async generateWorld(creator) {
    console.log(`Generating a new fantasy world for creator ${creator}...`);

    const generatedWorld = await gpt.chatJSON(
      [
        {
          role: "system",
          content:
            "You are an AI that generates JSON data for fantasy worlds.\n" +
            "Your response must be valid JSON and contain no extra text.\n\n" +
            "Each world should follow this structure:\n{\n  \"name\": \"World Name\",\n  \"worldBuilding\": \"A detailed description of the world, its history, and unique characteristics.\"\n}",
        },
        {
          role: "user",
          content: "Generate a unique fantasy world with an immersive backstory.",
        },
      ],
      { model: "gpt-3.5-turbo", max_tokens: 500, temperature: 0.8 }
    );

    // Insert into database via the DAL
    return await WorldDAL.insertWorld(
      creator,
      generatedWorld.name,
      generatedWorld.worldBuilding
    );
  }
}

module.exports = WorldGenerator;
