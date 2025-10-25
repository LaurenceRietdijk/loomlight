const { startLocaleImageScheduler } = require('./localeImageScheduler');
const { startTerrainTilesetScheduler } = require('./terrainTilesetScheduler');

function startSchedulers() {
  // In the future, start additional schedulers here.
  startLocaleImageScheduler();
  startTerrainTilesetScheduler();
}

module.exports = { startSchedulers };