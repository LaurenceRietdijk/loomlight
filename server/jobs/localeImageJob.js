const fs = require('fs');
const path = require('path');
const pixelLabService = require('../services/pixelLabService');

// Placeholder for database lookup.
async function fetchNextLocaleWithoutImage() {
  // TODO: Implement DB logic to find the next biome and locale type lacking an image.
  return null;
}

/**
 * Generates an image for the next locale type missing from the biomes.
 * The image will be saved to web/images/locale/<biome_id>/<locale_type>.png
 * and uses a reference image to maintain proper dimensions.
 */
async function generateNextLocaleImage() {
  const next = await fetchNextLocaleWithoutImage();
  if (!next) {
    return null;
  }

  const { biome_id, biome_description, locale_type } = next;

  const prompt = `${biome_description} ${locale_type}. Create an isometric hex tile for a world map in a video game.`;

  let referenceImagePath =
    process.env.TILE_REFERENCE_IMAGE ||
    // __dirname = server/jobs -> up twice to project root, then web/images
    path.join(__dirname, '..', '..', 'web', 'images', 'reference.png');
  if (!fs.existsSync(referenceImagePath)) {
    referenceImagePath = undefined;
  }

  const outputFilePath = path.join(
    __dirname,
    '..',
    '..',
    'web',
    'images',
    'locale',
    String(biome_id),
    `${locale_type}.png`
  );

  await pixelLabService.generateImage(prompt, {
    referenceImagePath,
    outputFilePath,
  });

  return outputFilePath;
}

/**
 * Generates an image for a specific biome/locale tuple.
 * This helps testing while DB lookup is a stub.
 * @param {Object} params
 * @param {string|number} params.biome_id
 * @param {string} params.biome_description
 * @param {string} params.locale_type
 * @returns {Promise<string>} output file path
 */
async function generateLocaleImageFor({ biome_id, biome_description, locale_type }) {
  if (!biome_id || !biome_description || !locale_type) {
    throw new Error('biome_id, biome_description and locale_type are required');
  }

  const prompt = `${biome_description} ${locale_type}. Create an isometric hex tile for a world map in a video game.`;

  let referenceImagePath =
    process.env.TILE_REFERENCE_IMAGE ||
    path.join(__dirname, '..', '..', 'web', 'images', 'reference.png');
  if (!fs.existsSync(referenceImagePath)) {
    referenceImagePath = undefined;
  }

  const outputFilePath = path.join(
    __dirname,
    '..',
    '..',
    'web',
    'images',
    'locale',
    String(biome_id),
    `${locale_type}.png`
  );

  await pixelLabService.generateImage(prompt, {
    referenceImagePath,
    outputFilePath,
  });

  return outputFilePath;
}

module.exports = { generateNextLocaleImage, generateLocaleImageFor };
