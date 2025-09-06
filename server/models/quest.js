const mongoose = require("mongoose");

// Allowed quest types and states
const QUEST_TYPES = ["Fetch", "Deliver", "Kill", "Gather", "Explore", "Clear"];
const QUEST_STATES = ["avaliable", "acepted", "completed", "failed"];

// Reusable location reference (no _id)
const LocationRefSchema = new mongoose.Schema(
  {
    locale: { type: mongoose.Schema.Types.ObjectId, ref: "Locale", default: null },
    building: { type: mongoose.Schema.Types.ObjectId, ref: "Building", default: null },
    room: { type: mongoose.Schema.Types.ObjectId, default: null },
    container: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { _id: false }
);

// Base quest schema with discriminator key
// Rename field from `type` to `questType` to avoid collisions with discriminator
const QuestBaseSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    questType: { type: String, enum: QUEST_TYPES, required: true },
    state: { type: String, enum: QUEST_STATES, default: "avaliable" },
    // Active player character id (per-world) that accepted this quest
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true, discriminatorKey: "questType" }
);

// Useful compound index for filtering by type/state
QuestBaseSchema.index({ questType: 1, state: 1 });
QuestBaseSchema.index({ state: 1, acceptedBy: 1 });

// Type-specific schemas
const FetchQuestSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    quantity: { type: Number, default: 1, min: 1 },
    source: { type: LocationRefSchema, default: undefined },
  },
  { _id: false }
);

const DeliverQuestSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: "Item", default: null },
    quantity: { type: Number, default: 1, min: 1 },
    pickup: { type: LocationRefSchema, default: undefined },
    dropoff: { type: LocationRefSchema, default: undefined },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: "Character", default: null },
  },
  { _id: false }
);

const KillQuestSchema = new mongoose.Schema(
  {
    targetCharacter: { type: mongoose.Schema.Types.ObjectId, ref: "Character", default: null },
    targetFaction: { type: mongoose.Schema.Types.ObjectId, ref: "Faction", default: null },
    count: { type: Number, default: 1, min: 1 },
    area: { type: LocationRefSchema, default: undefined },
  },
  { _id: false }
);

const GatherQuestSchema = new mongoose.Schema(
  {
    resourceName: { type: String, default: "" },
    resourceType: { type: String, default: "" },
    quantity: { type: Number, default: 1, min: 1 },
    area: { type: LocationRefSchema, default: undefined },
  },
  { _id: false }
);

const ExploreQuestSchema = new mongoose.Schema(
  {
    targetLocale: { type: mongoose.Schema.Types.ObjectId, ref: "Locale", default: null },
    coordinates: {
      x: { type: Number, default: null },
      y: { type: Number, default: null },
    },
    areaName: { type: String, default: "" },
  },
  { _id: false }
);

// Clear quest: eliminate or displace hostiles in a locale
// Progress is tracked via enemiesRemaining (live NPCs present). Can go up/down.
const ClearQuestSchema = new mongoose.Schema(
  {
    targetLocale: { type: mongoose.Schema.Types.ObjectId, ref: "Locale", default: null },
    // Safer tracking: live enemies remaining in the target locale
    enemiesRemaining: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

/**
 * Ensure Quest model and discriminators are registered on a given connection.
 * Returns the Quest base model.
 * @param {import('mongoose').Connection} db
 */
function ensureQuestModel(db) {
  const modelName = "Quest";
  const QuestModel = db.models[modelName] || db.model(modelName, QuestBaseSchema);

  // Register discriminators if missing on this connection
  const d = QuestModel.discriminators || {};
  if (!d["Fetch"]) QuestModel.discriminator("Fetch", FetchQuestSchema);
  if (!d["Deliver"]) QuestModel.discriminator("Deliver", DeliverQuestSchema);
  if (!d["Kill"]) QuestModel.discriminator("Kill", KillQuestSchema);
  if (!d["Gather"]) QuestModel.discriminator("Gather", GatherQuestSchema);
  if (!d["Explore"]) QuestModel.discriminator("Explore", ExploreQuestSchema);
  if (!d["Clear"]) QuestModel.discriminator("Clear", ClearQuestSchema);

  return QuestModel;
}

module.exports = {
  QUEST_TYPES,
  QUEST_STATES,
  LocationRefSchema,
  QuestBaseSchema,
  ensureQuestModel,
};
