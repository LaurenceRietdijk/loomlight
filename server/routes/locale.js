const express = require("express");
const router = express.Router();
const LocaleDAL = require("../dal/localeDAL");
const LocaleGenerator = require("../generation/localeGenerator");
// Note: image job triggers are exposed via /admin, not /locale

/**
 * List all locales for a given world (minimal fields incl. biome id).
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
 * Fetch a locale by id with fully populated references.
 * Query: world_id, id
 */
router.get("/byId", async (req, res) => {
  try {
    const { world_id, id } = req.query || {};
    if (!world_id || !id) {
      return res.status(400).json({ error: "Missing world_id or id" });
    }
    const locale = await LocaleDAL.getLocaleFullById(world_id, id);
    if (!locale) return res.status(404).json({ error: "Locale not found" });
    return res.status(200).json({ locale });
  } catch (error) {
    console.error("Error fetching locale by id:", error);
    return res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Fetch many locales by ids and return a dictionary keyed by id with full docs.
 * Body: { world_id: string, ids: string[] }
 */
router.post("/byIds", async (req, res) => {
  try {
    const { world_id, ids } = req.body || {};
    if (!world_id || !Array.isArray(ids)) {
      return res.status(400).json({ error: "Missing world_id or ids[]" });
    }
    const localesById = await LocaleDAL.getLocalesFullByIds(world_id, ids);
    return res.status(200).json({ localesById });
  } catch (error) {
    console.error("Error fetching locales by ids:", error);
    return res.status(500).json({ error: "Server Error" });
  }
});

/**
 * Delete a locale by id and cascade-delete nested entities.
 * Query: world_id (required)
 * Path param: id (locale id)
 */
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params || {};
    const { world_id } = req.query || {};
    if (!world_id || !id) {
      return res.status(400).json({ error: "Missing world_id or id" });
    }
    const result = await LocaleDAL.deleteLocaleCascade(world_id, id);
    return res.status(200).json({ message: "Locale deleted", result });
  } catch (error) {
    console.error("Error deleting locale:", error);
    return res.status(500).json({ error: "Server Error" });
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

/**
 * TEMP: Trigger locale image job for testing.
 * POST /locale/imageJob/trigger
 * Body (optional):
 *  - biome_id: string | number
 *  - biome_description: string
 *  - locale_type: string
 * If the three fields above are provided, generates for that tuple.
 * Otherwise, triggers the "next" job (DB lookup stub may return none).
 */
module.exports = router;
