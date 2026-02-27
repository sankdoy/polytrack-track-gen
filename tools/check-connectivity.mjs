import zlib from "node:zlib";
globalThis.pako = { deflate: d => zlib.deflateSync(Buffer.from(d)), inflate: d => zlib.inflateSync(Buffer.from(d)) };
import { decodePolyTrack1 } from "./polytrack1/lib.mjs";

const BROKEN = "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";

const b = decodePolyTrack1(BROKEN);
const road = b.parts.filter(p => p.blockType === 25).map(p => ({ gx: p.x/4, gy: p.z/4 }));
const roadSet = new Set(road.map(p => `${p.gx},${p.gy}`));

const visited = new Set();
let components = 0;
const compSizes = [];
for (const k of roadSet) {
  if (visited.has(k)) continue;
  components++;
  const queue = [k];
  visited.add(k);
  let size = 0;
  while (queue.length) {
    const c = queue.shift();
    size++;
    const [x, y] = c.split(",").map(Number);
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nk = `${x+dx},${y+dy}`;
      if (roadSet.has(nk) && !visited.has(nk)) { visited.add(nk); queue.push(nk); }
    }
  }
  compSizes.push(size);
}
console.log(`Road pieces: ${road.length} | Connected components: ${components}`);
console.log("Component sizes:", compSizes);

// Count border type-10 pieces connected to the gap between road bands
const border10 = b.parts.filter(p => p.blockType === 10).map(p => ({ gx: p.x/4, gy: p.z/4 }));
const border11 = b.parts.filter(p => p.blockType === 11).map(p => ({ gx: p.x/4, gy: p.z/4 }));
const border12 = b.parts.filter(p => p.blockType === 12).map(p => ({ gx: p.x/4, gy: p.z/4 }));
console.log(`\nBorder type 10: ${border10.length}, type 11: ${border11.length}, type 12: ${border12.length}`);

// Show bounding box
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const { gx, gy } of road) {
  if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
  if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
}
console.log(`Road bounding box: x=[${minX},${maxX}] y=[${minY},${maxY}]`);

// ASCII map of road+borders for a slice
const allParts = b.parts.map(p => ({ gx: p.x/4, gy: p.z/4, t: p.blockType }));
const partMap = new Map();
for (const p of allParts) {
  const k = `${p.gx},${p.gy}`;
  if (!partMap.has(k)) partMap.set(k, p.t);
}

console.log("\nASCII map (x cols, y rows, mid-track slice):");
const midY = Math.round((minY + maxY) / 2);
for (let gy = midY - 5; gy <= midY + 5; gy++) {
  let row = `y=${String(gy).padStart(3)}: `;
  for (let gx = minX - 1; gx <= maxX + 1; gx++) {
    const t = partMap.get(`${gx},${gy}`);
    if (t === 25) row += "R";
    else if (t === 10) row += "b";
    else if (t === 11) row += "L";
    else if (t === 12) row += "r";
    else row += ".";
  }
  console.log(row);
}
console.log("  (R=road, b=border10, L=turnLeft, r=turnRight, .=empty)");
