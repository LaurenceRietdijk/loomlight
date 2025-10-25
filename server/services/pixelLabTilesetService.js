const fs = require('fs/promises');
const path = require('path');
const { request } = require('undici');
const { PNG } = require('pngjs');
const TerrainDAL = require('../dal/terrainDAL');
const TilesetDAL = require('../dal/tilesetDAL');
const { composeIsometricTileGrid } = require("../jobs/isometricTileMapJob");

const ROOT_DIR = path.join(__dirname, '..', '..');
const TERRAIN_IMAGE_DIR = path.join(ROOT_DIR, 'web', 'images', 'terrain');
const TILESET_IMAGE_DIR = path.join(ROOT_DIR, 'web', 'images', 'tilesets');
const DEFAULT_TILESET_TILE_SIZE = Object.freeze({ width: 16, height: 16 });
const DEFAULT_POLL_INTERVAL_MS = Number(process.env.PIXELLAB_TILESET_POLL_MS || 3000);
const DEFAULT_MAX_POLL_ATTEMPTS = Number(process.env.PIXELLAB_TILESET_MAX_POLLS || 40);
const DEFAULT_FETCH_RETRY_ATTEMPTS = Number(process.env.PIXELLAB_TILESET_FETCH_RETRY || 5);
const DEFAULT_FETCH_RETRY_DELAY_MS = Number(process.env.PIXELLAB_TILESET_FETCH_DELAY_MS || 1500);
const DEFAULT_MAX_WAIT_MS = Number(process.env.PIXELLAB_TILESET_MAX_WAIT_MS || 10 * 60 * 1000); // 10 minutes


function sanitizeBaseUrl() {
  const fallback = 'https://api.pixellab.ai/v2';
  const envUrl =
    process.env.PIXELLAB_V2_BASE_URL ||
    process.env.PIXELLAB_BASE_URL ||
    process.env.PIXELLAB_API_BASE_URL ||
    fallback;
  return envUrl.replace(/\/$/, '');
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractUidFromTexture(texture) {
  if (!texture) {
    return null;
  }
  const candidates = [];
  if (typeof texture.uid === 'string') {
    candidates.push(texture.uid.trim());
  }
  if (typeof texture.reference === 'string') {
    candidates.push(texture.reference.trim());
  }
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    if (/^data:image\//i.test(candidate)) {
      continue;
    }
    return candidate;
  }
  return null;
}

function buildTerrainDirective(terrain, role) {
  if (!terrain) {
    throw new Error(`Missing ${role} terrain for PixelLab tileset generation`);
  }
  const description = (terrain.description || '').trim();
  if (!description) {
    throw new Error(`Terrain ${terrain.name || terrain._id?.toString() || role} is missing a description`);
  }
  const texture = terrain.texture || {};
  const uid = extractUidFromTexture(texture);
  return {
    role,
    terrain,
    description,
    uid,
    needsGeneration: !uid,
  };
}

function buildTilesetRequestBody(lowerDirective, upperDirective, options = {}) {
  const body = {};

  if (options?.allowUpperBaseUid && upperDirective.uid) {
    body.upper_base_tile_id = upperDirective.uid; // PROBE: undocumented input
  }

  // Required terrain text (or a lower UID if you have one)
  body.lower_description = lowerDirective.description;
  if (lowerDirective.uid) {
    // documented in the file you added
    body.lower_base_tile_id = lowerDirective.uid;
  }

  body.upper_description = upperDirective.description;
  // NOTE: upper_base_tile_id is NOT documented as a request field; omit to avoid API rejection.

  const {
    transitionDescription,
    tileSize,
    textGuidanceScale,
    outline,
    shading,
    detail,
    view,
    tileStrength,
    tilesetAdherence,
    tilesetAdherenceFreedom,
    transitionSize,
    colorImage,
    seed,
    lowerReferenceImage,
    transitionReferenceImage,
  } = options || {};

  if (transitionDescription) body.transition_description = transitionDescription;

  const resolvedTileSize = tileSize || DEFAULT_TILESET_TILE_SIZE;
  if (resolvedTileSize?.width && resolvedTileSize?.height) {
    body.tile_size = { width: resolvedTileSize.width, height: resolvedTileSize.height };
  }

  if (typeof textGuidanceScale === 'number') body.text_guidance_scale = textGuidanceScale;
  if (outline) body.outline = outline;
  if (shading) body.shading = shading;
  if (detail) body.detail = detail;
  if (view) body.view = view;
  if (typeof tileStrength === 'number') body.tile_strength = tileStrength;
  if (typeof tilesetAdherence === 'number') body.tileset_adherence = tilesetAdherence;
  if (typeof tilesetAdherenceFreedom === 'number') body.tileset_adherence_freedom = tilesetAdherenceFreedom;
  if (transitionSize) body.transition_size = transitionSize;
  if (colorImage) body.color_image = colorImage;
  if (seed) body.seed = seed;
  if (lowerReferenceImage) body.lower_reference_image = lowerReferenceImage;
  if (transitionReferenceImage) body.transition_reference_image = transitionReferenceImage;

  return body;
}


