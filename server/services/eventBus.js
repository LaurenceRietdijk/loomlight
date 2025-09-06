const { EventEmitter } = require('events');

// Simple singleton event bus for server-side game events
class EventBus extends EventEmitter {}

module.exports = new EventBus();

