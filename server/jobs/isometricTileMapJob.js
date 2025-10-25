// server/jobs/isometricTileMapJob.js
"use strict";

const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

const ROOT_DIR = path.join(__dirname, "..", "..");
const TILESET_IMAGE_DIR = path.join(ROOT_DIR, "web", "images", "tilesets");

const DEFAULT_GRID_SIZE = 4; // 4x4 grid
const ROTATION_DEG = 45; // rotate to diamond
const ISO_Y_SCALE = 0.5; // vertical squash for 2:1 iso look
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

function isImageFile(name) {
  return /\.(png|jpg|jpeg|webp)$/i.test(name);
}

function sortByIndexPrefix(a, b) {
  // Prefer numeric prefixes like "00-*.png" .. "15-*.png"
  const ma = a.match(/^(\d+)[-_]/);
  const mb = b.match(/^(\d+)[-_]/);
  if (ma && mb) {
    const na = parseInt(ma[1], 10);
    const nb = parseInt(mb[1], 10);
    return na - nb || a.localeCompare(b);
  }
  if (ma) return -1;
  if (mb) return 1;
  return a.localeCompare(b);
}

/**
 * Determine original (square) tile size "s" from the first tile.
 * Ensures all source tiles are square and roughly same size.
 */
async function getBaseSquareSize(absPath) {
  const meta = await sharp(absPath).metadata();
  const { width, height } = meta || {};
  if (!width || !height)
    throw new Error(`Cannot read metadata for "${absPath}"`);
  if (width !== height)
    throw new Error(
      `Tile "${path.basename(absPath)}" is not square (${width}x${height})`
    );
  return width;
}

/**
 * Convert a single square tile (s x s) to an isometric diamond and
 * force its final bounding box to EXACTLY (2s x s), with no padding.
 * Corners will touch the cell edges when composited.
 */
