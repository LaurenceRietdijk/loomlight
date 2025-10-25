const TerrainDAL = require('../dal/terrainDAL');
const BiomeDAL = require('../dal/biomeDAL');
const pixelLabTilesetService = require('../services/pixelLabTilesetService');

/**
 * Terrain tile map job walks terrain neighbour relationships, generates PixelLab Wang tilesets
 * for the next unresolved pair, updates any missing terrain textures, and marks the pairing done.
 *
 * Selection strategy:
 *  - Look at biome documents to find terrain sets that co-exist.
 *  - Consider all unordered terrain pairs (a,b) from those sets.
 *  - Pick the first pair whose tileset is not yet implemented by checking
 *    lower.neighbours[upperId] for a valid TerrainTileset ObjectId.
 */
const OBJECT_ID_REGEX = /^[a-fA-F0-9]{24}$/;

function asString(value) {
  return value === undefined || value === null ? '' : String(value);
}

function isNeighbourPending(value) {
  if (value === false || value === 0 || value === '' || value === null || value === undefined) {
    return true;
  }
  if (value === true) {
    return false;
  }
  if (typeof value === 'number') {
    return value === 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return true;
    }
    const lowered = trimmed.toLowerCase();
    if (lowered === 'true') {
      return false;
    }
    if (lowered === 'false' || lowered === '0') {
      return true;
    }
    return !OBJECT_ID_REGEX.test(trimmed);
  }
}

function normaliseEntries(neighboursField) {
  if (!neighboursField) {
    return [];
  }

  if (typeof neighboursField.entries === 'function') {
    return Array.from(neighboursField.entries());
  }

  if (typeof neighboursField === 'object') {
    return Object.entries(neighboursField);
  }

  return [];
}

async function fetchNextTerrainTileMapTarget() {
  const [terrains, biomes] = await Promise.all([
    TerrainDAL.getTerrains(),
    BiomeDAL.getBiomes(),
  ]);

  if (!Array.isArray(terrains) || terrains.length === 0) {
    return null;
  }

  const byId = new Map();
  for (const t of terrains) {
    const id = t && t._id ? String(t._id) : '';
    if (id) byId.set(id, t);
  }

  // Gather unordered terrain pairs present together in any biome
  const pairSet = new Set(); // key: `${aId}|${bId}` with aId < bId
  if (Array.isArray(biomes)) {
    for (const b of biomes) {
      const arr = Array.isArray(b && b.terrains) ? b.terrains.map((x) => String(x)).filter(Boolean) : [];
      if (arr.length < 2) continue;
      const uniq = Array.from(new Set(arr));
      for (let i = 0; i < uniq.length; i++) {
        for (let j = i + 1; j < uniq.length; j++) {
          const a = uniq[i];
          const c = uniq[j];
          const aId = a < c ? a : c;
          const bId = a < c ? c : a;
          if (byId.has(aId) && byId.has(bId)) {
            pairSet.add(`${aId}|${bId}`);
          }
        }
      }
    }
  }

  if (!pairSet.size) {
    return null;
  }

  // Sort deterministically and pick first unresolved
  const sortedPairs = Array.from(pairSet).sort((p, q) => p.localeCompare(q));
  for (const key of sortedPairs) {
    const [lowerId, upperId] = key.split('|');
    const lower = byId.get(lowerId);
    const upper = byId.get(upperId);
    if (!lower || !upper) continue;

    const entries = normaliseEntries(lower.neighbours);
    const found = entries.find(([k]) => String(k) === upperId);
    const flag = found ? found[1] : undefined;
    if (!isNeighbourPending(flag)) {
      // already implemented
      continue;
    }

    return {
      baseTerrain: lower,
      baseTerrainId: lowerId,
      baseTerrainName: asString(lower.name || lower._id),
      neighbourTerrain: upper,
      neighbourTerrainId: upperId,
      neighbourTerrainName: asString(upper.name || upper._id),
      neighbourKey: upperId,
    };
  }

  return null;
}

function collectIdentifiers(terrain) {
  if (!terrain) {
    return [];
  }
  return [terrain._id ? terrain._id.toString() : '', terrain.name]
    .map((value) => asString(value).toLowerCase())
    .filter(Boolean);
}

function findExistingNeighbourKey(sourceTerrain, targetTerrain) {
  if (!sourceTerrain || !targetTerrain) {
    return null;
  }
  const identifiers = new Set(collectIdentifiers(targetTerrain));
  if (!identifiers.size) {
    return null;
  }
  const entries = normaliseEntries(sourceTerrain.neighbours);
  for (const [key] of entries) {
    const normalisedKey = asString(key).toLowerCase();
    if (!normalisedKey) {
      continue;
    }
    if (identifiers.has(normalisedKey)) {
      return key;
    }
  }
  return null;
}

async function generateNextTerrainTileset(options = {}) {
  const target = await fetchNextTerrainTileMapTarget();
  if (!target) {
    return null;
  }

  const { tilesetOptions: explicitTilesetOptions = {} } = options;

  const { baseTerrain, neighbourTerrain, neighbourKey } = target;
  if (!baseTerrain || !neighbourTerrain) {
    throw new Error('Unable to resolve both terrain documents for tileset generation.');
  }

  const reverseKey = findExistingNeighbourKey(neighbourTerrain, baseTerrain);

  const existingContext = explicitTilesetOptions.neighbourContext || {};
  const lowerRemove = new Set(
    Array.isArray(existingContext.lowerRemoveKeys)
      ? existingContext.lowerRemoveKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [],
  );
  const upperRemove = new Set(
    Array.isArray(existingContext.upperRemoveKeys)
      ? existingContext.upperRemoveKeys.map((key) => String(key || '').trim()).filter(Boolean)
      : [],
  );
  if (neighbourKey) {
    lowerRemove.add(String(neighbourKey));
  }
  if (reverseKey) {
    upperRemove.add(String(reverseKey));
  }
  const tilesetOptions = {
    ...explicitTilesetOptions,
    neighbourContext: {
      ...existingContext,
      lowerRemoveKeys: Array.from(lowerRemove),
      upperRemoveKeys: Array.from(upperRemove),
    },
  };

  const tilesetResult = await pixelLabTilesetService.generateTileset(
    baseTerrain,
    neighbourTerrain,
    tilesetOptions,
  );

  return {
    target: {
      baseTerrainId: target.baseTerrainId,
      baseTerrainName: target.baseTerrainName,
      neighbourTerrainId: target.neighbourTerrainId,
      neighbourTerrainName: target.neighbourTerrainName,
      neighbourKey: target.neighbourKey,
    },
    tilesetJob: tilesetResult,
  };
}

module.exports = {
  fetchNextTerrainTileMapTarget,
  generateNextTerrainTileset,
};
