const mongoose = require("mongoose");

const PlayerCharacterSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  { timestamps: true }
);

const PlayerCharacter = mongoose.model("PlayerCharacter", PlayerCharacterSchema);

module.exports = PlayerCharacter;

