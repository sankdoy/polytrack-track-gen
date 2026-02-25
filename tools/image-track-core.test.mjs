import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";

import { generateTrackFromImageData, imageDataToBinaryMask, keepLargestComponent } from "../docs/image-track-core.mjs";
import { decodePolyTrack1 } from "./polytrack1/lib.mjs";

if (!globalThis.pako) {
  globalThis.pako = {
    deflate: (data) => zlib.deflateSync(Buffer.from(data)),
    inflate: (data) => zlib.inflateSync(Buffer.from(data)),
  };
}

const REF_IDS = {
  BORDER: 10,
  TURN_LEFT: 11,
  TURN_RIGHT: 12,
  ROAD: 25,
  FINISH: 77,
  FINISH_MARKER: 78,
  START: 92,
};

function createImageData(width, height, bg = 245) {
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

function putDot(image, cx, cy, radius, color = 25) {
  const r2 = radius * radius;
  for (let y = Math.max(0, cy - radius); y <= Math.min(image.height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(image.width - 1, cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const p = (y * image.width + x) * 4;
      image.data[p] = color;
      image.data[p + 1] = color;
      image.data[p + 2] = color;
      image.data[p + 3] = 255;
    }
  }
}

function drawLine(image, x0, y0, x1, y1, thickness = 5, color = 25) {
  let x = x0;
  let y = y0;
  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;

  while (true) {
    putDot(image, x, y, Math.max(1, Math.floor(thickness / 2)), color);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawPolyline(image, points, thickness = 5, color = 25, closed = true) {
  for (let i = 0; i < points.length - 1; i++) {
    drawLine(image, points[i].x, points[i].y, points[i + 1].x, points[i + 1].y, thickness, color);
  }
  if (closed && points.length > 2) {
    const last = points[points.length - 1];
    const first = points[0];
    drawLine(image, last.x, last.y, first.x, first.y, thickness, color);
  }
}

function makeSyntheticIslandLoop() {
  const image = createImageData(300, 300, 240);
  const points = [
    { x: 195, y: 24 },
    { x: 258, y: 76 },
    { x: 246, y: 170 },
    { x: 224, y: 248 },
    { x: 122, y: 278 },
    { x: 58, y: 230 },
    { x: 40, y: 142 },
    { x: 82, y: 74 },
    { x: 142, y: 44 },
  ];
  drawPolyline(image, points, 8, 14, true);
  return image;
}

function decodeOrThrow(code) {
  const decoded = decodePolyTrack1(code);
  assert.ok(decoded, "decoder returned null");
  assert.ok(!decoded.error, `decode error: ${decoded?.error || "unknown"}`);
  return decoded;
}

test("mask extraction keeps a dominant component", () => {
  const image = makeSyntheticIslandLoop();

  // Add tiny noise island to prove largest-component filtering works.
  putDot(image, 16, 16, 2, 10);

  const { mask, width, height } = imageDataToBinaryMask(image, { threshold: 100, invert: false });
  const largest = keepLargestComponent(mask, width, height);

  let rawCount = 0;
  let keptCount = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) rawCount++;
    if (largest[i]) keptCount++;
  }

  assert.ok(rawCount > keptCount, "largest component filter should remove noise");
  assert.ok(keptCount > 1000, "main component should remain substantial");
});

test("image trace generator outputs decodable PolyTrack1 using allowed piece families", () => {
  const imageData = makeSyntheticIslandLoop();

  const result = generateTrackFromImageData({
    imageData,
    name: "Synthetic Island",
    targetLength: 25,
    lengthUnit: "km",
    scaleMode: "best-fit",
    widthTiles: 1,
    metersPerTile: 4,
    threshold: 100,
    closeLoop: true,
    borderEnabled: true,
  });

  assert.ok(result.shareCode.startsWith("PolyTrack1"));

  const decoded = decodeOrThrow(result.shareCode);
  const allowed = new Set([
    REF_IDS.BORDER,
    REF_IDS.TURN_LEFT,
    REF_IDS.TURN_RIGHT,
    REF_IDS.ROAD,
    REF_IDS.FINISH,
    REF_IDS.FINISH_MARKER,
    REF_IDS.START,
  ]);
  for (const p of decoded.parts) {
    assert.ok(allowed.has(p.blockType), `unexpected block type ${p.blockType}`);
  }

  const starts = decoded.parts.filter((p) => p.blockType === REF_IDS.START).length;
  const finishes = decoded.parts.filter((p) => p.blockType === REF_IDS.FINISH).length;
  assert.equal(starts, 1, "must have exactly one start");
  assert.equal(finishes, 1, "must have exactly one finish");

  const roadCells = new Set();
  const borderCells = new Set();
  for (const p of decoded.parts) {
    const x = Math.round(p.x / 4);
    const y = Math.round(p.z / 4);
    const k = `${x},${y}`;
    if (p.blockType === REF_IDS.BORDER) borderCells.add(k);
    else roadCells.add(k);
  }

  for (const k of borderCells) {
    assert.ok(!roadCells.has(k), "border piece overlaps road cell");
  }
});

test("width setting expands road footprint and best-fit length is close to target", () => {
  const imageData = makeSyntheticIslandLoop();

  const narrow = generateTrackFromImageData({
    imageData,
    name: "Narrow",
    targetLength: 37.733,
    lengthUnit: "km",
    scaleMode: "best-fit",
    widthTiles: 1,
    metersPerTile: 4,
    threshold: 100,
    closeLoop: true,
    borderEnabled: true,
  });

  const wide = generateTrackFromImageData({
    imageData,
    name: "Wide",
    targetLength: 37.733,
    lengthUnit: "km",
    scaleMode: "best-fit",
    widthTiles: 5,
    metersPerTile: 4,
    threshold: 100,
    closeLoop: true,
    borderEnabled: true,
  });

  assert.ok(wide.plan.roadMap.size > narrow.plan.roadMap.size, "wider track should have larger road footprint");

  for (const k of wide.plan.borderMap.keys()) {
    assert.ok(!wide.plan.roadMap.has(k), "border map must stay outside road map");
  }

  const targetMeters = 37733;
  const err = Math.abs(wide.metrics.meters - targetMeters) / targetMeters;
  assert.ok(err <= 0.15, `length error too high (${(err * 100).toFixed(1)}%)`);
});
