const mongoose = require('mongoose');
const VegetationSchema = require('../models/vegetation');

class VegetationDAL {
  static getModel() {
    return mongoose.models.Vegetation || mongoose.model('Vegetation', VegetationSchema);
  }

  static coerceObjectId(value) {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) {
      return value;
    }
    const str = String(value).trim();
    return mongoose.Types.ObjectId.isValid(str) ? new mongoose.Types.ObjectId(str) : null;
  }

  static async insertVegetation(vegetationData) {
    const VegetationModel = this.getModel();
    const payload = { ...vegetationData };
    try {
      return await new VegetationModel(payload).save();
    } catch (error) {
      console.error('Failed vegetationData:', JSON.stringify(payload, null, 2));
      console.error('Error inserting vegetation:', error);
      throw error;
    }
  }

  static async getVegetations() {
    const VegetationModel = this.getModel();
    return VegetationModel.find().exec();
  }

  static async getVegetationById(vegetationId) {
    const VegetationModel = this.getModel();
    const objectId = this.coerceObjectId(vegetationId);
    if (!objectId) {
      return null;
    }
    return VegetationModel.findById(objectId).exec();
  }

  static async updateTexture(vegetationIdentifier, textureData = null) {
    const VegetationModel = this.getModel();
    const objectId = this.coerceObjectId(vegetationIdentifier);
    if (!objectId) {
      return null;
    }
    return VegetationModel.findByIdAndUpdate(
      objectId,
      { $set: { texture: textureData } },
      { new: true }
    ).exec();
  }

  static async deleteVegetationById(vegetationId) {
    const VegetationModel = this.getModel();
    const objectId = this.coerceObjectId(vegetationId);
    if (!objectId) {
      return null;
    }
    return VegetationModel.findByIdAndDelete(objectId).exec();
  }
}

module.exports = VegetationDAL;
