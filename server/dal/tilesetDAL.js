const mongoose = require('mongoose');
const TerrainTilesetSchema = require('../models/tileset');

class TilesetDAL {
  static getModel() {
    return mongoose.models.TerrainTileset || mongoose.model('TerrainTileset', TerrainTilesetSchema);
  }

  static coerceObjectId(value) {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) {
      return value;
    }
    const str = String(value).trim();
    return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
  }

  static async createTileset(data) {
    const TilesetModel = this.getModel();
    const payload = { ...data };
    payload.lowerTerrain = this.coerceObjectId(payload.lowerTerrain);
    payload.upperTerrain = this.coerceObjectId(payload.upperTerrain);
    if (!payload.lowerTerrain || !payload.upperTerrain) {
      throw new Error('Tileset requires valid lowerTerrain and upperTerrain references');
    }
    if (payload.texture && payload.texture.generatedAt == null) {
      payload.texture.generatedAt = new Date();
    }
    return new TilesetModel(payload).save();
  }

  static async getById(id) {
    const TilesetModel = this.getModel();
    const objectId = this.coerceObjectId(id);
    if (!objectId) {
      return null;
    }
    return TilesetModel.findById(objectId).exec();
  }

  static async findByPair(lowerId, upperId) {
    const TilesetModel = this.getModel();
    const lower = this.coerceObjectId(lowerId);
    const upper = this.coerceObjectId(upperId);
    if (!lower || !upper) {
      return null;
    }
    return TilesetModel.findOne({ lowerTerrain: lower, upperTerrain: upper }).exec();
  }
}

module.exports = TilesetDAL;
