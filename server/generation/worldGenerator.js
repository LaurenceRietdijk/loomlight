const mongoose = require("mongoose");
const OpenAI = require("openai");
const WorldDAL = require("../dal/worldDAL");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class WorldGenerator {
  /**
   * Generates a new world using OpenAI and inserts it via the DAL.
   * @param {string} creator - The ID of the user creating the world.
   * @returns {Promise<Object>} - The newly inserted world from the database.
   */
  static async generateAndInsertWorld(creator) {
    console.log(`Generating a new fantasy world for creator ${creator}...`);

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for fantasy worlds.
                    Your response **must be valid JSON and contain no extra text**.
                    
                    Each world should follow this structure:
                    {
                      "name": "World Name",
                      "worldBuilding": "A detailed description of the world, its history, and unique characteristics."
                    }`,
        },
        {
          role: "user",
          content: `Generate a unique fantasy world with an immersive backstory.`,
        },
      ],
      max_tokens: 500,
      temperature: 0.8,
    });

    let generatedWorld = JSON.parse(completion.choices[0].message.content);

    // Prepare the world data for insertion
    const worldData = {
      _id: new mongoose.Types.ObjectId(),
      name: generatedWorld.name,
      worldBuilding: generatedWorld.worldBuilding,
      dateCreated: new Date().toLocaleDateString("en-GB"),
      timeStamp: new Date().toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      creator: creator,
    };

    // Insert into database via the DAL
    return await WorldDAL.insertWorld(worldData);
  }
}

module.exports = WorldGenerator;
