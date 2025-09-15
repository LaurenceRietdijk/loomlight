const fs = require('fs');
const path = require('path');

const DEFAULT_OUTPUT_DIR =
  process.env.IMAGE_OUTPUT_DIR || path.join(__dirname, '..', 'generated_images');

/**
 * Generates an image using the PixelLab API and saves it to disk.
 * Supports two call styles for convenience:
 *  - generateImage(prompt, 'filename.png')
 *  - generateImage(prompt, { filename, outputFilePath, referenceImagePath })
 * @param {string} prompt - Text prompt for the image.
 * @param {string|Object} [arg] - Filename string or options object.
 * @returns {Promise<string>} Path to the generated image file.
 */
async function generateImage(prompt, arg = undefined) {
  if (!prompt) {
    throw new Error('Prompt is required');
  }

  let filename;
  let outputFilePath;
  let referenceImagePath;

  if (typeof arg === 'string') {
    filename = arg;
  } else if (arg && typeof arg === 'object') {
    ({ filename, outputFilePath, referenceImagePath } = arg);
  }

  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) {
    throw new Error('PIXELLAB_API_KEY not configured');
  }

  const body = { prompt };
  if (referenceImagePath) {
    const refBuffer = await fs.promises.readFile(referenceImagePath);
    body.referenceImage = refBuffer.toString('base64');
  }

  const response = await fetch('https://api.pixellab.io/generate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Image generation failed: ${text}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filePath =
    outputFilePath ||
    path.join(DEFAULT_OUTPUT_DIR, filename || `image-${Date.now()}.png`);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, buffer);
  return filePath;
}

module.exports = { generateImage };
