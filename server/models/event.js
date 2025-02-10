const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Event name (e.g., "The Battle of Everflame")
  description: { type: String, required: true }, // Event lore description
  factions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Faction" }], // Factions involved (optional)
  locales: [{ type: mongoose.Schema.Types.ObjectId, ref: "Locale" }], // Locations involved (optional)
  characters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Character" }], // Key characters involved (optional)
  realDate: { type: String, required: true, default: Date.now }, // Stores "YYYY-MM-DD" directly
});

module.exports = eventSchema;
