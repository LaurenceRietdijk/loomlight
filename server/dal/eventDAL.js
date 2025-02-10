const mongoose = require("mongoose");
const { Event } = require("../models/event");
const getDatabaseConnection = require("../config/worldDBs");

class EventDAL {
  /**
   * Inserts a new event into the world database.
   * @param {string} world_id - The world database ID.
   * @param {Object} eventData - Event details.
   * @returns {Promise<Object>} - Inserted event document.
   */
  static async insertEvent(world_id, eventData) {
    const db = getDatabaseConnection(world_id);
    const EventModel = db.model("Event", Event.schema);
    return await new EventModel(eventData).save();
  }

  /**
   * Retrieves all events for a given world.
   * @param {string} world_id - The world database ID.
   * @returns {Promise<Object[]>} - List of events.
   */
  static async getEvents(world_id) {
    const db = getDatabaseConnection(world_id);
    const EventModel = db.model("Event", Event.schema);
    return await EventModel.find().exec();
  }

  /**
   * Finds a specific event by ID.
   * @param {string} world_id - The world database ID.
   * @param {string} event_id - The event ID.
   * @returns {Promise<Object|null>} - Event document or null.
   */
  static async getEventById(world_id, event_id) {
    const db = getDatabaseConnection(world_id);
    const EventModel = db.model("Event", Event.schema);
    return await EventModel.findById(event_id).exec();
  }
}

module.exports = EventDAL;
