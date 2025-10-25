const mongoose = require('mongoose');
const TextureSchema = require('./schemas/textureSchema');

const TerrainSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  neighbours: {
    type: Map,
    of: { type: mongoose.Schema.Types.ObjectId, ref: 'TerrainTileset', default: null },
    default: {},
  },
  texture: TextureSchema,
});

module.exports = TerrainSchema;
