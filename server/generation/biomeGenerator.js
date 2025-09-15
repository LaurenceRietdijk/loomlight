const gpt = require("../services/gptService");
const BiomeDAL = require("../dal/biomeDAL");
const LocaleSchema = require("../models/locale");

class BiomeGenerator {
  /**
   * Generate a single biome for a given world.
   * Uses GPT only for name and description; locales are programmatic.
   * @param {Object} world - The world object containing the world description.
   * @returns {Promise<Object>} - Inserted biome document.
   */
  static async generateBiome(world = null) {
    if (world && world.name) {
      console.log(`Generating 1 biome with context from world ${world.name}...`);
    } else {
      console.log("Generating 1 biome (no world context)...");
    }

    const worldDescription = world
      ? world.worldBuilding || world.description || "No description provided."
      : "";

    // Ask GPT only for name and description of a single biome
    const biomeInfo = await gpt.chatJSON(
      [
        {
          role: "system",
          content:
            "You generate a SINGLE land surface biome for a world map as compact JSON. Output ONLY a JSON object with exactly two string fields: name and description. No arrays, no extra fields, no prose. The biome must be a natural, terrestrial surface environment (e.g., forest, desert, grassland, tundra, mountains, wetlands, savanna, badlands). Strictly exclude underground, underwater/reef, cave/cavern, interior/dungeon, aerial/sky/atmospheric, extra-dimensional, or space biomes. Do not return man-made locations (e.g., cities, ruins).",
        },
        {
          role: "user",
          content: world
            ? `Create one land surface biome for the world "${world.name}" suitable for a world map. It must be natural and terrestrial (no underground, underwater, aerial/sky, interior/dungeon, extra-dimensional, or space biomes; no man-made locations). Return only {name, description}.\n\nWorld context:\n${worldDescription}`
            : `Create one land surface biome suitable for a world map. It must be natural and terrestrial (no underground, underwater, aerial/sky, interior/dungeon, extra-dimensional, or space biomes; no man-made locations). Return only {name, description}.` ,
        },
      ],
      { model: "gpt-3.5-turbo", max_tokens: 512, temperature: 0.8 }
    );

    if (!biomeInfo || typeof biomeInfo !== "object") {
      throw new Error("GPT did not return a biome object");
    }

    const name = (biomeInfo.name || "Unnamed Biome").toString();
    const description = (biomeInfo.description || "").toString();

    // Build locales map from enum types with all values false
    const localeTypes = LocaleSchema.path("type").enumValues;
    const locales = {};
    for (const t of localeTypes) locales[t] = false;

    const biomeData = { name, description, locales };
    const inserted = await BiomeDAL.insertBiome(biomeData);

    console.log("Biome successfully generated.");
    return inserted;
  }
}

module.exports = BiomeGenerator;
