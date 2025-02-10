const mongoose = require("mongoose");

const WorldSchema = new mongoose.Schema(
  {
    name: {
      type: String, // The title of the document
      required: true,
    },
    worldBuilding: {
      type: String, // The main content or paragraph
      required: true,
    },
    creator: {
      type: String, // Assuming creator ID is a string like "123abc"
      required: true,
    },
  },
  { timestamps: true }
);

const World = mongoose.model("World", WorldSchema);

module.exports = World;