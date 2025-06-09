const mongoose = require("mongoose");

const raceSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Common name of the race
  classification: {
    type: String,
    enum: ["Sapient", "Semi-Sapient", "Beast"],
    required: true,
  }, // Defines intelligence level

  origins: {
    first_appearance: String, // Where they first appeared (e.g., continent, realm, plane)
    creation_myth: String, // Mythological or scientific origin of the race
    natural_habitat: [String], // Preferred environments (e.g., forest, underground, floating isles)
  },

  physiology: {
    lifespan: { type: Number, min: 1 }, // Average lifespan in years
    size_range: { min: Number, max: Number }, // Typical height/length range
    diet: {
      type: String,
      enum: ["Herbivore", "Carnivore", "Omnivore", "Other"],
    } // Diet category
  },

  intelligence: {
    tool_usage: { type: Boolean, default: false }, // Can they craft/use tools?
    societal_structure: {
      type: String,
      enum: ["None", "Tribal", "Feudal", "Democratic", "Hive Mind", "Other"],
      default: "None",
    }, // Defines how they organize
  },

  history: {
    major_events: [{ type: mongoose.Schema.Types.ObjectId, ref: "Event" }], // Key moments in their history
    extinction_status: {
      type: String,
      enum: ["Thriving", "Declining", "Endangered", "Extinct"],
      default: "Thriving",
    },
  },
});

module.exports = raceSchema;
