const fs = require('fs');
const path = require('path');
const { generateNextLocaleImage } = require('../jobs/localeImageJob');

// Config with sensible defaults; override via env vars
const TICK_MS = Number(process.env.LOCALE_IMAGE_SCHEDULER_TICK_MS || 15 * 60 * 1000); // 15 minutes
const MONTHLY_MAX = Number(process.env.LOCALE_IMAGE_MONTHLY_MAX || 10);
const MIN_DELAY_MS = Number(process.env.LOCALE_IMAGE_MIN_DELAY_MS || 6 * 60 * 60 * 1000); // 6 hours
const CALLS_ENABLED = String(process.env.LOCALE_IMAGE_CALLS_ENABLED || 'false').toLowerCase() === 'true'; // default off while testing

const stateDir = path.join(__dirname, 'state');
const stateFile = path.join(stateDir, 'localeImage.json');

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
    return { monthKey: currentMonthKey(), count: 0, lastRunAt: null, lastAttemptAt: null };
  }
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      monthKey: parsed.monthKey || currentMonthKey(),
      count: Number(parsed.count || 0),
      lastRunAt: parsed.lastRunAt || null,
      lastAttemptAt: parsed.lastAttemptAt || null,
    };
  } catch (e) {
    console.error('[LocaleImageScheduler] Failed to read state file, resetting.', e);
    return { monthKey: currentMonthKey(), count: 0, lastRunAt: null, lastAttemptAt: null };
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
    // keep lastRunAt for informational purposes
    return true;
  }
  return false;
}

function canRunNow(state) {
  // monthly cap
  if (state.count >= MONTHLY_MAX) {
    return { ok: false, reason: `Monthly cap reached (${state.count}/${MONTHLY_MAX})` };
  }
  // min interval
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

  if (rotated) writeState(state);

  if (!CALLS_ENABLED) {
    // Dry run mode: do not call the job, do not increment count
    writeState(state);
    console.log('[LocaleImageScheduler] Dry run: locale image job is disabled.');
    return;
  }

  const check = canRunNow(state);
  if (!check.ok) {
    writeState(state);
    console.log(`[LocaleImageScheduler] Skip: ${check.reason}`);
    return;
  }

  try {
    console.log('[LocaleImageScheduler] Triggering generateNextLocaleImage...');
    const result = await generateNextLocaleImage();
    // Count a successful trigger regardless of whether an image was produced
    state.count += 1;
    state.lastRunAt = nowIso;
    writeState(state);
    if (result) {
      console.log(`[LocaleImageScheduler] Job completed. Output: ${result}`);
    } else {
      console.log('[LocaleImageScheduler] Job completed. No pending locale image.');
    }
  } catch (err) {
    // Do not increment count on failure
    writeState(state);
    console.error('[LocaleImageScheduler] Job error:', err);
  }
}

let intervalHandle = null;

function startLocaleImageScheduler() {
  if (intervalHandle) return intervalHandle;
  console.log('[LocaleImageScheduler] Starting. Tick every', TICK_MS, 'ms. Calls enabled:', CALLS_ENABLED);
  // Kick off immediately, then on interval
  tick();
  intervalHandle = setInterval(tick, TICK_MS);
  return intervalHandle;
}

function stopLocaleImageScheduler() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

module.exports = { startLocaleImageScheduler, stopLocaleImageScheduler };

