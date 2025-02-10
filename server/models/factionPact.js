const mongoose = require("mongoose");

const factionPactSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true }, // Pact name (e.g., "The Iron Alliance")
  type: {
    type: String,
    required: true,
    enum: [
      "alliance",
      "war",
      "trade",
      "vassalage",
      "rivalry",
      "non-aggression",
    ],
  }, // Relationship type
  factions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faction",
      required: true,
      validate: [
        (val) => val.length === 2,
        "A faction pact must include exactly two factions.",
      ],
    },
  ], // Enforces exactly two factions
  description: { type: String, required: true }, // Lore behind the pact
  events: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }], // References events that influenced this pact
});

// Ensure only one unique relationship exists between any two factions
factionPactSchema.pre("save", function (next) {
  this.factions.sort(); // Sort faction IDs in ascending order
  next();
});

factionPactSchema.index({ "factions.0": 1, "factions.1": 1 }, { unique: true });

const FactionPact = mongoose.model("FactionPact", factionPactSchema);
module.exports = { FactionPact, schema: factionPactSchema };
