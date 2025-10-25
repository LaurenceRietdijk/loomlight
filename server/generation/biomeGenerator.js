const gpt = require("../services/gptService");
const BiomeDAL = require("../dal/biomeDAL");
const LocaleSchema = require("../models/locale");
const TerrainDAL = require("../dal/terrainDAL");
const TerrainGenerator = require("./terrainGenerator");

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
    const biomeInfo = await gpt.chatJSONPrompt(
      "You generate a SINGLE land surface biome for a world map as compact JSON. Output ONLY a JSON object with exactly two string fields: name and description. No arrays, no extra fields, no prose. The biome must be a natural, terrestrial surface environment (e.g., forest, desert, grassland, tundra, mountains, wetlands, savanna, badlands). Strictly exclude underground, underwater/reef, cave/cavern, interior/dungeon, aerial/sky/atmospheric, extra-dimensional, or space biomes. Do not return man-made locations (e.g., cities, ruins).",
      world
            ? `Create one land surface biome for the world "${world.name}" suitable for a world map. It must be natural and terrestrial (no underground, underwater, aerial/sky, interior/dungeon, extra-dimensional, or space biomes; no man-made locations). Return only {name, description}.\n\nWorld context:\n${worldDescription}`
            : `Create one land surface biome suitable for a world map. It must be natural and terrestrial (no underground, underwater, aerial/sky, interior/dungeon, extra-dimensional, or space biomes; no man-made locations). Return only {name, description}.` ,
      { max_tokens: 512, temperature: 0.8 }
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

    // Select terrains appropriate for this biome using GPT, then resolve to IDs with weights
    const weightedTerrains = await BiomeGenerator._selectTerrainsForBiome(world, name, description);

    const biomeData = { name, description, locales, terrains: weightedTerrains };
    const inserted = await BiomeDAL.insertBiome(biomeData);

    console.log("Biome successfully generated.");
    return inserted;
  }

  /**
   * Uses GPT to select a handful of terrain names for the biome from the existing terrain catalog,
   * allowing proposals for new terrain names. Returns the corresponding terrain ObjectIds, creating
   * new terrains via the TerrainGenerator when necessary.
   * @param {Object|null} world
   * @param {string} biomeName
   * @param {string} biomeDescription
   * @returns {Promise<Array<{terrain: string, weight: number}>>} Weighted terrain refs
  */
  static async _selectTerrainsForBiome(world, biomeName, biomeDescription) {
    // Fetch catalog of known terrains
    const terrains = await TerrainDAL.getTerrains();
    const byName = new Map();
    const catalog = [];
    for (const t of terrains) {
      const n = String(t.name || '').trim();
      const d = String(t.description || '').trim();
      if (!n) continue;
      const key = n.toLowerCase();
      if (!byName.has(key)) byName.set(key, t);
      catalog.push({ name: n, description: d });
    }

    // Ask GPT for exactly 3 weighted terrain suggestions
    const system = "You are a worldbuilding assistant. Given a biome and a catalog of available terrain types (name + description), select EXACTLY 3 terrain entries that best fit. Prefer exact names from the catalog, but you may propose new names if necessary. Return ONLY JSON: an array of exactly 3 objects of the form {\"name\": string, \"weight\": number}. The \"weight\" is a positive real number indicating relative coverage. Do not attempt to make weights sum to 100; any positive values are allowed. No extra fields or prose.";
    const user = [
      `Biome: ${biomeName}\nDescription: ${biomeDescription}`,
      `Catalog (JSON):\n${JSON.stringify(catalog, null, 2)}`,
    ].join('\n\n');

    let picked = [];
    try {
      const arr = await gpt.chatJSONPrompt(system, user, { max_tokens: 512, temperature: 0.4 });
      if (Array.isArray(arr)) picked = arr;
    } catch (err) {
      console.warn('[BiomeGenerator] Weighted terrain selection via GPT failed, falling back to empty list.', err?.message || err);
    }

    // Normalize and dedupe by name
    const norm = (s) => String(s || '').trim();
    const seen = new Set();
    const unique = [];
    for (const raw of picked) {
      const val = norm(raw?.name ?? raw);
      if (!val) continue;
      const key = val.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const weight = Number.isFinite(raw?.weight) && raw.weight > 0 ? Number(raw.weight) : 1;
      unique.push({ name: val, weight });
    }
    // Cap to exactly 3 requested names
    if (unique.length > 3) unique.length = 3;

    const resolved = [];
    for (const item of unique) {
      const key = item.name.toLowerCase();
      let doc = byName.get(key);
      if (!doc) {
        // Create the missing terrain, preferring the exact requested name
        try {
          doc = await TerrainGenerator.generateTerrain(world, { preferredName: item.name });
          if (doc && doc.name) {
            byName.set(String(doc.name).toLowerCase(), doc);
          }
        } catch (e) {
          console.warn('[BiomeGenerator] Failed to create requested terrain', item.name, e?.message || e);
        }
      }
      if (doc && doc._id) {
        resolved.push({ terrain: String(doc._id), weight: item.weight });
      }
    }

    // If fewer than 3 resolved, top up using other catalog terrains or generate new ones
    const already = new Set(resolved.map((x) => String(x.terrain)));
    if (resolved.length < 3) {
      // First, pick additional existing terrains not already chosen
      for (const t of terrains) {
        if (resolved.length >= 3) break;
        const id = t && t._id ? String(t._id) : '';
        if (!id || already.has(id)) continue;
        resolved.push({ terrain: id, weight: 1 });
        already.add(id);
      }
    }
    if (resolved.length < 3) {
      // Finally, generate new terrains to reach exactly 3
      while (resolved.length < 3) {
        try {
          const doc = await TerrainGenerator.generateTerrain(world);
          const id = doc && doc._id ? String(doc._id) : '';
          if (id && !already.has(id)) {
            resolved.push({ terrain: id, weight: 1 });
            already.add(id);
          } else {
            break; // avoid infinite loop if insertion fails to produce id
          }
        } catch (_) {
          break;
        }
      }
    }

    return resolved;
  }
}

module.exports = BiomeGenerator;
