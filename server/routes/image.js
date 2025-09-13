const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();

// Default output directory on the server HDD
const OUTPUT_DIR =
  process.env.IMAGE_OUTPUT_DIR || path.join(__dirname, "..", "generated_images");

// Ensure the output directory exists
async function ensureOutputDir() {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
}

/**
 * POST /image
 * Body: { prompt: string, filename?: string }
 * Uses the PixelLab API to generate an image and saves it to OUTPUT_DIR.
 */
router.post("/", async (req, res) => {
  const { prompt, filename } = req.body || {};
  if (!prompt) {
    return res.status(400).json({ error: "Missing prompt" });
  }

  try {
    // Make sure the output directory exists
    await ensureOutputDir();

    const apiKey = process.env.PIXELLAB_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "PIXELLAB_API_KEY not configured" });
    }

    // Call the PixelLab image generation API.
    // NOTE: Replace the URL below with the actual PixelLab endpoint.
    const response = await fetch("https://api.pixellab.io/generate", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      const text = await response.text();
      return res
        .status(500)
        .json({ error: "Image generation failed", details: text });
    }

    // Write the returned image data to disk
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const name = filename || `image-${Date.now()}.png`;
    const filePath = path.join(OUTPUT_DIR, name);
    await fs.promises.writeFile(filePath, buffer);

    res.status(200).json({ message: "Image generated", path: filePath });
  } catch (error) {
    console.error("Error generating image:", error);
    res.status(500).json({ error: "Failed to generate image" });
  }
});

module.exports = router;
