const fs = require('fs');
const path = require('path');
const { request } = require('undici');

const DEFAULT_OUTPUT_DIR =
  process.env.IMAGE_OUTPUT_DIR || path.join(__dirname, '..', 'generated_images');

/**
 * Generates an image using the PixelLab API (undici client) and saves it to disk.
 * Supports two call styles for convenience:
 *  - generateImage(prompt, 'filename.png')
 *  - generateImage(prompt, { filename, outputFilePath, referenceImagePath })
 * The service now targets https://api.pixellab.ai/v1 with model endpoints:
 *  - /generate-image-pixflux (default)
 *  - /generate-image-bitforge
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

  const filePath =
    outputFilePath ||
    path.join(DEFAULT_OUTPUT_DIR, filename || `image-${Date.now()}.png`);

  if (!apiKey) {
    throw new Error('PIXELLAB_API_KEY not configured');
  }

  try {
    // Resolve size: read PNG dims from reference if available; otherwise from env; else default 128x128
    async function getPngDimensions(pngPath) {
      try {
        const fh = await fs.promises.open(pngPath, 'r');
        try {
          const header = Buffer.alloc(24);
          const { bytesRead } = await fh.read(header, 0, 24, 0);
          if (bytesRead < 24) return null;
          // Validate PNG signature 8 bytes
          const sig = header.subarray(0, 8).toString('hex');
          const pngSig = '89504e470d0a1a0a';
          if (sig !== pngSig) return null;
          const width = header.readUInt32BE(16);
          const height = header.readUInt32BE(20);
          return { width, height };
        } finally {
          await fh.close();
        }
      } catch (e) {
        return null;
      }
    }

    let width = Number(process.env.PIXELLAB_WIDTH || 0) || undefined;
    let height = Number(process.env.PIXELLAB_HEIGHT || 0) || undefined;
    if ((!width || !height) && referenceImagePath && fs.existsSync(referenceImagePath)) {
      const dims = await getPngDimensions(referenceImagePath);
      if (dims) {
        width = dims.width;
        height = dims.height;
      }
    }
    if (!width || !height) {
      width = 128;
      height = 128;
    }

    const baseUrl = (process.env.PIXELLAB_BASE_URL || 'https://api.pixellab.ai/v1').replace(/\/$/, '');
    const model = String(process.env.PIXELLAB_MODEL || 'pixflux').toLowerCase();
    const endpoint = model === 'bitforge' ? '/generate-image-bitforge' : '/generate-image-pixflux';

    const reqBody = {
      description: prompt,
      image_size: { width, height },
      no_background: String(process.env.PIXELLAB_NO_BACKGROUND || 'true').toLowerCase() === 'true',
    };

    if (model === 'bitforge') {
      const styleGuidance = Number(process.env.PIXELLAB_STYLE_GUIDANCE_SCALE || 0);
      const styleStrength = Number(process.env.PIXELLAB_STYLE_STRENGTH || 0);
      const textGuidance = Number(process.env.PIXELLAB_TEXT_GUIDANCE_SCALE || 0);
      if (!Number.isNaN(styleGuidance) && styleGuidance > 0) {
        reqBody.style_guidance_scale = styleGuidance;
      }
      if (!Number.isNaN(styleStrength) && styleStrength > 0) {
        reqBody.style_strength = styleStrength;
      }
      if (!Number.isNaN(textGuidance) && textGuidance > 0) {
        reqBody.text_guidance_scale = textGuidance;
      }
    }

    const { statusCode, body, headers } = await request(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(reqBody),
    });

    if (statusCode < 200 || statusCode >= 300) {
      const text = await body.text().catch(() => '<no-text>');
      const errorInfo = {
        stage: 'http_error',
        baseUrl,
        endpoint,
        status: statusCode,
        hasApiKey: Boolean(apiKey),
        referenceImageProvided: Boolean(referenceImagePath),
        promptLength: prompt.length,
        width,
        height,
        responseTextPreview: text?.slice?.(0, 500),
      };
      console.error('[pixelLabService] Image generation HTTP error', errorInfo);
      throw new Error(`Image generation failed with status ${statusCode}`);
    }

    // Decide how to persist depending on content-type
    const contentType = (headers?.['content-type'] || headers?.get?.('content-type') || '').toString();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    if (contentType.includes('application/json')) {
      const json = await body.json();

      // Helper to recursively search for a base64 string or URL in common fields
      function findImageInObject(obj, depth = 0) {
        if (!obj || typeof obj !== 'object' || depth > 5) return null;
        // Direct hits by conventional fields
        const directString = (
          (typeof obj.image === 'string' && obj.image) ||
          (typeof obj.image_base64 === 'string' && obj.image_base64) ||
          (typeof obj.base64 === 'string' && obj.base64) ||
          (typeof obj.b64 === 'string' && obj.b64) ||
          (typeof obj.b64_json === 'string' && obj.b64_json) ||
          (typeof obj.data === 'string' && obj.data) ||
          (typeof obj.content === 'string' && obj.content) ||
          (typeof obj.url === 'string' && obj.url) ||
          (typeof obj.image_url === 'string' && obj.image_url)
        );
        if (directString) {
          return directString;
        }
        // If image is an object, check nested common fields
        if (obj.image && typeof obj.image === 'object') {
          const nested = findImageInObject(obj.image, depth + 1);
          if (nested) return nested;
        }
        // Explore arrays with common names
        const arr = obj.images || obj.results || obj.data;
        if (Array.isArray(arr) && arr.length) {
          for (const item of arr) {
            const nested = findImageInObject(item, depth + 1);
            if (nested) return nested;
          }
        }
        // Fallback: iterate all keys (shallow)
        for (const key of Object.keys(obj)) {
          const val = obj[key];
          if (typeof val === 'string' && val.length > 32) {
            return val;
          }
          if (val && typeof val === 'object') {
            const nested = findImageInObject(val, depth + 1);
            if (nested) return nested;
          }
        }
        return null;
      }

      const candidate = findImageInObject(json);
      if (typeof candidate === 'string') {
        // data URL variant
        const dataUrlMatch = candidate.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
        if (dataUrlMatch) {
          const buffer = Buffer.from(dataUrlMatch[2], 'base64');
          await fs.promises.writeFile(filePath, buffer);
          return filePath;
        }
        // URL variant
        if (/^https?:\/\//i.test(candidate)) {
          const { statusCode: s2, body: b2 } = await request(candidate, { method: 'GET' });
          if (s2 >= 200 && s2 < 300) {
            const buf = Buffer.from(await b2.arrayBuffer());
            await fs.promises.writeFile(filePath, buf);
            return filePath;
          }
          throw new Error(`Image URL fetch failed with status ${s2}`);
        }
        // Assume base64 string
        try {
          const buffer = Buffer.from(candidate, 'base64');
          await fs.promises.writeFile(filePath, buffer);
          return filePath;
        } catch (e) {
          console.error('[pixelLabService] Failed to decode base64 candidate', { length: candidate.length });
        }
      }

      console.error('[pixelLabService] JSON response missing usable image field', {
        topLevelKeys: Object.keys(json || {}),
        preview: JSON.stringify(json).slice(0, 500),
      });
      throw new Error('Image generation returned JSON without image data');
    } else {
      // Assume binary image stream
      const buffer = Buffer.from(await body.arrayBuffer());
      await fs.promises.writeFile(filePath, buffer);
      return filePath;
    }
  } catch (err) {
    const baseUrl = (process.env.PIXELLAB_BASE_URL || 'https://api.pixellab.ai/v1').replace(/\/$/, '');
    const errorInfo = {
      stage: 'network_or_processing_error',
      baseUrl,
      hasApiKey: Boolean(apiKey),
      referenceImageProvided: Boolean(referenceImagePath),
      promptLength: prompt.length,
      errorName: err?.name,
      errorCode: err?.code || err?.errno,
      errorMessage: err?.message,
      causeCode: err?.cause?.code,
      causeMessage: err?.cause?.message,
    };
    console.error('[pixelLabService] Image generation error', errorInfo);
    throw err;
  }
}

module.exports = { generateImage };
