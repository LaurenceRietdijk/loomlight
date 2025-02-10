const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true }, // Event name (e.g., "The Battle of Everflame")
  description: { type: String, required: true }, // Event lore description
  factions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Faction" }], // Factions involved (optional)
  locales: [{ type: mongoose.Schema.Types.ObjectId, ref: "Locale" }], // Locations involved (optional)
  characters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Character" }], // Key characters involved (optional)
  realDate: { type: Date, required: true, default: Date.now }, // Uses real-world system time
});

const Event = mongoose.model("Event", eventSchema);
module.exports = { Event, schema: eventSchema };
