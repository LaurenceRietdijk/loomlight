const { startLocaleImageScheduler } = require('./localeImageScheduler');
const { startTerrainTilesetScheduler } = require('./terrainTilesetScheduler');
const { startVegetationImageScheduler } = require('./vegetationImageScheduler');

function startSchedulers() {
  // In the future, start additional schedulers here.
  startLocaleImageScheduler();
  startTerrainTilesetScheduler();
  startVegetationImageScheduler();
}

module.exports = { startSchedulers };
