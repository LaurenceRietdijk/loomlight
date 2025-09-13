const mongoose = require("mongoose");
const LocaleSchema = require("./locale");

// Reuse locale type enum values for the map keys
const localeTypes = LocaleSchema.path("type").enumValues;

const BiomeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
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
