const fs = require('fs');
const path = require('path');
const { generateNextVegetationImage } = require('../jobs/vegetationImageJob');

// Scheduler configuration (override via env vars)
const TICK_MS = Number(process.env.VEGETATION_IMAGE_SCHEDULER_TICK_MS || 60 * 60 * 1000); // 60 minutes
const MONTHLY_MAX = Number(process.env.VEGETATION_IMAGE_MONTHLY_MAX || 30);
const MIN_DELAY_MS = Number(process.env.VEGETATION_IMAGE_MIN_DELAY_MS || 2 * 60 * 60 * 1000); // 2 hours
const CALLS_ENABLED = String(process.env.VEGETATION_IMAGE_CALLS_ENABLED || 'false').toLowerCase() === 'true';

const stateDir = path.join(__dirname, 'state');
const stateFile = path.join(stateDir, 'vegetationImage.json');

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
    console.error('[VegetationImageScheduler] Failed to read state file, resetting.', err);
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
    console.log('[VegetationImageScheduler] Dry run: vegetation image generation disabled.');
    return;
  }

  const readiness = canRunNow(state);
  if (!readiness.ok) {
    writeState(state);
    console.log(`[VegetationImageScheduler] Skip: ${readiness.reason}`);
    return;
  }

  try {
    console.log('[VegetationImageScheduler] Looking for next vegetation without image...');
    const jobResult = await generateNextVegetationImage();
    if (!jobResult) {
      state.lastResult = null;
      state.lastError = null;
      writeState(state);
      console.log('[VegetationImageScheduler] No pending vegetation images.');
      return;
    }

    state.count += 1;
    state.lastRunAt = nowIso;
    state.lastError = null;
    state.lastResult = {
      vegetationId: jobResult.target.vegetationId,
      vegetationName: jobResult.target.vegetationName,
      vegetationType: jobResult.target.vegetationType,
      imagePath: jobResult.imageResult?.imagePath || null,
    };

    writeState(state);

    console.log(
      `[VegetationImageScheduler] Generated image for vegetation: ${state.lastResult.vegetationName} (${state.lastResult.vegetationType})`,
    );
  } catch (err) {
    state.lastError = {
      at: nowIso,
      message: err?.message || String(err),
    };
    writeState(state);
    console.error('[VegetationImageScheduler] Job error:', err);
  }
}

let intervalHandle = null;

function startVegetationImageScheduler() {
  if (intervalHandle) return intervalHandle;
  console.log(
    '[VegetationImageScheduler] Starting. Tick every',
    TICK_MS,
    'ms. Calls enabled:',
    CALLS_ENABLED,
  );
  tick();
  intervalHandle = setInterval(tick, TICK_MS);
  return intervalHandle;
}

function stopVegetationImageScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = {
  startVegetationImageScheduler,
  stopVegetationImageScheduler,
};
