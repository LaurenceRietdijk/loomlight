const mongoose = require("mongoose");

const FactionSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  alignment: { type: String, required: true },
  locales: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Locale", default: [] },
  ],
  members: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Character" },
      role: { type: String, required: true },
      status: { type: String, default: "active" },
    },
  ],
  resources: {
    wealth: { type: String, required: true },
    military_strength: { type: String, required: true },
    political_influence: { type: String, required: true },
  },
  allies: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Faction" }],
    default: [],
  },
  enemies: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Faction" }],
    default: [],
  },
});

// Export both model and schema
const Faction = mongoose.model("Faction", FactionSchema);
module.exports = { Faction, schema: FactionSchema };