async function parseJsonResponse(bodyStream) {
  const raw = await bodyStream.text();
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    err.rawResponse = raw;
    throw err;
  }
}

// add to options: { allowUpperBaseUid: true }
async function startTilesetJob(baseUrl, apiKey, requestBody, { allowUpperBaseUid } = {}) {
  const start = async (body) => request(`${baseUrl}/create-tileset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  // first try (maybe includes upper_base_tile_id)
  let { statusCode, body } = await start(requestBody);
  let payload = await parseJsonResponse(body);

  // If 422 and we tried the probe, strip it and retry once
  if (statusCode === 422 && allowUpperBaseUid && 'upper_base_tile_id' in requestBody) {
    const cloned = { ...requestBody };
    delete cloned.upper_base_tile_id;
    ({ statusCode, body } = await start(cloned));
    payload = await parseJsonResponse(body);
  }

  if (statusCode !== 202 && statusCode !== 200) {
    const err = new Error(`PixelLab create-tileset failed with status ${statusCode}`);
    err.statusCode = statusCode; err.response = payload; err.requestBody = requestBody;
    throw err;
  }

  const { background_job_id: jobId, tileset_id: tilesetId } = payload || {};
  if (!jobId || !tilesetId) throw new Error('create-tileset missing job or tileset id');
  return { jobId, tilesetId, raw: payload };
}


async function fetchTileset(baseUrl, apiKey, tilesetId, attempts, delayMs, maxWaitMs = DEFAULT_MAX_WAIT_MS) {
  const deadline = Date.now() + Math.max(1, maxWaitMs);
  let attempt = 0;

  while (Date.now() < deadline) {
    const { statusCode, body } = await request(`${baseUrl}/tilesets/${tilesetId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const payload = await parseJsonResponse(body);

    if (statusCode === 200) return payload;

    // 423 = still generating (spec)
    if (statusCode === 423) {
      // Try to honor an ETA if provided in the response string
      // e.g. "Tileset is still being generated. ETA: 91 seconds."
      const detail = typeof payload?.detail === 'string' ? payload.detail : '';
      const m = detail.match(/ETA:\s*(\d+)/i);
      const etaMs = m ? (Number(m[1]) || 0) * 1000 : 0;

      const waitMs = Math.max(delayMs, etaMs ? etaMs + 5000 : 0); // add 5s cushion if ETA present
      const until = Date.now() + waitMs;
      // Guard against exceeding deadline
      await delay(Math.max(0, Math.min(waitMs, Math.max(0, deadline - Date.now()))));
      attempt += 1;
      continue;
    }

    // Some deployments may use 202/404 transiently — backoff a bit
    if (statusCode === 202 || statusCode === 404) {
      attempt += 1;
      // Exponential-ish backoff with cap and jitter
      const backoff = Math.min(8, Math.max(1, attempt));
      const jitter = Math.floor(Math.random() * 400);
      const waitMs = Math.max(delayMs, backoff * delayMs) + jitter;
      await delay(Math.max(0, Math.min(waitMs, Math.max(0, deadline - Date.now()))));
      continue;
    }

    const error = new Error(`Failed to fetch PixelLab tileset ${tilesetId} (status ${statusCode})`);
    error.statusCode = statusCode;
    error.response = payload;
    throw error;
  }

  const error = new Error(`Timed out waiting for PixelLab tileset ${tilesetId} (max ${Math.round(maxWaitMs/1000)}s)`);
  error.statusCode = 423;
  throw error;
}



function findBaseTile(tileset, terrainKey) {
  if (!tileset || !Array.isArray(tileset.tiles)) {
    return null;
  }
  return tileset.tiles.find((tile) => {
    const corners = tile?.corners || {};
    return (
      corners.NW === terrainKey &&
      corners.NE === terrainKey &&
      corners.SW === terrainKey &&
      corners.SE === terrainKey
    );
  });
}

function decodeTileImage(tile) {
  if (!tile) {
    return null;
  }
  const image = tile.image || tile.image_data;
  if (!image) {
    return null;
  }

  if (typeof image === 'string') {
    const match = image.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
    if (match) {
      return {
        buffer: Buffer.from(match[2], 'base64'),
        format: match[1].toLowerCase(),
      };
    }
    return {
      buffer: Buffer.from(image, 'base64'),
      format: 'png',
    };
  }

  if (typeof image === 'object') {
    const base64 = image.base64 || image.image_data || null;
    if (!base64) {
      return null;
    }
    if (base64.startsWith('data:image/')) {
      const [, data] = base64.split(',', 2);
      return {
        buffer: Buffer.from(data, 'base64'),
        format: (image.format || 'png').toLowerCase(),
      };
    }
    return {
      buffer: Buffer.from(base64, 'base64'),
      format: (image.format || 'png').toLowerCase(),
    };
  }

  return null;
}

function composeTilesetImage(tileset) {
  if (!tileset || !Array.isArray(tileset.tiles) || tileset.tiles.length === 0) return null;

  // 1) Decode all tiles as PNGs
  const decodedTiles = [];
  for (let i = 0; i < tileset.tiles.length; i += 1) {
    const tile = tileset.tiles[i];
    const img = decodeTileImage(tile); // uses your existing helper
    if (!img || !img.buffer) throw new Error(`Tileset compose: tile[${i}] has no decodable image`);
    if ((img.format || 'png').toLowerCase() !== 'png') {
      throw new Error(`Tileset compose: tile[${i}] is not PNG (got ${img.format})`);
    }
    const png = PNG.sync.read(img.buffer);
    decodedTiles.push(png);
  }
  if (!decodedTiles.length) return null;

  // 2) Validate uniform size
  const tileWidth = decodedTiles[0].width;
  const tileHeight = decodedTiles[0].height;
  if (!tileWidth || !tileHeight) return null;
  for (let i = 1; i < decodedTiles.length; i += 1) {
    if (decodedTiles[i].width !== tileWidth || decodedTiles[i].height !== tileHeight) {
      throw new Error(`Tileset compose: mismatched tile sizes at index ${i}`);
    }
  }

  // 3) Decide sheet grid (4x4 for 16 tiles; sqrt fallback otherwise)
  const total = decodedTiles.length;
  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);

  const sheet = new PNG({ width: tileWidth * columns, height: tileHeight * rows });

  // 4) Manual RGBA blit (no png.bitblt dependency)
  for (let index = 0; index < decodedTiles.length; index += 1) {
    const src = decodedTiles[index];
    const col = index % columns;
    const row = Math.floor(index / columns);
    const destX = col * tileWidth;
    const destY = row * tileHeight;

    const srcData = src.data;
    const dstData = sheet.data;
    const dstStride = sheet.width * 4;
    const srcStride = src.width * 4;

    for (let y = 0; y < tileHeight; y += 1) {
      const srcRow = y * srcStride;
      const dstRow = (destY + y) * dstStride + destX * 4;
      // copy this scanline (tileWidth pixels * 4 bytes per pixel)
      for (let x = 0; x < tileWidth; x += 1) {
        const s = srcRow + x * 4;
        const d = dstRow + x * 4;
        dstData[d]     = srcData[s];     // R
        dstData[d + 1] = srcData[s + 1]; // G
        dstData[d + 2] = srcData[s + 2]; // B
        dstData[d + 3] = srcData[s + 3]; // A
      }
    }
  }

  // 5) Encode sheet
  const buffer = PNG.sync.write(sheet);
  return { buffer, format: 'png' };
}



