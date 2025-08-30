const mongoose = require("mongoose");

// Containers live inside rooms and hold items.
const ContainerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    description: { type: String, default: "" },
    // Each container itself has an _id by default
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: "Item" }],
  },
  { _id: true }
);

// Rooms live inside buildings.
const RoomSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: "" },
    // Each room has an _id by default
    containers: { type: [ContainerSchema], default: [] },
    characters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Character" }],
  },
  { _id: true }
);

const BuildingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, default: "" },
  description: { type: String, default: "" },
  locale: { type: mongoose.Schema.Types.ObjectId, ref: "Locale", required: true },
  rooms: { type: [RoomSchema], default: [] },
});

module.exports = BuildingSchema;
