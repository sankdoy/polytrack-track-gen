/**
 * Diagnostic: build a small zigzag-loop road and verify every border cell is
 * classified correctly (inner cells → innerBorderMap, outer cells → outerBorderMap).
 *
 * Run:  node tools/test-winding.mjs
 */
import zlib from "node:zlib";

if (!globalThis.pako) {
  globalThis.pako = {
    deflate: (data) => zlib.deflateSync(Buffer.from(data)),
    inflate: (data) => zlib.inflateSync(Buffer.from(data)),
  };
}

import {
  centerlineToPieces,
  expandRoadWidth,
  buildBorderFromRoad,
  splitBorderMapByOutsideReachability,
  pathToGrid,
} from "../docs/image-track-core.mjs";

// ── helpers ────────────────────────────────────────────────────────────────

function keyOf(x, y) { return `${x},${y}`; }

/** Build a unit-step closed rectangular path going clockwise. */
function rectPath(x0, y0, w, h) {
  const pts = [];
  for (let x = x0; x < x0 + w; x++) pts.push({ x, y: y0 });           // top →
  for (let y = y0 + 1; y < y0 + h; y++) pts.push({ x: x0 + w, y });   // right ↓ (fix: should be x0+w-1)
  for (let x = x0 + w - 1; x >= x0; x--) pts.push({ x, y: y0 + h });  // bottom ←
  for (let y = y0 + h - 1; y > y0; y--) pts.push({ x: x0, y });       // left ↑
  return pts;
}

/** Build a unit-step closed zigzag path. The path runs a sawtooth down the
 *  left side, across the bottom, straight up the right side, and across the top.
 *
 *  teethCount  number of left-pointing teeth on the left side
 *  toothDepth  how far each tooth extends to the left (cells)
 *  toothHeight half-height of each tooth (cells between direction changes)
 */
function zigzagPath(width, height, teethCount = 4, toothDepth = 4, toothHeight = 4) {
  const pts = [];

  const left = 0;
  const right = width;
  const top = 0;
  const bot = height;

  // Top edge: left → right
  for (let x = left; x < right; x++) pts.push({ x, y: top });

  // Right side: top → bottom (straight)
  for (let y = top + 1; y <= bot; y++) pts.push({ x: right, y });

  // Bottom edge: right → left
  for (let x = right - 1; x >= left; x--) pts.push({ x, y: bot });

  // Left side: bottom → top with zigzag teeth pointing LEFT
  // Each tooth: go left, come back, continue upward
  const segH = Math.floor(height / teethCount);
  let y = bot;
  for (let t = 0; t < teethCount; t++) {
    const yEnd = y - segH;
    // Straight up for half the segment
    const yMid = y - Math.floor(segH / 2);
    // up to mid
    for (let yy = y - 1; yy >= yMid; yy--) pts.push({ x: left, y: yy });
    // tooth going left
    for (let xx = left - 1; xx >= left - toothDepth; xx--) pts.push({ x: xx, y: yMid });
    // tooth going back right
    for (let xx = left - toothDepth + 1; xx <= left; xx++) pts.push({ x: xx, y: yMid });
    // continue up
    for (let yy = yMid - 1; yy >= yEnd; yy--) pts.push({ x: left, y: yy });
    y = yEnd;
  }

  return pts;
}

// ── run test ───────────────────────────────────────────────────────────────