function resolveTilesetUrl(baseUrl, url) {
  if (!url) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (/^https?:/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/')) {
    return `${baseUrl}${trimmed}`;
  }
  return `${baseUrl}/${trimmed}`;
}

function decodeStringImage(value, fallbackFormat = 'png') {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:/i.test(trimmed)) {
    return { url: trimmed };
  }
  const dataUriMatch = trimmed.match(/^data:image\/([a-z0-9+]+);base64,(.+)$/i);
  if (dataUriMatch) {
    return {
      buffer: Buffer.from(dataUriMatch[2], 'base64'),
      format: dataUriMatch[1].toLowerCase(),
    };
  }
  try {
    const buffer = Buffer.from(trimmed, 'base64');
    if (buffer.length > 0) {
      return { buffer, format: fallbackFormat };
    }
  } catch (_) {
    return null;
  }
  return null;
}

function decodeImageFromValue(value, fallbackFormat = 'png') {
  if (!value && value !== 0) {
    return null;
  }
  if (Buffer.isBuffer(value)) {
    return { buffer: value, format: fallbackFormat };
  }
  if (typeof value === 'string') {
    return decodeStringImage(value, fallbackFormat);
  }
  if (typeof value === 'object') {
    const directCandidates = [
      value.image_data,
      value.image,
      value.base64,
      value.data,
      value.payload,
    ];
    for (const candidate of directCandidates) {
      const decoded = decodeImageFromValue(candidate, fallbackFormat);
      if (decoded) {
        return decoded;
      }
    }
    const urlCandidate = value.download_url || value.url || value.href || value.link;
    if (typeof urlCandidate === 'string' && urlCandidate.trim()) {
      return { url: urlCandidate.trim() };
    }
  }
  return null;
}