async function toExactIsoCell(absPath, baseSize) {
  const cellW = baseSize * 2; // 2s
  const cellH = baseSize; // s

  // Correct combined affine: rotate 45° + scaleX=√2, scaleY=1/√2
  // T = [[1, -1], [0.5, 0.5]]
  const M = [
    [1, -1],
    [0.5, 0.5],
  ];

  // 1) Pad by 1px to avoid sampling "pure transparent" at borders (helps with alpha)
  const padded = await sharp(absPath)
    .ensureAlpha()
    .extend({
      top: 1,
      bottom: 1,
      left: 1,
      right: 1,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  // 2) One-pass affine with NEAREST (no blur, minimal halo)
  let { data: workBuf, info } = await sharp(padded)
    .affine(M, {
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      interpolator: "nearest",
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  let w = info.width;
  let h = info.height;

  // 3) If slightly larger than 2s×s, center-crop (NO resampling)
  if (w > cellW || h > cellH) {
    const left = Math.floor(Math.max(0, (w - cellW) / 2));
    const top = Math.floor(Math.max(0, (h - cellH) / 2));
    const extracted = await sharp(workBuf)
      .extract({
        left,
        top,
        width: Math.min(cellW, w),
        height: Math.min(cellH, h),
      })
      .png()
      .toBuffer({ resolveWithObject: true });
    workBuf = extracted.data;
    w = extracted.info.width;
    h = extracted.info.height;
  }

  // 4) Optional: alpha harden to kill any semi-transparent fringe (keeps edges crisp)
  const alphaMask = await sharp(workBuf)
    .extractChannel("alpha")
    .threshold(127)
    .toBuffer();
  const hardened = await sharp(workBuf)
    .removeAlpha()
    .joinChannel(alphaMask)
    .png()
    .toBuffer();

  // 5) If smaller than 2s×s, center on exact canvas (NO resampling)
  const cx = Math.max(0, Math.floor((cellW - w) / 2));
  const cy = Math.max(0, Math.floor((cellH - h) / 2));

  const { data, info: finalInfo } = await sharp({
    create: {
      width: cellW,
      height: cellH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: hardened, left: cx, top: cy }])
    .png()
    .toBuffer({ resolveWithObject: true });

  if (finalInfo.width !== cellW || finalInfo.height !== cellH) {
    throw new Error(
      `Unexpected iso tile dims ${finalInfo.width}x${finalInfo.height}, expected ${cellW}x${cellH}`
    );
  }

  return { buffer: data, width: cellW, height: cellH };
}







/**
 * Compose a rectangular NxN atlas of isometric tiles.
 * - Each source tile is assumed square (s x s).
 * - Each cell is exactly (2s x s).
 * - No padding; diamond corners touch cell edges.
 *
 * Output: web/images/tilesets/<tilesetId>/isometric-tileset-map.png
 */
async function composeIsometricTileGrid(tilesetId, options = {}) {
  if (!tilesetId)
    throw new Error("composeIsometricTileGrid requires a tilesetId");

  const gridSize = Number.isFinite(options.gridSize)
    ? options.gridSize
    : DEFAULT_GRID_SIZE;

  const folder = path.join(TILESET_IMAGE_DIR, String(tilesetId));
  const outputPath =
    options.outputPath || path.join(folder, "isometric-tileset-map.png");

  // 1) Gather tile files
  const entries = await fs.readdir(folder);
  // Exclude previously generated atlas if present (it won't have a numeric prefix)
  const files = entries.filter(isImageFile).sort(sortByIndexPrefix);

  const needed = gridSize * gridSize;
  if (files.length < needed) {
    throw new Error(
      `Tileset folder "${folder}" has ${files.length} images; need at least ${needed} for a ${gridSize}x${gridSize} grid.`
    );
  }
  const selected = files.slice(0, needed);

  // 2) Determine base square size "s" from the first tile; validate squares
  const baseSize = await getBaseSquareSize(path.join(folder, selected[0]));
  for (let i = 1; i < selected.length; i += 1) {
    const p = path.join(folder, selected[i]);
    const s = await getBaseSquareSize(p);
    if (s !== baseSize) {
      console.warn(
        `[isometricTileMapJob] Source tile size differs: ${path.basename(
          p
        )} is ${s}x${s}, expected ${baseSize}x${baseSize}`
      );
    }
  }

  // 3) Transform each tile to an exact (2s x s) cell (diamond touches edges)
  const cells = [];
  for (let i = 0; i < selected.length; i += 1) {
    const abs = path.join(folder, selected[i]);
    const tile = await toExactIsoCell(abs, baseSize);
    cells.push(tile);
  }

  const cellW = baseSize * 2;
  const cellH = baseSize;

  // 4) Atlas dimensions: NxN cells
  const finalWidth = gridSize * cellW;
  const finalHeight = gridSize * cellH;

  // 5) Build composite layers: simple rectangular placement, no padding
  const layers = [];
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const idx = row * gridSize + col;
      const left = col * cellW;
      const top = row * cellH;
      layers.push({ input: cells[idx].buffer, left, top });
    }
  }

  // 6) Write atlas
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await sharp({
    create: {
      width: finalWidth,
      height: finalHeight,
      channels: 4,
      background: TRANSPARENT,
    },
  })
    .composite(layers)
    .png()
    .toFile(outputPath);

  return {
    outputPath,
    width: finalWidth,
    height: finalHeight,
    tileWidth: cellW, // each cell width
    tileHeight: cellH, // each cell height
    tileCount: selected.length,
    gridSize,
  };
}

module.exports = {
  composeIsometricTileGrid,
  // Back-compat alias if older scripts import the old name:
  composeIsometricTilesetMap: composeIsometricTileGrid,
};

// --- CLI: node server/jobs/isometricTileMapJob.js <tilesetId> [gridSize]
if (require.main === module) {
  (async () => {
    try {
      const tilesetId = process.argv[2];
      const gridSize = Number(process.argv[3]) || DEFAULT_GRID_SIZE;
      if (!tilesetId)
        throw new Error(
          "Usage: node server/jobs/isometricTileMapJob.js <tilesetId> [gridSize]"
        );
      const result = await composeIsometricTileGrid(tilesetId, { gridSize });
      console.log("✅ Isometric rectangular grid composed:", result);
      console.log("Output:", result.outputPath);
    } catch (err) {
      console.error("❌ Compose failed:", err?.stack || err?.message || err);
      process.exit(1);
    }
  })();
}
