// Slice the ultimate sheets into animation strips and append them to the
// existing public/sprites manifest. A Node port of the ultimate path that
// tools/slice_frames.py deliberately skipped — the sheets DO slice cleanly with
// tight-crop + feet-anchor (verified visually). Only the 3 ult strips are
// (re)generated; the 15 existing strips and their manifest entries are left
// untouched, and per-character `bodyPx` is preserved so the ult renders at the
// same on-screen size as the other actions.
//
// Requires: pngjs (dev dep). Run from the repo root:  node tools/slice_ultimates.mjs
import fs from 'fs';
import path from 'path';
import { PNG } from 'pngjs';

const ASSETS = 'assets';
const OUT = 'public/sprites';
const PAD = 8;
const BOTTOM_PAD = 6;

// (rows, cols) per sheet stem — same hardcoded grid as slice_frames.py.
const GRID = {
  versper_idle: [1, 5], vesper_attack: [2, 4], vesper_down: [1, 5],
  vesper_hit: [1, 4], vesper_skill: [2, 5], vesper_ultimate: [2, 4],
  mawgrim_attack: [2, 4], mawgrim_down: [2, 3], mawgrim_hit: [1, 4],
  mawgrim_idle: [2, 4], mawgrim_skill: [2, 4], mawgrim_ult: [2, 4],
  pyra_attack: [2, 4], pyra_down: [2, 3], pyra_hit: [1, 4],
  pyra_idle: [2, 4], pyra_skill: [2, 5], pyra_ult: [2, 4],
};
const ULT_PLAYBACK = { fps: 12, loop: false };

const stemOf = (p) => path.basename(p, '.png');
const actionOf = (stem) => {
  const n = stem.toLowerCase();
  for (const a of ['idle', 'attack', 'skill', 'hit', 'down']) if (n.includes(a)) return a;
  if (n.includes('ult')) return 'ultimate';
  return 'unknown';
};
const charOf = (p) => path.basename(path.dirname(p)).toLowerCase();
const A = (png, x, y) => png.data[(y * png.width + x) * 4 + 3];

/** Bounding box of alpha>16 pixels within [x0,x1) × [y0,y1); null if empty. */
function bbox(png, x0, y0, x1, y1) {
  let bx0 = x1, by0 = y1, bx1 = x0, by1 = y0, any = false;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (A(png, x, y) > 16) {
        any = true;
        if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
        if (y < by0) by0 = y; if (y > by1) by1 = y;
      }
  return any ? [bx0, by0, bx1 + 1, by1 + 1] : null;
}

/** Vertical content extent of the whole sheet (for per-figure scale). */
function contentExtentY(png) {
  const bb = bbox(png, 0, 0, png.width, png.height);
  return bb ? bb[3] - bb[1] : png.height;
}

/** Tight-cropped figure cells from an R×C equal division of the content area,
 * row-major. Returns [{x,y,w,h}] sub-rects in source coordinates. */
function cells(png, rows, cols) {
  const g = bbox(png, 0, 0, png.width, png.height);
  if (!g) return [];
  const [gx0, gy0, gx1, gy1] = g;
  const cw = (gx1 - gx0) / cols, ch = (gy1 - gy0) / rows;
  const out = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor(gx0 + c * cw), y0 = Math.floor(gy0 + r * ch);
      const x1 = Math.floor(gx0 + (c + 1) * cw), y1 = Math.floor(gy0 + (r + 1) * ch);
      const bb = bbox(png, x0, y0, x1, y1);
      if (bb) out.push({ x: bb[0], y: bb[1], w: bb[2] - bb[0], h: bb[3] - bb[1] });
    }
  return out;
}

/** Copy a sub-rect of `src` into a fresh RGBA buffer. */
function cropOf(src, { x, y, w, h }) {
  const buf = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    src.data.copy(buf, row * w * 4, ((y + row) * src.width + x) * 4, ((y + row) * src.width + x + w) * 4);
  }
  return { w, h, data: buf };
}