async function downloadImageFromUrl(url, apiKey) {
  if (!url) {
    throw new Error('Cannot download image without a URL');
  }
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  const { statusCode, headers: responseHeaders, body } = await request(url, { method: 'GET', headers });
  if (statusCode >= 400) {
    throw new Error(`Failed to download tileset image from ${url} (status ${statusCode})`);
  }
  const arrayBuffer = await body.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = responseHeaders['content-type'] || responseHeaders['Content-Type'] || '';
  const match = typeof contentType === 'string' ? contentType.match(/image\/([a-z0-9+]+)/i) : null;
  const format = match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
  return { buffer, format };
}

async function resolveTilesetImage(_baseUrl, _apiKey, tilesetId, tilesetResponse, _jobResult) {
  const tileset = tilesetResponse?.tileset;
  if (!tileset) throw new Error(`Tileset ${tilesetId} missing tileset payload`);
  const composed = composeTilesetImage(tileset);
  if (!composed) throw new Error(`Unable to compose tileset image for ${tilesetId}`);
  return composed;
}


function collectObsoleteNeighbourKeys(terrainDoc, otherTerrainDoc) {
  if (!terrainDoc || !terrainDoc.neighbours) {
    return [];
  }
  const otherId = otherTerrainDoc?._id ? otherTerrainDoc._id.toString() : null;
  const otherName = otherTerrainDoc?.name ? String(otherTerrainDoc.name).trim().toLowerCase() : null;
  const keys = terrainDoc.neighbours instanceof Map
    ? Array.from(terrainDoc.neighbours.keys())
    : Object.keys(terrainDoc.neighbours || {});

  return keys.filter((key) => {
    const str = String(key || '').trim();
    if (!str) return false;
    if (otherId && str === otherId) {
      return false;
    }
    const lowered = str.toLowerCase();
    if (otherId && lowered === otherId.toLowerCase()) {
      return true;
    }
    if (otherName && lowered === otherName) {
      return true;
    }
    return false;
  });
}

async function persistTilesetTiles(tilesetId, tiles = []) {
  if (!tilesetId) {
    return [];
  }
  const dir = path.join(TILESET_IMAGE_DIR, String(tilesetId));
  await fs.mkdir(dir, { recursive: true });
  const saved = [];

  for (let i = 0; i < tiles.length; i += 1) {
    try {
      const raw = decodeTileImage(tiles[i]);
      if (!raw || !raw.buffer) continue;
      const format = raw.format === 'jpeg' ? 'jpg' : raw.format || 'png';
      const tileId = tiles[i]?.id ? String(tiles[i].id) : `tile-${i}`;
      const safeName = tileId.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || `tile-${i}`;
      const filename = `${String(i).padStart(2, '0')}-${safeName}.${format}`;
      const absolutePath = path.join(dir, filename);
      await fs.writeFile(absolutePath, raw.buffer);
      const relativePath = path.relative(ROOT_DIR, absolutePath).replace(/\\/g, '/');
      saved.push({ index: i, tileId, path: relativePath });
    } catch (err) {
      console.warn('[PixelLab] failed to persist individual tile', err?.message || err);
    }
  }

  return saved;
}