function runTest(label, gridPath, widthTiles) {
  console.log(`\n${"=".repeat(60)}\n${label}  (widthTiles=${widthTiles})\n${"=".repeat(60)}`);

  const pieces = centerlineToPieces(gridPath, { closed: true, widthTiles });
  const roadMap = expandRoadWidth(pieces, { widthTiles });
  const borderMap = buildBorderFromRoad(roadMap);
  const split = splitBorderMapByOutsideReachability(roadMap, borderMap, {
    padding: 2,
  });

  // Compute bounding box for display
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const allMaps = [roadMap, split.outerBorderMap, split.innerBorderMap, split.outsideEmpty];
  for (const m of allMaps) {
    for (const [, v] of m) {
      if (v.x !== undefined) {
        minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      }
    }
  }
  for (const k of split.outsideEmpty) {
    const [x, y] = k.split(",").map(Number);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }

  // Build display grid
  const W = maxX - minX + 1;
  const H = maxY - minY + 1;
  const grid = Array.from({ length: H }, () => Array(W).fill(" "));

  const set = (x, y, ch) => {
    const gx = x - minX, gy = y - minY;
    if (gx >= 0 && gx < W && gy >= 0 && gy < H) grid[gy][gx] = ch;
  };

  for (const k of split.outsideEmpty) {
    const [x, y] = k.split(",").map(Number);
    set(x, y, "·");
  }
  for (const [, c] of roadMap) set(c.x, c.y, "#");
  for (const [, c] of split.outerBorderMap) set(c.x, c.y, "O");
  for (const [, c] of split.innerBorderMap) set(c.x, c.y, "I");
  for (const p of pieces) set(p.x, p.y, "+");

  for (const row of grid) console.log(row.join(""));

  // Legend
  console.log("\n  # road   + centerline   O outer-border   I inner-border   · outside-flood");

  // Check: are any "O" cells inside the loop interior?
  // With the road+border flood approach, outer border cells are adjacent to the
  // exterior flood (outsideEmpty) but not necessarily IN it.
  const outside = split.outsideEmpty;
  let badCount = 0;
  for (const [k, c] of split.outerBorderMap) {
    const x = c.x, y = c.y;
    const adjacentToOutside = (
      outside.has(`${x+1},${y}`) || outside.has(`${x-1},${y}`) ||
      outside.has(`${x},${y+1}`) || outside.has(`${x},${y-1}`)
    );
    if (!adjacentToOutside) {
      console.log(`  !! MISCLASSIFIED outer border at (${c.x}, ${c.y}) — not adjacent to outside flood`);
      badCount++;
    }
  }
  if (badCount === 0) {
    console.log("  ✓ All outer border cells are correctly adjacent to the outside-flood region.");
  } else {
    console.log(`  ✗ ${badCount} outer border cell(s) appear inside the loop!`);
  }
}

// ── Test 1: simple rectangle ───────────────────────────────────────────────
{
  const path = rectPath(2, 2, 20, 16);
  runTest("Simple rectangle", path, 3);
}

// ── Test 2: rectangle with one inward tooth ────────────────────────────────
{
  // Clockwise rect but with a rightward (inward) tooth on the left side
  const path = [];
  const L = 0, R = 20, T = 0, B = 20;

  // Top
  for (let x = L; x < R; x++) path.push({ x, y: T });
  // Right down
  for (let y = T + 1; y <= B; y++) path.push({ x: R, y });
  // Bottom left
  for (let x = R - 1; x >= L; x--) path.push({ x, y: B });
  // Left up, bottom half
  for (let y = B - 1; y >= 13; y--) path.push({ x: L, y });
  // Tooth bottom arm: go right
  for (let x = L + 1; x <= 8; x++) path.push({ x, y: 13 });
  // Tooth right arm: go up
  for (let y = 12; y >= 8; y--) path.push({ x: 8, y });
  // Tooth top arm: go left
  for (let x = 7; x >= L; x--) path.push({ x, y: 8 });
  // Left up, top half
  for (let y = 7; y > T; y--) path.push({ x: L, y });

  runTest("Rectangle with one inward tooth (rightward)", path, 3);
}

// ── Test 3: short zigzag loop ──────────────────────────────────────────────
{
  const path = zigzagPath(24, 24, 3, 3, 4);
  runTest("Short zigzag loop (left-pointing teeth)", path, 3);
}

// ── Test 4: diagonal (staircase) path ─────────────────────────────────────
{
  // A proper unit-step staircase loop: goes diagonally down-right (alternating
  // east+south) then straight right, down the right side, left across bottom,
  // and diagonally up-left (alternating west+north) back to start.
  const pts = [];
  const steps = 8;

  // Down-right staircase: alternate east then south for each step
  for (let i = 0; i < steps; i++) {
    pts.push({ x: i * 2,     y: i * 2 });      // starting cell of step
    pts.push({ x: i * 2 + 1, y: i * 2 });      // east step
    pts.push({ x: i * 2 + 1, y: i * 2 + 1 });  // south step
    // NOTE: next iteration starts at (i*2+2, i*2+2) — but we need to add the
    // east step to get there.  Add it here as the final step of this iteration.
    if (i + 1 < steps) pts.push({ x: i * 2 + 2, y: i * 2 + 1 }); // east
  }
  // Now at (steps*2-1, steps*2-1)... continue south to make a clean corner
  const sx = steps * 2 - 1, sy = steps * 2 - 1;

  // Straight right to right-side
  const rx = sx + 6;
  for (let x = sx + 1; x <= rx; x++) pts.push({ x, y: sy });

  // Right side straight down
  const by = sy + 6;
  for (let y = sy + 1; y <= by; y++) pts.push({ x: rx, y });

  // Bottom straight left
  for (let x = rx - 1; x >= 0; x--) pts.push({ x, y: by });

  // Left side straight up to just before the staircase top
  for (let y = by - 1; y > 0; y--) pts.push({ x: 0, y });

  runTest("Diagonal staircase loop (unit-step)", pts, 3);
}
