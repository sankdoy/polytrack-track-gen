import zlib from "node:zlib";
if (!globalThis.pako) globalThis.pako = { deflate: d => zlib.deflateSync(Buffer.from(d)), inflate: d => zlib.inflateSync(Buffer.from(d)) };

import { resamplePath, pathToGrid } from "../docs/image-track-core.mjs";

// Simulate the diagonal simplified to 2 endpoints (centered pixel coords for 640x416 image)
const pts = [{ x: -308, y: 194 }, { x: 292, y: -194 }];

const sampled = resamplePath(pts, { spacing: 2.4, closed: false, minPoints: 72 });
const polyLen = sampled.slice(1).reduce((s,p,i) => s + Math.hypot(p.x-sampled[i].x, p.y-sampled[i].y), 0);
console.log("sampled.length:", sampled.length, "  polyLen:", polyLen.toFixed(2));

const desiredTiles = 50;
const baseScale = desiredTiles / polyLen;
console.log("baseScale:", baseScale.toFixed(5));

// Simulate fitScaleToTarget
let scale = baseScale;
for (let i = 0; i < 4; i++) {
  const grid = pathToGrid(sampled, { scale, closed: false });
  const segs = Math.max(0, grid.length - 1);
  const factor = segs > 0 ? desiredTiles / segs : 1;
  console.log(`  iter ${i}: scale=${scale.toFixed(5)} grid.length=${grid.length} segs=${segs} factor=${factor.toFixed(4)}`);
  if (Math.abs(1 - factor) < 0.015) break;
  scale *= factor;
}
