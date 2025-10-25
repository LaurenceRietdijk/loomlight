const fs = require('fs');
const path = require('path');
const { generateNextTerrainTileset } = require('../jobs/terrainTileMapJob');

// Scheduler configuration (override via env vars)
const TICK_MS = Number(process.env.TERRAIN_TILESET_SCHEDULER_TICK_MS || 60 * 60 * 1000); // 60 minutes
const MONTHLY_MAX = Number(process.env.TERRAIN_TILESET_MONTHLY_MAX || 20);
const MIN_DELAY_MS = Number(process.env.TERRAIN_TILESET_MIN_DELAY_MS || 6 * 60 * 60 * 1000); // 6 hours
const CALLS_ENABLED = String(process.env.TERRAIN_TILESET_CALLS_ENABLED || 'false').toLowerCase() === 'true';

const stateDir = path.join(__dirname, 'state');
const stateFile = path.join(stateDir, 'terrainTileset.json');

function ensureStateDir() {
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
}

function currentMonthKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function readState() {
  ensureStateDir();
  if (!fs.existsSync(stateFile)) {
    return {
      monthKey: currentMonthKey(),
      count: 0,
      lastRunAt: null,
      lastAttemptAt: null,
      lastResult: null,
      lastError: null,
    };
  }
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      monthKey: parsed.monthKey || currentMonthKey(),
      count: Number(parsed.count || 0),
      lastRunAt: parsed.lastRunAt || null,
      lastAttemptAt: parsed.lastAttemptAt || null,
      lastResult: parsed.lastResult || null,
      lastError: parsed.lastError || null,
    };
  } catch (err) {
    console.error('[TerrainTilesetScheduler] Failed to read state file, resetting.', err);
    return {
      monthKey: currentMonthKey(),
      count: 0,
      lastRunAt: null,
      lastAttemptAt: null,
      lastResult: null,
      lastError: null,
    };
  }
}

function writeState(state) {
  ensureStateDir();
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), 'utf8');
}

function rotateMonthIfNeeded(state) {
  const nowKey = currentMonthKey();
  if (state.monthKey !== nowKey) {
    state.monthKey = nowKey;
    state.count = 0;
    return true;
  }
  return false;
}

function canRunNow(state) {
  if (state.count >= MONTHLY_MAX) {
    return { ok: false, reason: `Monthly cap reached (${state.count}/${MONTHLY_MAX})` };
  }
  if (state.lastRunAt) {
    const msSince = Date.now() - new Date(state.lastRunAt).getTime();
    if (msSince < MIN_DELAY_MS) {
      const minsLeft = Math.ceil((MIN_DELAY_MS - msSince) / 60000);
      return { ok: false, reason: `Waiting for min delay (${minsLeft} min left)` };
    }
  }
  return { ok: true };
}

async function tick() {
  const state = readState();
  const rotated = rotateMonthIfNeeded(state);
  const nowIso = new Date().toISOString();
  state.lastAttemptAt = nowIso;

  if (rotated) {
    writeState(state);
  }

  if (!CALLS_ENABLED) {
    writeState(state);
    console.log('[TerrainTilesetScheduler] Dry run: terrain tileset generation disabled.');
    return;
  }

  const readiness = canRunNow(state);
  if (!readiness.ok) {
    writeState(state);
    console.log(`[TerrainTilesetScheduler] Skip: ${readiness.reason}`);
    return;
  }

  try {
    console.log('[TerrainTilesetScheduler] Looking for next terrain neighbour pair...');
    const jobResult = await generateNextTerrainTileset();
    if (!jobResult) {
      state.lastResult = null;
      state.lastError = null;
      writeState(state);
      console.log('[TerrainTilesetScheduler] No pending neighbour pairs.');
      return;
    }

    state.count += 1;
    state.lastRunAt = nowIso;
    state.lastError = null;
    state.lastResult = {
      tilesetId: jobResult.tilesetJob?.tilesetId || null,
      jobId: jobResult.tilesetJob?.jobId || null,
      baseTerrainId: jobResult.target.baseTerrainId,
      neighbourTerrainId: jobResult.target.neighbourTerrainId,
      neighbourKey: jobResult.target.neighbourKey,
    };

    writeState(state);

    console.log(
      `[TerrainTilesetScheduler] Generated tileset ${state.lastResult.tilesetId || '(unknown)'} ` +
        `for ${jobResult.target.baseTerrainName} vs ${jobResult.target.neighbourTerrainName}.`,
    );
  } catch (err) {
    state.lastError = {
      at: nowIso,
      message: err?.message || String(err),
    };
    writeState(state);
    console.error('[TerrainTilesetScheduler] Job error:', err);
  }
}

let intervalHandle = null;

function startTerrainTilesetScheduler() {
  if (intervalHandle) return intervalHandle;
  console.log(
    '[TerrainTilesetScheduler] Starting. Tick every',
    TICK_MS,
    'ms. Calls enabled:',
    CALLS_ENABLED,
  );
  tick();
  intervalHandle = setInterval(tick, TICK_MS);
  return intervalHandle;
}

function stopTerrainTilesetScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startTerrainTilesetScheduler,
  stopTerrainTilesetScheduler,
};