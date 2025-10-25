const mongoose = require('mongoose');
const TerrainSchema = require('../models/terrain');

class TerrainDAL {
  static getModel() {
    return mongoose.models.Terrain || mongoose.model('Terrain', TerrainSchema);
  }

  static coerceObjectId(value) {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) {
      return value;
    }
    const str = String(value).trim();
    return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
  }

  static normaliseNeighbourMap(neighbours) {
    if (!neighbours || typeof neighbours !== 'object') {
      return {};
    }
    const normalised = {};
    for (const [rawKey, rawValue] of Object.entries(neighbours)) {
      if (!rawKey) continue;
      const key = String(rawKey);
      const objectId = this.coerceObjectId(rawValue);
      normalised[key] = objectId;
    }
    return normalised;
  }

  static async insertTerrain(terrainData) {
    const TerrainModel = this.getModel();
    const payload = { ...terrainData };
    if (payload.neighbours) {
      payload.neighbours = this.normaliseNeighbourMap(payload.neighbours);
    }
    try {
      return await new TerrainModel(payload).save();
    } catch (error) {
      console.error('Failed terrainData:', JSON.stringify(payload, null, 2));
      console.error('Error inserting terrain:', error);
      throw error;
    }
  }

  static async getTerrains() {
    const TerrainModel = this.getModel();
    return TerrainModel.find().exec();
  }

  static async getTerrainById(terrainId) {
    const TerrainModel = this.getModel();
    const objectId = this.coerceObjectId(terrainId);
    if (!objectId) {
      return null;
    }
    return TerrainModel.findById(objectId).exec();
  }

  static async setNeighbourTilesetByObjectId(terrainId, neighbourId, tilesetId, options = {}) {
    const TerrainModel = this.getModel();
    const terrainObjectId = this.coerceObjectId(terrainId);
    const neighbourObjectId = this.coerceObjectId(neighbourId);
    const tilesetObjectId = this.coerceObjectId(tilesetId);

    if (!terrainObjectId || !neighbourObjectId || !tilesetObjectId) {
      return null;
    }

    const neighbourKey = neighbourObjectId.toString();
    const update = {
      $set: { [`neighbours.${neighbourKey}`]: tilesetObjectId },
    };

    const removeKeys = Array.isArray(options.removeKeys) ? options.removeKeys : [];
    if (removeKeys.length) {
      update.$unset = removeKeys.reduce((acc, key) => {
        const trimmed = String(key || '').trim();
        if (!trimmed || trimmed === neighbourKey) {
          return acc;
        }
        acc[`neighbours.${trimmed}`] = '';
        return acc;
      }, {});
      if (Object.keys(update.$unset).length === 0) {
        delete update.$unset;
      }
    }

    return TerrainModel.findByIdAndUpdate(terrainObjectId, update, { new: true }).exec();
  }

  static async updateTexture(terrainIdentifier, textureData = null) {
    const TerrainModel = this.getModel();
    const objectId = this.coerceObjectId(terrainIdentifier);
    if (!objectId) {
      return null;
    }
    return TerrainModel.findByIdAndUpdate(
      objectId,
      { $set: { texture: textureData } },
      { new: true }
    ).exec();
  }

  static async deleteTerrainById(terrainId) {
    const TerrainModel = this.getModel();
    const objectId = this.coerceObjectId(terrainId);
    if (!objectId) {
      return null;
    }
    return TerrainModel.findByIdAndDelete(objectId).exec();
  }
}

module.exports = TerrainDAL;
