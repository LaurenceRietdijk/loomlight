const fs = require('fs');
const path = require('path');

const OUTPUT_DIR =
  process.env.IMAGE_OUTPUT_DIR || path.join(__dirname, '..', 'generated_images');

async function ensureOutputDir() {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

/**
 * Generates an image using the PixelLab API and saves it to disk.
 * @param {string} prompt - Text prompt for the image.
 * @param {string} [filename] - Optional name for the saved image file.
 * @returns {Promise<string>} Path to the generated image file.
 */
async function generateImage(prompt, filename) {
  if (!prompt) {
    throw new Error('Prompt is required');
  }

  await ensureOutputDir();

  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    throw new Error('PIXELLAB_API_KEY not configured');
  }

  const response = await fetch('https://api.pixellab.io/generate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image generation failed: ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const name = filename || `image-${Date.now()}.png`;
  const filePath = path.join(OUTPUT_DIR, name);
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

module.exports = { generateImage };
