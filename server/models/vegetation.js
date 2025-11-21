const mongoose = require('mongoose');
const TextureSchema = require('./schemas/textureSchema');

const VegetationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['flower', 'grass', 'bush', 'tree', 'fungus', 'moss', 'lichen', 'briar', 'lily']
  },
  texture: TextureSchema,
});

module.exports = VegetationSchema;
