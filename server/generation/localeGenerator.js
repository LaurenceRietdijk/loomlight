const mongoose = require("mongoose");
const OpenAI = require("openai");
const LocaleDAL = require("../dal/LocaleDAL");

const openai = new OpenAI({
  apiKey: process.env.API_KEY,
});

class LocaleGenerator {
  /**
   * Generates a new locale using OpenAI and inserts it via the DAL.
   * @param {string} world_id - The world database ID.
   * @param {number} x - The X coordinate.
   * @param {number} y - The Y coordinate.
   * @returns {Promise<Object>} - The newly inserted locale from the database.
   */
  static async generateAndInsertLocale(world_id, x, y) {
    console.log(
      `Generating new locale at (${x}, ${y}) for world ${world_id}...`
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an AI that generates JSON data for locales in a medieval fantasy world.
                    Your response **must be valid JSON and contain no extra text**.
                    
                    Each locale should follow this structure:
                    {
                      "name": "Locale Name",
                      "type": "Village, Town, City, Fortress, Ruins, Forest, Lake, Mountain, Plains",
                      "description": "A short but immersive description of the location.",
                      "special_features": ["A list of unique landmarks, events, or history tied to this place."]
                    }`,
        },
        {
          role: "user",
          content: `Generate a locale for the world "${world_id}" at coordinates (x: ${x}, y: ${y}).`,
        },
      ],
      max_tokens: 300,
      temperature: 0.8,
    });

    let generatedLocale = JSON.parse(completion.choices[0].message.content);

    // Prepare the locale data for insertion
    const localeData = {
      _id: new mongoose.Types.ObjectId(),
      name: generatedLocale.name,
      type: generatedLocale.type,
      description: generatedLocale.description,
      coordinates: { x, y },
      factions: [],
      characters: [],
      population: Math.floor(Math.random() * 1000),
      resources: {
        wealth: "unknown",
        military_presence: "unknown",
        political_importance: "unknown",
      },
      special_features: generatedLocale.special_features || [],
    };

    // Insert into database via the DAL
    return await LocaleDAL.insertLocale(world_id, localeData);
  }
}

module.exports = LocaleGenerator;
