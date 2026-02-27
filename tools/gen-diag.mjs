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
  planToTrackData,
} from "../docs/image-track-core.mjs";
import { encodePolyTrack1ShareCode } from "../docs/track-web.mjs";

// Build a simple zigzag loop:
//   go down the left side (zigzagging left), straight up the right side
const W = 20;   // total width of loop
const H = 40;   // total height
const teeth = 5;
const toothW = 6; // how far each tooth sticks LEFT

const pts = [];
// Top edge  →
for (let x = 0; x < W; x++) pts.push({ x, y: 0 });
// Right side ↓
for (let y = 1; y <= H; y++) pts.push({ x: W, y });
// Bottom edge ←
for (let x = W - 1; x >= 0; x--) pts.push({ x, y: H });
// Left side ↑ with leftward zigzag teeth
const segH = Math.floor(H / teeth);
let y = H;
for (let t = 0; t < teeth; t++) {
  const yEnd = y - segH;
  const yMid = y - Math.floor(segH / 2);
  // up to mid
  for (let yy = y - 1; yy >= yMid; yy--) pts.push({ x: 0, y: yy });
  // tooth left
  for (let xx = -1; xx >= -toothW; xx--) pts.push({ x: xx, y: yMid });
  // tooth right
  for (let xx = -toothW + 1; xx <= 0; xx++) pts.push({ x: xx, y: yMid });
  // continue up
  for (let yy = yMid - 1; yy >= yEnd; yy--) pts.push({ x: 0, y: yy });
  y = yEnd;
}

const widthTiles = 3;
const pieces = centerlineToPieces(pts, { closed: true, widthTiles });
const roadMap = expandRoadWidth(pieces, { widthTiles });
const borderMap = buildBorderFromRoad(roadMap);

const plan = {
  widthTiles,
  closeLoop: true,
  centerlinePieces: pieces,
  roadMap,
  borderMap,
  checkpointPieces: [],
};

const trackData = planToTrackData(plan, {
  borderEnabled: true,
  innerBorderEnabled: true,
  environment: "Summer",
});

const code = encodePolyTrack1ShareCode("DiagTest", trackData, "");
console.log(code);
