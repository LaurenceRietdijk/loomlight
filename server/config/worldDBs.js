const mongoose = require("mongoose");
const config = require("config");

// Function to clean and validate world_id before using it as a database name
const sanitizeWorldId = (world_id) => {
  return world_id.replace(/[^a-zA-Z0-9_]/g, ""); // Remove invalid characters
};

// Store active connections to avoid re-opening the same database
const connections = {};

const getDatabaseConnection = (world_id) => {
  const sanitizedId = sanitizeWorldId(world_id);

  if (!sanitizedId) {
    throw new Error("Invalid world ID provided for database creation.");
  }

  if (connections[sanitizedId]) {
    return connections[sanitizedId]; // Return cached connection
  }

  const uri = config.get("DBURI");
  const dbURI = `${uri}/${sanitizedId}`; // Use sanitized world_id as the database name

  const newConnection = mongoose.createConnection(dbURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  connections[sanitizedId] = newConnection;
  return newConnection;
};

module.exports = getDatabaseConnection;
