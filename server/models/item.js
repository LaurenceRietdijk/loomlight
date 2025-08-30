const mongoose = require("mongoose");

const ItemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  description: { type: String, default: "" },
  location: {
    locale: { type: mongoose.Schema.Types.ObjectId, ref: "Locale", default: null },
    building: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
    room: { type: mongoose.Schema.Types.ObjectId, default: null },
    container: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
});

module.exports = ItemSchema;
