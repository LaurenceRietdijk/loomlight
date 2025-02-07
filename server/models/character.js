const mongoose = require("mongoose");

const CharacterSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
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

const Character = mongoose.model("Character", CharacterSchema);
module.exports = { Character, schema: CharacterSchema };
