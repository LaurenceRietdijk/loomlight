const mongoose = require("mongoose");

// Container holds items and lives inside a room.
const ContainerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    items: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Item" },
    ],
  },
  { _id: false }
);

// Rooms are part of a locale and may hold a single container.
const RoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    container: { type: ContainerSchema, default: null },
  },
  { _id: false }
);

const LocaleSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: {
    type: String,
    enum: [
      "Camp",
      "Hamlet",
      "Village",
      "Town",
      "Wilderness",
      "Cave",
      "Dungeon",
    ],
    default: "Camp",
  },
  description: { type: String, required: true },
  coordinates: {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
  },
  primary_race: { type: mongoose.Schema.Types.ObjectId, ref: "Race" },
  rooms: { type: [RoomSchema], default: [] },
  factions: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Faction" },
      relevance: { type: String, default: "set up camp" },
    },
  ],
  characters: [
    {
      _id: { type: mongoose.Schema.Types.ObjectId, ref: "Character" },
      building: { type: String }, // name of building this character is tied to
      role: { type: String, default: "just a local resident" }, // their role in that building
    },
  ],
  population: { type: Number, default: 0 },
  resources: {
    wealth: { type: String, default: "unknown" },
    military_presence: { type: String, default: "unknown" },
    political_importance: { type: String, default: "unknown" },
  },
  special_features: { type: [String], default: [] },
  buildings: { type: [String], default: [] }, // key industry or civic buildings
});

module.exports = LocaleSchema;
