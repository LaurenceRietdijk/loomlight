const mongoose = require("mongoose");

const LocaleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["Camp", "Hamlet", "Village", "Wilderness", "Cave", "Dungeon"],
    default: "Camp",
  },
  description: { type: String, required: true },
  coordinates: {
    x: { type: Number, required: true }, // X coordinate (integer)
    y: { type: Number, required: true }, // Y coordinate (integer)
  },
  factions: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Faction" },
      relevance: { type: String, default: "set up camp" },
    },
  ],
  characters: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Character" },
      role: { type: String, default: "just a local resident" },
    },
  ],
  population: { type: Number, default: 0 },
  resources: {
    wealth: { type: String, default: "unknown" },
    military_presence: { type: String, default: "unknown" },
    political_importance: { type: String, default: "unknown" },
  },
  special_features: { type: [String], default: [] }, // Unique landmarks, historical sites, etc.
});


module.exports = LocaleSchema;
