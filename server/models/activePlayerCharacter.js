const mongoose = require("mongoose");

// Per-world document representing the player's presence in that world.
// _id matches the global PlayerCharacter _id. Stores quest ids accepted in this world.
const ActivePlayerCharacterSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true },
    quests: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Quest" }], default: [] },
  },
  { timestamps: true, _id: false }
);

module.exports = ActivePlayerCharacterSchema;
