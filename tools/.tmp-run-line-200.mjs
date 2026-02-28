import zlib from "node:zlib";

import { generateTrackFromImageData } from "../docs/image-track-core.mjs";

if (!globalThis.pako) {
  globalThis.pako = {
    deflate: (data) => zlib.deflateSync(Buffer.from(data)),
    inflate: (data) => zlib.inflateSync(Buffer.from(data)),
  };
}

function createImageData(width, height, bg = 235) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    data[p] = bg;
    data[p + 1] = bg;
    data[p + 2] = bg;
    data[p + 3] = 255;
  }
  return { width, height, data };
}

function putDot(image, cx, cy, radius, rgb = [220, 20, 20]) {
  const r2 = radius * radius;
  for (let y = Math.max(0, cy - radius); y <= Math.min(image.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(image.width - 1, cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const p = (y * image.width + x) * 4;
      image.data[p] = rgb[0];
      image.data[p + 1] = rgb[1];
      image.data[p + 2] = rgb[2];
      image.data[p + 3] = 255;
    }
  }
}

// Draw a Bresenham 1px line (matches how thin the user's actual image line is)
function drawLine1px(image, x0, y0, x1, y1, rgb = [220, 20, 20]) {
  let x = x0, y = y0;
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    const p = (y * image.width + x) * 4;
    image.data[p] = rgb[0]; image.data[p+1] = rgb[1]; image.data[p+2] = rgb[2]; image.data[p+3] = 255;
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}

const imageData = createImageData(640, 416, 235);
// Match the provided reference: bottom-left to top-right thin red line.
drawLine1px(imageData, 12, 402, 612, 14, [220, 20, 20]);

function run(opts, label) {
  const result = generateTrackFromImageData({
    imageData,
    name: `diag_line_200m_${label}`,
    targetLength: 200,
    lengthUnit: "m",
    scaleMode: "best-fit",
    widthTiles: 3,
    metersPerTile: 4,
    threshold: 140,
    invert: false,
    borderEnabled: true,
    ...opts,
  });
  const typeCounts = {};
  for (const part of result.trackData.parts) {
    typeCounts[part.blockType] = (typeCounts[part.blockType] || 0) + 1;
  }
  console.log(`\n=== ${label} ===`);
  console.log("Share code:", result.shareCode);
  console.log("Tiles:", result.metrics.centerlineTiles, " | Meters:", result.metrics.meters.toFixed(1));
  console.log("GridPts:", result.diagnostics.gridPoints, " | Traced:", result.diagnostics.tracedPoints,
              " | Simplified:", result.diagnostics.simplifiedPoints, " | Sampled:", result.diagnostics.sampledPoints);
  console.log("Road:", result.plan.roadMap.size, " | Border:", result.plan.borderMap.size);
  console.log("Block types:", JSON.stringify(typeCounts));
}

run({ closeLoop: false }, "non-loop");
run({ closeLoop: true  }, "loop");
