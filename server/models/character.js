const mongoose = require("mongoose");

const CharacterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String, default: "" },
  description: { type: String, required: true },
  personality: { type: String, required: true },
  race: { type: String, required: true },
  age: { type: Number, default: null },
  gender: {
    type: String,
    enum: ["male", "female", "nonbinary", "unknown"],
    default: "unknown",
  },

  faction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Faction",
    default: null,
  },
  locale: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Locale",
    default: null,
  },
  building: { type: String, default: null }, // Name of the building in the locale
  role: { type: String, required: true },
  status: { type: String, default: "active" },
  relationships: [
    {
      _id: false,
      character_id: { type: mongoose.Schema.Types.ObjectId, ref: "Character" },
      connection: { type: String, required: true }, // "spouse", "child", etc.
      since: { type: Number }, // in years
      context: { type: String },
      shared_children: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Character" },
      ],
      notes: { type: String },
      type_strength: { type: String },
    },
  ],
});


module.exports = CharacterSchema;
