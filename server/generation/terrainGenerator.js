const gpt = require("../services/gptService");
const TerrainDAL = require("../dal/terrainDAL");

class TerrainGenerator {
  /**
   * Generate a single terrain definition, optionally scoped by world context.
   * Texture generation is deferred to the PixelLab tileset scheduler.
   * @param {Object|null} world
   * @returns {Promise<Object>}
   */
  static async generateTerrain(world = null, options = {}) {
    if (world && world.name) {
      console.log(`Generating 1 terrain with context from world ${world.name}...`);
    } else {
      console.log("Generating 1 terrain (no world context)...");
    }

    const worldDescription = world
      ? world.worldBuilding || world.description || "No description provided."
      : "";

    const preferredName = options && typeof options === 'object' ? String(options.preferredName || '').trim() : '';

    const system = preferredName
      ? "You generate a SINGLE outdoor terrain type as compact JSON. Output ONLY a JSON object with exactly two string fields: name and description. The 'name' MUST be exactly the provided preferredName. No arrays, no extra fields, no prose. The terrain should represent a distinct landform or ground condition suited for a world map (e.g., rocky ridge, sand dunes, frozen flats). Avoid underwater, underground, interior, aerial/sky, extra-dimensional, or space terrains. Do not return man-made constructions."
      : "You generate a SINGLE outdoor terrain type as compact JSON. Output ONLY a JSON object with exactly two string fields: name and description. No arrays, no extra fields, no prose. The terrain should represent a distinct landform or ground condition suited for a world map (e.g., rocky ridge, sand dunes, frozen flats). Avoid underwater, underground, interior, aerial/sky, extra-dimensional, or space terrains. Do not return man-made constructions.";

    const user = preferredName
      ? (world
          ? `Create one natural terrain for the world "${world.name}" suited for a world map. It must be outdoors and naturally occurring (no underwater, underground, interior, aerial/sky, extra-dimensional, or space terrains; no man-made locations). Return only {name, description}.\n\nThe terrain name MUST be exactly: ${preferredName}\n\nWorld context:\n${worldDescription}`
          : `Create one natural terrain suited for a world map. It must be outdoors and naturally occurring (no underwater, underground, interior, aerial/sky, extra-dimensional, or space terrains; no man-made locations). Return only {name, description}.\n\nThe terrain name MUST be exactly: ${preferredName}`)
      : (world
          ? `Create one natural terrain for the world "${world.name}" suited for a world map. It must be outdoors and naturally occurring (no underwater, underground, interior, aerial/sky, extra-dimensional, or space terrains; no man-made locations). Return only {name, description}.\n\nWorld context:\n${worldDescription}`
          : `Create one natural terrain suited for a world map. It must be outdoors and naturally occurring (no underwater, underground, interior, aerial/sky, extra-dimensional, or space terrains; no man-made locations). Return only {name, description}.`);

    const terrainInfo = await gpt.chatJSONPrompt(system, user, { max_tokens: 512, temperature: 0.8 });

    if (!terrainInfo || typeof terrainInfo !== "object") {
      throw new Error("GPT did not return a terrain object");
    }

    const name = (terrainInfo.name || (preferredName || "Unnamed Terrain")).toString();
    const description = (terrainInfo.description || "").toString();

    const terrainData = { name, description, neighbours: {} };
    const inserted = await TerrainDAL.insertTerrain(terrainData);

    console.log("Terrain successfully generated (texture pending scheduler).");
    return inserted;
  }
}

module.exports = TerrainGenerator;