/** Bilinear downscale of an RGBA crop by factor k (<1). */
function resize(crop, k) {
  const w = Math.max(1, Math.round(crop.w * k)), h = Math.max(1, Math.round(crop.h * k));
  const out = Buffer.alloc(w * h * 4);
  for (let oy = 0; oy < h; oy++)
    for (let ox = 0; ox < w; ox++) {
      const sx = (ox + 0.5) / k - 0.5, sy = (oy + 0.5) / k - 0.5;
      const x0 = Math.max(0, Math.floor(sx)), y0 = Math.max(0, Math.floor(sy));
      const x1 = Math.min(crop.w - 1, x0 + 1), y1 = Math.min(crop.h - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 4; c++) {
        const p = (xx, yy) => crop.data[(yy * crop.w + xx) * 4 + c];
        const top = p(x0, y0) * (1 - fx) + p(x1, y0) * fx;
        const bot = p(x0, y1) * (1 - fx) + p(x1, y1) * fx;
        out[(oy * w + ox) * 4 + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  return { w, h, data: out };
}

const sheetPath = (char, stem) => {
  for (const ext of [path.join(ASSETS, char, `${stem}.png`)]) if (fs.existsSync(ext)) return ext;
  // directory case may differ (Vesper); search case-insensitively
  const dir = fs.readdirSync(ASSETS).find((d) => d.toLowerCase() === char);
  return dir ? path.join(ASSETS, dir, `${stem}.png`) : null;
};

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'sprites.json'), 'utf8'));

  // Per-character reference scale = min per-figure vertical extent across all
  // of that char's actions (matches slice_frames.py normalization).
  const allSheets = [];
  for (const dir of fs.readdirSync(ASSETS)) {
    const abs = path.join(ASSETS, dir);
    if (!fs.statSync(abs).isDirectory() || dir === '_originals') continue;
    for (const f of fs.readdirSync(abs)) if (f.endsWith('.png')) allSheets.push(path.join(abs, f));
  }
  const charRef = {};
  for (const p of allSheets) {
    const stem = stemOf(p), grid = GRID[stem];
    if (!grid) continue;
    const png = PNG.sync.read(fs.readFileSync(p));
    const figScale = contentExtentY(png) / grid[0];
    const c = charOf(p);
    charRef[c] = Math.min(charRef[c] ?? Infinity, figScale);
  }

  for (const p of allSheets) {
    const stem = stemOf(p);
    if (actionOf(stem) !== 'ultimate' || !GRID[stem]) continue;
    const char = charOf(p);
    const [rows, cols] = GRID[stem];
    const png = PNG.sync.read(fs.readFileSync(p));
    let crops = cells(png, rows, cols).map((r) => cropOf(png, r));
    const figScale = contentExtentY(png) / rows;
    const k = charRef[char] / figScale;
    if (k < 0.98) crops = crops.map((cr) => resize(cr, k));

    const cellW = Math.max(...crops.map((c) => c.w)) + PAD * 2;
    const cellH = Math.max(...crops.map((c) => c.h)) + PAD + BOTTOM_PAD;
    const strip = new PNG({ width: cellW * crops.length, height: cellH });
    strip.data.fill(0);
    crops.forEach((cr, i) => {
      const ox = i * cellW + ((cellW - cr.w) >> 1);
      const oy = cellH - BOTTOM_PAD - cr.h;
      for (let y = 0; y < cr.h; y++)
        cr.data.copy(strip.data, ((oy + y) * strip.width + ox) * 4, y * cr.w * 4, (y + 1) * cr.w * 4);
    });

    const key = `${char}_ultimate`;
    fs.writeFileSync(path.join(OUT, `${key}.png`), PNG.sync.write(strip));
    manifest.strips[key] = {
      char, action: 'ultimate',
      frameWidth: cellW, frameHeight: cellH,
      frames: crops.length, fps: ULT_PLAYBACK.fps, loop: ULT_PLAYBACK.loop,
    };
    console.log(`  ${key}: ${rows}x${cols} -> ${crops.length} frames, cell ${cellW}x${cellH} (k=${k.toFixed(3)})`);
  }

  fs.writeFileSync(path.join(OUT, 'sprites.json'), JSON.stringify(manifest, null, 2));
  console.log('Updated sprites.json with ultimate strips.');
}

main();
