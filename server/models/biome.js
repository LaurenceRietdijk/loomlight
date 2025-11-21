const mongoose = require("mongoose");
const LocaleSchema = require("./locale");

// Reuse locale type enum values for the map keys
const localeTypes = LocaleSchema.path("type").enumValues;

const WeightedTerrainSchema = new mongoose.Schema(
  {
    terrain: { type: mongoose.Schema.Types.ObjectId, ref: "Terrain", required: true },
    weight: { type: Number, default: 1, min: 0 },
  },
  { _id: false }
);

const BiomeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  // Weighted list of terrains in this biome (backward-compat: accept array of ObjectIds on input)
  terrains: { type: [WeightedTerrainSchema], default: [] },
  // List of vegetation UIDs present in this biome
  vegetations: { type: [mongoose.Schema.Types.ObjectId], ref: "Vegetation", default: [] },
  locales: {
    type: Map,
    of: Boolean,
    default: {},
    validate: {
      validator: (v) =>
        Array.from(v.keys()).every((key) => localeTypes.includes(key)),
      message: (props) =>
        `Invalid locale type key: ${Array.from(props.value.keys()).join(", ")}`,
    },
  },
});

module.exports = BiomeSchema;
