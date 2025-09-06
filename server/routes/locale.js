const express = require("express");
const router = express.Router();
const LocaleDAL = require("../dal/localeDAL");
const LocaleGenerator = require("../generation/localeGenerator");

/**
 * List all locales for a given world (minimal fields).
 */
router.get("/list", async (req, res) => {
  try {
    const { world_id } = req.query;
    if (!world_id) {
      return res.status(400).json({ error: "Missing world_id" });
    }
    const locales = await LocaleDAL.getAllLocales(world_id);
    return res.status(200).json({ locales });
  } catch (error) {
    console.error("Error listing locales:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

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
 * Fetch a locale with fully populated references.
 */
router.get("/full", async (req, res) => {
  try {
    const { world_id, x, y } = req.query;
    if (!world_id || x === undefined || y === undefined) {
      return res.status(400).json({ error: "Missing world_id or coordinates" });
    }
    const locale = await LocaleDAL.getLocaleFull(world_id, Number(x), Number(y));
    if (locale) {
      return res.status(200).json({ locale });
    }
    return res.status(404).json({ error: "Locale not found" });
  } catch (error) {
    console.error("Error fetching full locale:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Generate a new locale using AI and insert it via the DAL.
 */
router.post("/generate", async (req, res) => {
  try {
    const { world_id, x, y, locale_type, primary_race } = req.body;
    if (!world_id || x === undefined || y === undefined) {
      return res.status(400).json({ error: "Missing world_id or coordinates" });
    }

    // AI generation + database insertion
    const newLocale = await LocaleGenerator.generateAndInsertLocale(
      world_id,
      x,
      y,
      locale_type,
      primary_race || null
    );
    res.status(201).json({ message: "Locale generated", locale: newLocale });
  } catch (error) {
    console.error("Error generating locale:", error);
    res.status(500).json({ error: "Server Error" });
  }
});

module.exports = router;
