const mongoose = require('mongoose');
const TextureSchema = require('./schemas/textureSchema');

const TerrainTilesetSchema = new mongoose.Schema(
  {
    lowerTerrain: { type: mongoose.Schema.Types.ObjectId, ref: 'Terrain', required: true },
    upperTerrain: { type: mongoose.Schema.Types.ObjectId, ref: 'Terrain', required: true },
    tilesetId: { type: String, required: true },
    jobId: { type: String, default: '' },
    texture: TextureSchema,
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
  }
);

TerrainTilesetSchema.index({ lowerTerrain: 1, upperTerrain: 1 }, { unique: true });

module.exports = TerrainTilesetSchema;
