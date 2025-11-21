const VegetationDAL = require('../dal/vegetationDAL');
const pixelLabService = require('../services/pixelLabService');

/**
 * Vegetation image job generates PixelLab images for vegetation entries that don't yet have textures.
 * Selection strategy: Pick the first vegetation without a valid texture.
 */

function hasValidTexture(vegetation) {
  if (!vegetation || !vegetation.texture) {
    return false;
  }
  const imagePath = vegetation.texture.imagePath || '';
  return imagePath.trim().length > 0;
}

async function fetchNextVegetationImageTarget() {
  const vegetations = await VegetationDAL.getVegetations();
  
  if (!Array.isArray(vegetations) || vegetations.length === 0) {
    return null;
  }

  // Find first vegetation without a valid texture
  for (const vegetation of vegetations) {
    if (!hasValidTexture(vegetation)) {
      return {
        vegetation,
        vegetationId: vegetation._id ? vegetation._id.toString() : '',
        vegetationName: vegetation.name || 'Unnamed Vegetation',
        vegetationType: vegetation.type || 'grass',
      };
    }
  }

  return null;
}

async function generateVegetationImage(vegetation, options = {}) {
  if (!vegetation) {
    throw new Error('Vegetation document is required for image generation.');
  }

  const vegetationId = vegetation._id ? vegetation._id.toString() : '';
  const vegetationName = vegetation.name || 'Unnamed Vegetation';
  const vegetationType = vegetation.type || 'grass';

  console.log(`[VegetationImageJob] Generating image for vegetation: ${vegetationName} (${vegetationType})`);

  // Build prompt for vegetation image
  const description = vegetation.description || '';
  const prompt = `A top-down pixel art sprite of ${vegetationName}, a ${vegetationType}. ${description}. 32x32 pixels, single sprite, transparent background, detailed pixel art style suitable for an isometric tile map.`;

  const imageOptions = {
    size: '32x32',
    style: 'pixel-art',
    ...options,
  };

  // Generate image using PixelLab service
  const imageResult = await pixelLabService.generateImage(prompt, imageOptions);

  if (!imageResult || !imageResult.imagePath) {
    throw new Error('PixelLab service did not return a valid image path');
  }

  // Update vegetation with texture data
  const textureData = {
    imagePath: imageResult.imagePath,
    prompt: prompt,
    revisedPrompt: imageResult.revisedPrompt || prompt,
  };

  await VegetationDAL.updateTexture(vegetationId, textureData);

  console.log(`[VegetationImageJob] Successfully generated image for vegetation: ${vegetationName}`);

  return {
    vegetation: await VegetationDAL.getVegetationById(vegetationId),
    target: {
      vegetationId,
      vegetationName,
      vegetationType,
    },
    imageResult,
  };
}

async function generateNextVegetationImage(options = {}) {
  const target = await fetchNextVegetationImageTarget();
  if (!target) {
    return null;
  }

  const { vegetation } = target;
  return await generateVegetationImage(vegetation, options);
}

module.exports = {
  fetchNextVegetationImageTarget,
  generateNextVegetationImage,
  generateVegetationImage,
};
