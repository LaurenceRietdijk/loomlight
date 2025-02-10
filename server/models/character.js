const mongoose = require("mongoose");

const CharacterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  title: { type: String, default: "" }, 
  description: { type: String, required: true },
  personality: { type: String, required: true },
  race: { type: String, required: true },
  age: { type: Number, default: null }, 
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
  role: { type: String, required: true },
  status: { type: String, default: "active" },
  relationships: [
    {
      character_id: { type: mongoose.Schema.Types.ObjectId, ref: "Character" }, 
      connection: { type: String, required: true }, // Example: "friend", "rival", "mentor"
    },
  ],
});


module.exports = CharacterSchema;
