const mongoose = require("mongoose");

const FactionSchema = new mongoose.Schema({
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
});


module.exports = FactionSchema;
