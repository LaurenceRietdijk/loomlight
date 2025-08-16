const express = require("express");
const router = express.Router();
const LocaleDAL = require("../dal/localeDAL");
const LocaleGenerator = require("../generation/localeGenerator");

/**
 * Fetch an existing locale from the database (no AI generation).
 */
router.get("/", async (req, res) => {
  try {
    const { world_id, x, y } = req.query;
    if (!world_id || x === undefined || y === undefined) {
      return res.status(400).json({ error: "Missing world_id or coordinates" });
    }

    const locale = await LocaleDAL.getLocale(world_id, x, y);
    if (locale) {
      return res.status(200).json({ message: "Locale found", locale });
    } else {
      return res.status(404).json({ error: "Locale not found" });
    }
  } catch (error) {
    console.error("Error fetching locale:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Generate a new locale using AI and insert it via the DAL.
 */
router.post("/generate", async (req, res) => {
  try {
    const { world_id, x, y, locale_type } = req.body;
    if (!world_id || x === undefined || y === undefined) {
      return res.status(400).json({ error: "Missing world_id or coordinates" });
    }

    // AI generation + database insertion
    const newLocale = await LocaleGenerator.generateAndInsertLocale(
      world_id,
      x,
      y,
      locale_type
    );
    res.status(201).json({ message: "Locale generated", locale: newLocale });
  } catch (error) {
    console.error("Error generating locale:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
