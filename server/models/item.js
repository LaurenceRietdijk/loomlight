const mongoose = require("mongoose");

// Base Item schema with discriminator key `type`
// Keeps existing fields for backward compatibility
const ItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // Discriminator key; existing code already had a required `type` string
    type: { type: String, required: true },
    description: { type: String, default: "" },
    location: {
      locale: { type: mongoose.Schema.Types.ObjectId, ref: "Locale", default: null },
      building: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
      room: { type: mongoose.Schema.Types.ObjectId, default: null },
      container: { type: mongoose.Schema.Types.ObjectId, default: null },
    },
  },
  { discriminatorKey: "type", timestamps: true }
);

// --- Type-specific item schemas (polymorphic) ---

// Weapon-specific fields
const WeaponItemSchema = new mongoose.Schema(
  {
    weaponType: { type: String, default: "" }, // e.g., sword, axe, bow
    damage: {
      min: { type: Number, default: 1, min: 0 },
      max: { type: Number, default: 1, min: 0 },
      type: { type: String, default: "physical" }, // physical, fire, ice, etc.
    },
    hands: { type: Number, default: 1, min: 1, max: 2 },
    range: { type: Number, default: 1, min: 0 }, // tiles/meters; 1 = melee
    attackSpeed: { type: Number, default: 1, min: 0 }, // attacks per second or similar
    requirements: {
      str: { type: Number, default: 0, min: 0 },
      dex: { type: Number, default: 0, min: 0 },
      int: { type: Number, default: 0, min: 0 },
    },
  },
  { _id: false }
);

// Armour-specific fields
const ArmourItemSchema = new mongoose.Schema(
  {
    armourSlot: {
      type: String,
      enum: ["head", "chest", "legs", "hands", "feet", "shield", "back", "neck", "ring"],
      required: true,
    },
    defence: { type: Number, required: true, min: 0 },
    resistance: {
      physical: { type: Number, default: 0, min: 0 },
      fire: { type: Number, default: 0, min: 0 },
      ice: { type: Number, default: 0, min: 0 },
      poison: { type: Number, default: 0, min: 0 },
      arcane: { type: Number, default: 0, min: 0 },
    },
  },
  { _id: false }
);

// Consumable-specific fields
const ConsumableItemSchema = new mongoose.Schema(
  {
    effect: { type: String, required: true }, // e.g., "heals 20 HP", "restore mana"
    charges: { type: Number, default: 1, min: 1 },
    durationSec: { type: Number, default: 0, min: 0 }, // 0 = instant
    cooldownSec: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

// Resource-specific fields
const ResourceItemSchema = new mongoose.Schema(
  {
    resourceType: { type: String, default: "" }, // e.g., wood, iron, herb
    rarity: { type: String, default: "common" },
    quantity: { type: Number, default: 1, min: 1 },
    stackSize: { type: Number, default: 99, min: 1 },
  },
  { _id: false }
);

/**
 * Ensure Item model and discriminators are registered on a given connection.
 * Returns the Item base model.
 * @param {import('mongoose').Connection} db
 */
function ensureItemModel(db) {
  const modelName = "Item";
  const ItemModel = db.models[modelName] || db.model(modelName, ItemSchema);

  // Register discriminators if missing on this connection
  const d = ItemModel.discriminators || {};
  if (!d["Weapon"]) ItemModel.discriminator("Weapon", WeaponItemSchema);
  if (!d["Armour"]) ItemModel.discriminator("Armour", ArmourItemSchema);
  if (!d["Consumable"]) ItemModel.discriminator("Consumable", ConsumableItemSchema);
  if (!d["Resource"]) ItemModel.discriminator("Resource", ResourceItemSchema);

  return ItemModel;
}

// Default export remains the base schema for backward compatibility
module.exports = ItemSchema;
// Also export helper to ensure model + discriminators on a connection
module.exports.ensureItemModel = ensureItemModel;
module.exports.ITEM_TYPES = ["Weapon", "Armour", "Consumable", "Resource"];
