const fs = require('fs');
const path = require('path');
const pixelLabService = require('../services/pixelLabService');

// Placeholder for database lookup.
async function fetchNextLocaleWithoutImage() {
  // Determine the next (biome, locale_type) that is still marked as not generated in DB.
  // Uses the Biome collection (central DB) and the Locale type enum to drive iteration.
  const BiomeDAL = require('../dal/biomeDAL');
  const LocaleSchema = require('../models/locale');

  // Order locale types deterministically
  const localeTypes = (LocaleSchema.path('type')?.enumValues || []).slice();
  if (!localeTypes.length) return null;

  // Fetch biomes (global across worlds) and iterate deterministically by _id
  const biomes = await BiomeDAL.getBiomes();
  if (!biomes || !biomes.length) return null;

  const sorted = [...biomes].sort((a, b) => String(a._id).localeCompare(String(b._id)));

  for (const biome of sorted) {
    const biomeId = String(biome._id);
    const biomeDesc = String(biome.description || biome.name || '');

    // Support both Map and plain-object shapes for locales
    const localesField = biome.locales;
    const isMap = localesField && typeof localesField.get === 'function';

    for (const locale_type of localeTypes) {
      const flag = isMap ? localesField.get(locale_type) : localesField?.[locale_type];
      const isDone = Boolean(flag);
      if (!isDone) {
        return { biome_id: biomeId, biome_description: biomeDesc, locale_type };
      }
    }
  }

  return null;
}

/**
 * Generates an image for the next locale type missing from the biomes.
 * The image will be saved to web/images/locale/<biome_id>/<biome_id>_<locale_type>.png.
 */
async function generateNextLocaleImage() {
  const next = await fetchNextLocaleWithoutImage();
  if (!next) {
    return null;
  }

  const { biome_id, biome_description, locale_type } = next;

  const prompt = `An isometric square slab map tile for a world map, perfectly geometric with sharp pixel-art edges.  
The tile shows a flat surface viewed in isometric projection, with clear 2:1 pixel ratio perspective.  
Biome: ["${biome_description}"].  
Content: ["${locale_type}"].
Edges: [render as material, e.g. “brown soil with small stone flecks”]  

The tile must remain a clean isometric square so it can align seamlessly with other tiles.  
Keep edges sharp and consistent.  
Allow small decorative elements (trees, rocks, buildings) to extend slightly above the top edge of the tile, overlapping the tile behind, but keep the left, right, and bottom edges within the square for perfect tiling.  

Style: clean pixel art, limited palette, crisp outlines, with lighting from the top-left.  
Do not use gradients or blurry textures.`;

  // Keep directory path the same, but include biome_id in the filename
  const outputFilePath = path.join(
    __dirname,
    '..',
    '..',
    'web',
    'images',
    'locale',
    String(biome_id),
    `${biome_id}_${locale_type}.png`
  );

  await pixelLabService.generateImage(prompt, { outputFilePath });

  // Mark as generated in DB only after successful write
  const BiomeDAL = require('../dal/biomeDAL');
  try {
    await BiomeDAL.setLocaleFlag(biome_id, locale_type, true);
  } catch (e) {
    // Best-effort update; log and proceed
    console.error('[localeImageJob] Failed to set locale flag in DB:', e);
  }

  return outputFilePath;
}

module.exports = { generateNextLocaleImage };
