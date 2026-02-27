/**
 * Test: does the road+border flood approach correctly classify a thin diagonal
 * hairpin loop (the kind produced when the user draws a diagonal line with
 * closeLoop=true)?
 */
import zlib from "node:zlib";
if (!globalThis.pako) {
  globalThis.pako = {
    deflate: (d) => zlib.deflateSync(Buffer.from(d)),
    inflate: (d) => zlib.inflateSync(Buffer.from(d)),
  };
}

import {
  centerlineToPieces,
  expandRoadWidth,
  buildBorderFromRoad,
  splitBorderMapByOutsideReachability,
} from "../docs/image-track-core.mjs";

function keyOf(x, y) { return `${x},${y}`; }

function cardinalLine(a, b) {
  const out = [{ x: a.x, y: a.y }];
  let x = a.x, y = a.y;
  while (x !== b.x || y !== b.y) {
    const dx = b.x - x, dy = b.y - y;
    if (dx !== 0 && dy !== 0) {
      if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx);
      else y += Math.sign(dy);
    } else if (dx !== 0) x += Math.sign(dx);
    else y += Math.sign(dy);
    out.push({ x, y });
  }
  return out;
}

// Build a thin diagonal loop: A → B (outbound) then B → A (closing, via cardinalLine)
// This is exactly what closeLoop=true does with a straight diagonal image.
function buildThinDiagonalLoop(ax, ay, bx, by) {
  const outbound = cardinalLine({ x: ax, y: ay }, { x: bx, y: by });
  const returning = cardinalLine({ x: bx, y: by }, { x: ax, y: ay });
  // Remove duplicate start/end
  return [...outbound, ...returning.slice(1, -1)];
}

// Test 1: small diagonal loop (6x4)
{
  const pts = buildThinDiagonalLoop(0, 0, 6, 4);
  const widthTiles = 3;
  const pieces = centerlineToPieces(pts, { closed: true, widthTiles });
  const roadMap = expandRoadWidth(pieces, { widthTiles });
  const borderMap = buildBorderFromRoad(roadMap);
  const split = splitBorderMapByOutsideReachability(roadMap, borderMap, { padding: 2 });

  let badCount = 0;
  for (const [k, c] of split.outerBorderMap) {
    const x = c.x, y = c.y;
    const adjacentToOutside = (
      split.outsideEmpty.has(keyOf(x+1,y)) || split.outsideEmpty.has(keyOf(x-1,y)) ||
      split.outsideEmpty.has(keyOf(x,y+1)) || split.outsideEmpty.has(keyOf(x,y-1))
    );
    if (!adjacentToOutside) badCount++;
  }

  console.log(`\nTest 1: small diagonal loop (A=(0,0)→B=(6,4))`);
  console.log(`  Road: ${roadMap.size} cells, Border: ${borderMap.size} cells`);
  console.log(`  Outer border: ${split.outerBorderMap.size}, Inner border: ${split.innerBorderMap.size}`);
  console.log(badCount === 0
    ? "  ✓ All outer border cells correctly adjacent to outside."
    : `  ✗ ${badCount} outer border cells NOT adjacent to outside.`);
}

// Test 2: larger diagonal (matching broken track: (-32,-21)→(31,22))
{
  const pts = buildThinDiagonalLoop(-32, -21, 31, 22);
  const widthTiles = 3;
  const pieces = centerlineToPieces(pts, { closed: true, widthTiles });
  const roadMap = expandRoadWidth(pieces, { widthTiles });
  const borderMap = buildBorderFromRoad(roadMap);
  const split = splitBorderMapByOutsideReachability(roadMap, borderMap, { padding: 2 });

  let badCount = 0;
  for (const [k, c] of split.outerBorderMap) {
    const x = c.x, y = c.y;
    const adjacentToOutside = (
      split.outsideEmpty.has(keyOf(x+1,y)) || split.outsideEmpty.has(keyOf(x-1,y)) ||
      split.outsideEmpty.has(keyOf(x,y+1)) || split.outsideEmpty.has(keyOf(x,y-1))
    );
    if (!adjacentToOutside) badCount++;
  }

  console.log(`\nTest 2: large diagonal loop ((-32,-21)→(31,22))`);
  console.log(`  Road: ${roadMap.size} cells, Border: ${borderMap.size} cells`);
  console.log(`  Outer border: ${split.outerBorderMap.size}, Inner border: ${split.innerBorderMap.size}`);
  console.log(badCount === 0
    ? "  ✓ All outer border cells correctly adjacent to outside."
    : `  ✗ ${badCount} outer border cells NOT adjacent to outside.`);

  // Show a few inner border positions to verify they're in the right place
  const innerCells = [...split.innerBorderMap.values()];
  if (innerCells.length > 0) {
    console.log(`  Inner border cells (first 5):`);
    for (const c of innerCells.slice(0, 5)) {
      console.log(`    (${c.x},${c.y})`);
    }
  } else {
    console.log("  (no inner border cells — track may be open/degenerate)");
  }
}

// Test 3: Show ASCII map of small diagonal loop
{
  const pts = buildThinDiagonalLoop(0, 0, 12, 8);
  const widthTiles = 3;
  const pieces = centerlineToPieces(pts, { closed: true, widthTiles });
  const roadMap = expandRoadWidth(pieces, { widthTiles });
  const borderMap = buildBorderFromRoad(roadMap);
  const split = splitBorderMapByOutsideReachability(roadMap, borderMap, { padding: 2 });

  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for (const c of [...roadMap.values(),...borderMap.values()]) {
    minX=Math.min(minX,c.x);maxX=Math.max(maxX,c.x);
    minY=Math.min(minY,c.y);maxY=Math.max(maxY,c.y);
  }

  console.log(`\nTest 3: ASCII map of (0,0)→(12,8) diagonal loop:`);
  for (let y = minY-1; y <= maxY+1; y++) {
    let row = `y=${String(y).padStart(3)}: `;
    for (let x = minX-1; x <= maxX+1; x++) {
      const k = keyOf(x,y);
      if (roadMap.has(k)) row += "R";
      else if (split.outerBorderMap.has(k)) row += "O";
      else if (split.innerBorderMap.has(k)) row += "I";
      else row += ".";
    }
    console.log(row);
  }
  console.log("  R=road O=outer-border I=inner-border");
}
