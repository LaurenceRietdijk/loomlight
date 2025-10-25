// server/scripts/test-compose-iso.js
const { composeIsometricTileGrid } = require("../jobs/isometricTileMapJob.js");

(async () => {
  try {
    const tilesetId = process.argv[2];
    const gridSize = Number(process.argv[3]) || 4;
    if (!tilesetId) {
      throw new Error('Usage: node server/scripts/test-compose-iso.js <tilesetId> [gridSize]');
    }

    const result = await composeIsometricTileGrid(tilesetId, { gridSize });
    console.log('✅ Isometric compose complete:', result);
    console.log('Output:', result.outputPath);
  } catch (err) {
    console.error('❌ Test failed:', err?.message || err);
    process.exit(1);
  }
})();
