import zlib from "node:zlib";
if (!globalThis.pako) globalThis.pako = { deflate: d => zlib.deflateSync(Buffer.from(d)), inflate: d => zlib.inflateSync(Buffer.from(d)) };

import { generateTrackFromImageData } from "../docs/image-track-core.mjs";

function createImageData(w, h, bg = 235) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4; data[p] = bg; data[p+1] = bg; data[p+2] = bg; data[p+3] = 255;
  }
  return { width: w, height: h, data };
}

// 2px wide Bresenham line (gives slight thickness for non-degenerate loop)
function drawLine2px(image, x0, y0, x1, y1, rgb = [220, 20, 20]) {
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    for (let oy = 0; oy <= 1; oy++) {
      const py = Math.min(image.height - 1, y + oy);
      const p = (py * image.width + x) * 4;
      image.data[p] = rgb[0]; image.data[p+1] = rgb[1]; image.data[p+2] = rgb[2]; image.data[p+3] = 255;
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

const W = 640, H = 416;
const imageData = createImageData(W, H, 235);
drawLine2px(imageData, 12, 402, 612, 14, [220, 20, 20]);

try {
  const result = generateTrackFromImageData({
    imageData,
    name: "diag_loop_200m",
    targetLength: 200,
    lengthUnit: "m",
    scaleMode: "best-fit",
    widthTiles: 3,
    metersPerTile: 4,
    threshold: 140,
    invert: false,
    closeLoop: true,
    borderEnabled: true,
  });
  console.log("=== loop ===");
  console.log("Share code:", result.shareCode);
  console.log("Tiles:", result.metrics.centerlineTiles, " | Meters:", result.metrics.meters.toFixed(1));
  console.log("GridPts:", result.diagnostics.gridPoints, " | Traced:", result.diagnostics.tracedPoints,
              " | Simplified:", result.diagnostics.simplifiedPoints);
  console.log("Road:", result.plan.roadMap.size, " | Border:", result.plan.borderMap.size);
} catch (e) {
  console.log("loop error:", e.message);
}
