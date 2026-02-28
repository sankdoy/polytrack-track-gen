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
} from "../docs/image-track-core.mjs";

// Simulate what generateTrackFromImageData does for a diagonal line (non-loop)
// Simplified: build a centerline as a diagonal staircase
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

// Build a small diagonal path (10x8 tiles)
const pts = cardinalLine({ x: 0, y: 0 }, { x: 10, y: 8 });
const widthTiles = 3;
const pieces = centerlineToPieces(pts, { closed: false, widthTiles });
const roadMap = expandRoadWidth(pieces, { widthTiles });
const borderMap = buildBorderFromRoad(roadMap);

// Count road neighbors for each border cell
const DIR4 = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }];
function keyOf(x, y) { return `${x},${y}`; }

let counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
for (const cell of borderMap.values()) {
  let n = 0;
  for (const { x: dx, y: dy } of DIR4) {
    if (roadMap.has(keyOf(cell.x + dx, cell.y + dy))) n++;
  }
  counts[n] = (counts[n] || 0) + 1;
}

console.log(`Road cells: ${roadMap.size}, Border cells: ${borderMap.size}`);
console.log("Border cells by road-neighbor count:");
for (const [n, c] of Object.entries(counts)) {
  if (c > 0) console.log(`  ${n} road neighbors: ${c} cells`);
}

// Show ASCII map
let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
for (const c of [...roadMap.values(), ...borderMap.values()]) {
  minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
  minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
}

console.log("\nASCII map (R=road, b=border-1rn, B=border-2rn, .=empty):");
for (let y = minY - 1; y <= maxY + 1; y++) {
  let row = `y=${String(y).padStart(3)}: `;
  for (let x = minX - 1; x <= maxX + 1; x++) {
    const k = keyOf(x, y);
    if (roadMap.has(k)) {
      row += "R";
    } else if (borderMap.has(k)) {
      let rn = 0;
      for (const { x: dx, y: dy } of DIR4) {
        if (roadMap.has(keyOf(x + dx, y + dy))) rn++;
      }
      row += rn >= 2 ? "B" : "b";
    } else {
      row += ".";
    }
  }
  console.log(row);
}
console.log("  R=road, b=1-rn border (keep), B=2+-rn border (remove), .=empty");