async function persistTilesetImage(lowerTerrainId, upperTerrainId, buffer, format) {
  const safeFormat = format === 'jpeg' ? 'jpg' : format || 'png';
  const lower = lowerTerrainId ? String(lowerTerrainId) : 'lower';
  const upper = upperTerrainId ? String(upperTerrainId) : 'upper';
  const baseName = `${lower}-${upper}`
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || `tileset-${Date.now()}`;
  const filename = `${baseName}-${Date.now()}.${safeFormat}`;
  const absolutePath = path.join(TILESET_IMAGE_DIR, filename);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  const relativePath = path.relative(ROOT_DIR, absolutePath).replace(/\\/g, '/');
  return {
    absolutePath,
    relativePath,
  };
}

async function persistTextureImage(terrainId, buffer, format) {
  const safeFormat = format === 'jpeg' ? 'jpg' : format || 'png';
  const rawId = terrainId && typeof terrainId.toString === 'function' ? terrainId.toString() : String(terrainId || '');
  const normalizedId = rawId.replace(/[^a-z0-9_-]+/gi, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || `terrain-${Date.now()}`;
  const filename = `${normalizedId}.${safeFormat}`;
  const absolutePath = path.join(TERRAIN_IMAGE_DIR, filename);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  const relativePath = path.relative(ROOT_DIR, absolutePath).replace(/\\/g, '/');
  return {
    absolutePath,
    relativePath,
  };
}

async function applyTextureToTerrain(terrain, textureData) {
  if (!terrain || !textureData) {
    return null;
  }

  if (typeof terrain.save === 'function') {
    terrain.texture = textureData;
    if (typeof terrain.markModified === 'function') {
      terrain.markModified('texture');
    }
    await terrain.save();
    return terrain;
  }

  const identifier = terrain?._id ? terrain._id.toString() : null;
  if (!identifier) {
    return null;
  }

  return TerrainDAL.updateTexture(identifier.toString(), textureData);
}

function buildTextureRecord({ prompt, uid, imagePath }) {
  return {
    provider: 'PixelLab',
    prompt: prompt || '',
    imagePath: imagePath || '',
    reference: uid || '',
    generatedAt: new Date(),
  };
}

function shouldComposeIsoAtlas(opts) {
  // Option takes precedence: options.composeIsometric = true/false
  if (opts && typeof opts.composeIsometric === "boolean")
    return opts.composeIsometric;

  // Otherwise use env (defaults to true if unset)
  const v = process.env.PIXELLAB_COMPOSE_ISO;
  if (v == null) return true;
  return /^(1|true|yes)$/i.test(String(v).trim());
}

async function generateTileset(lowerTerrain, upperTerrain, options = {}) {
  const apiKey = process.env.PIXELLAB_API_KEY;
  if (!apiKey) throw new Error("PIXELLAB_API_KEY is not configured");

  const lowerDirective = buildTerrainDirective(lowerTerrain, "lower");
  const upperDirective = buildTerrainDirective(upperTerrain, "upper");

  const tilesetOptions = { ...(options || {}) };
  const neighbourContext = tilesetOptions.neighbourContext || {};
  delete tilesetOptions.neighbourContext;

  const requestBody = buildTilesetRequestBody(
    lowerDirective,
    upperDirective,
    tilesetOptions
  );
  // Remember what we ACTUALLY sent (only present if allowUpperBaseUid was true and a uid existed)
  const sentUpperUid = Object.prototype.hasOwnProperty.call(
    requestBody,
    "upper_base_tile_id"
  )
    ? requestBody.upper_base_tile_id
    : null;

  if (!requestBody.lower_description && !requestBody.lower_base_tile_id) {
    throw new Error("Lower terrain must provide either description or UID");
  }
  if (!requestBody.upper_description /* && !upper UID (not supported) */) {
    throw new Error("Upper terrain must provide a description");
  }

  const baseUrl = sanitizeBaseUrl();
  const {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxPollAttempts = DEFAULT_MAX_POLL_ATTEMPTS,
    fetchRetryAttempts = DEFAULT_FETCH_RETRY_ATTEMPTS,
    fetchRetryDelayMs = DEFAULT_FETCH_RETRY_DELAY_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
  } = tilesetOptions;

  // 1) Start async job
  const {
    jobId,
    tilesetId,
    raw: startPayload,
  } = await startTilesetJob(baseUrl, apiKey, requestBody);

  // 2) Poll the tileset resource itself (handle 423)
  const tilesetResponse = await fetchTileset(
    baseUrl,
    apiKey,
    tilesetId,
    fetchRetryAttempts,
    fetchRetryDelayMs,
    maxWaitMs
  );
  // Probe log
  if (sentUpperUid) {
    const returnedUpperUid =
      tilesetResponse?.metadata?.terrain_ids?.upper_base_tile_id || null;
    console.log(
      "[PixelLab][Probe] upper UID sent:",
      sentUpperUid,
      "returned:",
      returnedUpperUid
    );
  }

  // 3) Optional debug
  try {
    console.log(
      "[PixelLab] tilesetResponse keys",
      Object.keys(tilesetResponse || {})
    );
    if (tilesetResponse?.tileset)
      console.log(
        "[PixelLab] tileset keys",
        Object.keys(tilesetResponse.tileset)
      );
  } catch (_) {
    console.log("[PixelLab] unable to log tilesetResponse keys");
  }

  // 4) Gather metadata and save per-tile images
  const metadata = tilesetResponse?.metadata || {};
  const terrainPrompts = metadata.terrain_prompts || {};
  const terrainIds = metadata.terrain_ids || {};

  const tileset = tilesetResponse?.tileset;
  const savedTiles = await persistTilesetTiles(tilesetId, tileset?.tiles || []);
  if (savedTiles.length)
    console.log("[PixelLab] saved individual tiles", savedTiles.length);
  // Auto-compose a rectangular 4x4 isometric atlas once tiles are on disk
  // Track the composed atlas path so we can store it in the DB
  let isoImageRelativePath = null;
  if (savedTiles.length && shouldComposeIsoAtlas(tilesetOptions)) {
    if (!composeIsometricTileGrid) {
      console.warn(
        "[PixelLab][ISO] composer module not loaded; skipping isometric atlas."
      );
    } else {
      try {
        const iso = await composeIsometricTileGrid(tilesetId, { gridSize: 4 });
        console.log("[PixelLab][ISO] composed isometric atlas", {
          output: iso.outputPath,
          width: iso.width,
          height: iso.height,
          cell: `${iso.tileWidth}x${iso.tileHeight}`,
        });
        // Persist relative path (e.g., web/images/tilesets/<tilesetId>/isometric-tileset-map.png)
        try {
          const rel = path
            .relative(ROOT_DIR, iso.outputPath)
            .replace(/\\/g, "/");
          if (rel) isoImageRelativePath = rel;
        } catch (_) {
          // ignore; will fall back to non-ISO composed sheet path
        }
      } catch (err) {
        console.warn("[PixelLab][ISO] compose failed:", err?.message || err);
      }
    }
  }

  // 5) Save base tiles as terrain textures if we generated them
  const updates = [];

  if (lowerDirective.needsGeneration) {
    const lowerTile = findBaseTile(tileset, "lower");
    const lowerImage = decodeTileImage(lowerTile);
    if (!lowerTile || !lowerImage)
      throw new Error("Unable to locate base tile image for lower terrain");

    const { relativePath } = await persistTextureImage(
      lowerDirective.terrain?._id,
      lowerImage.buffer,
      lowerImage.format
    );
    const lowerUid =
      terrainIds.lower_base_tile_id || terrainIds.lower || lowerTile.id;
    const lowerTexture = buildTextureRecord({
      prompt: terrainPrompts.lower || lowerDirective.description,
      uid: lowerUid,
      imagePath: relativePath,
    });
    await applyTextureToTerrain(lowerDirective.terrain, lowerTexture);
    updates.push({
      role: "lower",
      terrainId: lowerDirective.terrain?._id?.toString(),
      texture: lowerTexture,
    });
  }

  if (upperDirective.needsGeneration) {
    const upperTile = findBaseTile(tileset, "upper");
    const upperImage = decodeTileImage(upperTile);
    if (!upperTile || !upperImage)
      throw new Error("Unable to locate base tile image for upper terrain");

    const { relativePath } = await persistTextureImage(
      upperDirective.terrain?._id,
      upperImage.buffer,
      upperImage.format
    );
    // NOTE: there may be an upper_base_tile_id in metadata (read-only); don't send it in requests.
    const upperUid =
      terrainIds.upper_base_tile_id || terrainIds.upper || upperTile.id;
    const upperTexture = buildTextureRecord({
      prompt: terrainPrompts.upper || upperDirective.description,
      uid: upperUid,
      imagePath: relativePath,
    });
    await applyTextureToTerrain(upperDirective.terrain, upperTexture);
    updates.push({
      role: "upper",
      terrainId: upperDirective.terrain?._id?.toString(),
      texture: upperTexture,
    });
  }

  // 6) Compose and persist an atlas/sheet locally from the tiles
  const tilesetImage = await resolveTilesetImage(
    baseUrl,
    apiKey,
    tilesetId,
    tilesetResponse,
    /* jobResult */ null
  );
  const { relativePath: tilesetImagePath } = await persistTilesetImage(
    lowerDirective.terrain?._id,
    upperDirective.terrain?._id,
    tilesetImage.buffer,
    tilesetImage.format
  );

  const transitionPrompt =
    metadata.transition_prompt ||
    metadata.transitionDescription ||
    requestBody.transition_description ||
    "";

  const tilesetTexture = buildTextureRecord({
    prompt: transitionPrompt,
    uid: tilesetId,
    // Prefer the isometric atlas path if available; otherwise fall back to composed sheet
    imagePath: isoImageRelativePath || tilesetImagePath,
  });

  // 7) Upsert Tileset doc and neighbour links
  const lowerId = lowerDirective.terrain?._id || null;
  const upperId = upperDirective.terrain?._id || null;

  let tilesetDocument = null;
  if (lowerId && upperId) {
    tilesetDocument = await TilesetDAL.findByPair(lowerId, upperId);
    if (tilesetDocument) {
      tilesetDocument.tilesetId = tilesetId;
      tilesetDocument.jobId = jobId;
      tilesetDocument.texture = tilesetTexture;
      await tilesetDocument.save();
    } else {
      tilesetDocument = await TilesetDAL.createTileset({
        lowerTerrain: lowerId,
        upperTerrain: upperId,
        tilesetId,
        jobId,
        texture: tilesetTexture,
      });
    }
  }

  updates.push({
    role: "tileset",
    tilesetId: tilesetDocument?._id?.toString() || null,
    texture: tilesetTexture,
  });

  if (lowerId && upperId && tilesetDocument?._id) {
    const lowerRemove = new Set(
      Array.isArray(neighbourContext.lowerRemoveKeys)
        ? neighbourContext.lowerRemoveKeys
            .map((k) => String(k || "").trim())
            .filter(Boolean)
        : []
    );
    const upperRemove = new Set(
      Array.isArray(neighbourContext.upperRemoveKeys)
        ? neighbourContext.upperRemoveKeys
            .map((k) => String(k || "").trim())
            .filter(Boolean)
        : []
    );

    const fallbackLower = collectObsoleteNeighbourKeys(
      lowerDirective.terrain,
      upperDirective.terrain
    );
    const fallbackUpper = collectObsoleteNeighbourKeys(
      upperDirective.terrain,
      lowerDirective.terrain
    );

    fallbackLower.forEach((k) => lowerRemove.add(k));
    fallbackUpper.forEach((k) => upperRemove.add(k));

    await TerrainDAL.setNeighbourTilesetByObjectId(
      lowerId,
      upperId,
      tilesetDocument._id,
      {
        removeKeys: Array.from(lowerRemove),
      }
    );
    await TerrainDAL.setNeighbourTilesetByObjectId(
      upperId,
      lowerId,
      tilesetDocument._id,
      {
        removeKeys: Array.from(upperRemove),
      }
    );
  }

  return {
    jobId,
    tilesetId,
    request: requestBody,
    startPayload,
    jobResult: null, // no background-jobs flow anymore
    tileset: tilesetResponse,
    tilesetTexture,
    tilesetDocument,
    updates,
  };
}


module.exports = {
  generateTileset,
};

