const mongoose = require("mongoose");
const OpenAI = require("openai");
const BuildingDAL = require("../dal/buildingDAL");

const openai = new OpenAI({ apiKey: process.env.API_KEY });

class BuildingGenerator {
  /**
   * Creates building documents for a locale from a list of building types and inserts them.
   * Uses a single GPT prompt to generate all buildings, including names, descriptions, rooms, and containers.
   * @param {string} world_id
   * @param {Object} localeDoc - object containing at least _id
   * @param {Array<string>} buildingTypes - e.g. ["Tavern", "Blacksmith", ...]
   * @returns {Promise<Array<Object>>} inserted building docs
   */
  static async generateBuildingsForLocale(world_id, localeDoc, buildingTypes, rosters = []) {
    const systemMsg = `You generate JSON for medieval fantasy buildings based on requested types, including their rooms and containers.

Return ONLY valid JSON with no extra text.

Output JSON shape (array; same length/order as requested types):
[
  {
    "name": "Canonical building name (invented)",
    "type": "Requested type or close category (e.g., Inn, Blacksmith, Temple, Market, Barracks, Generic)",
    "description": "1-3 sentences",
    "rooms": [
      {
        "name": "Room name",
        "description": "1-2 sentences",
        "containers": [
          { "name": "Container name", "type": "Chest/Barrel/Shelf/...", "description": "short" }
        ],
        "characters": [
          "<character_id string>"
        ]
      }
    ]
  }
 ]`;

    const paired = buildingTypes.map((t, idx) => ({ type: t, roster: rosters[idx] || [] }));
    const userMsg = `Locale context:\n{\n  "name": "${escapeStr(localeDoc.name)}",\n  "type": "${escapeStr(localeDoc.type)}",\n  "description": ${JSON.stringify(localeDoc.description || "")}\n}\n\nRequested buildings (types + roster) in order:\n${JSON.stringify(paired, null, 2)}\n\nTask:\n- For each requested type, invent an appropriate building for this locale with an evocative name and description.\n- Include 2-6 rooms; each room may include 0-3 containers.\n- Assign each rostered character to exactly one room that makes sense for their role or residency.\n- Represent assignments by listing the character_id strings inside the chosen room's "characters" array. Do not return a separate assignments object.`;

    let parsedArray = [];
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        temperature: 0.8,
        max_tokens: 2000,
      });

      const content = completion.choices?.[0]?.message?.content || "[]";
      parsedArray = JSON.parse(content);
      if (!Array.isArray(parsedArray)) throw new Error("Response is not an array");
    } catch (e) {
      console.error("Batched AI building generation failed:", e?.message || e);
      parsedArray = [];
    }

    // Normalize array length to match requested types
    const results = buildingTypes.map((type, idx) => {
      const parsed = parsedArray[idx];
      if (parsed && parsed.name) {
        return mapParsedBuildingToDoc(parsed, localeDoc, type);
      }
      return {
        _id: new mongoose.Types.ObjectId(),
        name: String(type),
        type: String(type),
        description: "",
        locale: localeDoc._id,
        rooms: [],
      };
    });

    await BuildingDAL.insertBuildings(world_id, results);
    return results;
  }
}

function mapParsedBuildingToDoc(parsed, locale, seedType) {
  const rooms = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
  const roomDocs = rooms.map((r) => ({
    _id: new mongoose.Types.ObjectId(),
    name: String(r?.name || "Room"),
    description: String(r?.description || ""),
    containers: Array.isArray(r?.containers)
      ? r.containers.map((c) => ({
          _id: new mongoose.Types.ObjectId(),
          name: String(c?.name || "Container"),
          type: String(c?.type || "Container"),
          description: String(c?.description || ""),
          items: [],
        }))
      : [],
    characters: [],
  }));

  // Fill characters from per-room arrays, and also support legacy `assignments` fallback
  const roomByName = new Map(roomDocs.map((rd) => [rd.name.toLowerCase(), rd]));
  rooms.forEach((r) => {
    const rd = roomByName.get(String(r?.name || "").toLowerCase());
    if (!rd) return;
    const chars = Array.isArray(r?.characters) ? r.characters : [];
    for (const entry of chars) {
      const charId = typeof entry === "string" ? entry : entry?.character_id;
      if (!charId) continue;
      try {
        rd.characters.push(new mongoose.Types.ObjectId(String(charId)));
      } catch {
        rd.characters.push(String(charId));
      }
    }
  });

  // Legacy fallback: Apply assignments if provided (by room name)
  const assignments = Array.isArray(parsed?.assignments) ? parsed.assignments : [];
  for (const a of assignments) {
    const roomName = String(a?.room || "").toLowerCase();
    const charId = a?.character_id;
    if (!charId) continue;
    const rd = roomByName.get(roomName);
    if (rd) {
      try {
        rd.characters.push(new mongoose.Types.ObjectId(String(charId)));
      } catch {
        rd.characters.push(String(charId));
      }
    }
  }

  return {
    _id: new mongoose.Types.ObjectId(),
    name: String(parsed?.name || seedType || "Building"),
    type: String(parsed?.type || String(seedType || "Generic")),
    description: String(parsed?.description || ""),
    locale: locale._id,
    rooms: roomDocs,
  };
}

function escapeStr(s) {
  return String(s || "").replace(/"/g, '\\"');
}

module.exports = BuildingGenerator;
