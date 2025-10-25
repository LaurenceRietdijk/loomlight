const mongoose = require('mongoose');

const TextureSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'PixelLab' },
    prompt: { type: String, default: '' },
    imagePath: { type: String, default: '' },
    reference: { type: String, default: '' },
    generatedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

module.exports = TextureSchema;
