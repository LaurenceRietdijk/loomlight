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
  location: {
    locale: { type: mongoose.Schema.Types.ObjectId, ref: "Locale", default: null },
    building: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
    room: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  home: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
  work: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
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
  
  // Quests assigned to this character (references to Quest documents)
  quests: [
    { type: mongoose.Schema.Types.ObjectId, ref: "Quest" }
  ],
});


// Hide empty `shared_children` on non-spouse relationships in outputs
function scrubRelationships(ret) {
  if (Array.isArray(ret.relationships)) {
    ret.relationships = ret.relationships.map((rel) => {
      if (
        rel &&
        rel.connection !== "spouse" &&
        Array.isArray(rel.shared_children) &&
        rel.shared_children.length === 0
      ) {
        delete rel.shared_children;
      }
      return rel;
    });
  }
}

CharacterSchema.set("toJSON", {
  transform(doc, ret) {
    scrubRelationships(ret);
    return ret;
  },
});

CharacterSchema.set("toObject", {
  transform(doc, ret) {
    scrubRelationships(ret);
    return ret;
  },
});


module.exports = CharacterSchema;
