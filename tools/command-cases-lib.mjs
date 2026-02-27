import zlib from "node:zlib";

import {
  centerlineToPieces,
  expandRoadWidth,
  buildBorderFromRoad,
  pruneOpenEndCaps,
  planToTrackData,
  pickBorderPieceForMask,
  REFERENCE_PALETTE,
} from "../docs/image-track-core.mjs";
import {
  ColorStyle,
  RotationAxis,
  TrackData,
  encodePolyTrack1ShareCode,
} from "../docs/track-web.mjs";
import { decodePolyTrack1, stablePartKey } from "./polytrack1/lib.mjs";

if (!globalThis.pako) {
  globalThis.pako = {
    deflate: (data) => zlib.deflateSync(Buffer.from(data)),
    inflate: (data) => zlib.inflateSync(Buffer.from(data)),
  };
}

const STEP_BY_HEADING = Object.freeze([
  { x: 0, y: -1 }, // north
  { x: -1, y: 0 }, // west
  { x: 0, y: 1 },  // south
  { x: 1, y: 0 },  // east
]);

function keyOf(x, y) {
  return `${x},${y}`;
}

function normalizeStyle(style) {
  return String(style || "shape-only").toLowerCase() === "race-ready" ? "race-ready" : "shape-only";
}

export function parseCommandSpec(spec) {
  const raw = Array.isArray(spec) ? spec.join(" ") : String(spec || "");
  const tokens = raw
    .replaceAll(",", " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const ops = [];
  for (const tokenRaw of tokens) {
    const token = tokenRaw.toUpperCase();
    if (token === "L" || token === "R") {
      ops.push({ op: token });
      continue;
    }

    const m = /^F(\d+)$/.exec(token);
    if (m) {
      const n = Number(m[1]);
      if (!(n > 0)) throw new Error(`Invalid forward token ${tokenRaw}`);
      ops.push({ op: "F", n });
      continue;
    }

    throw new Error(`Invalid token ${tokenRaw}. Use F<n>, L, R.`);
  }

  if (!ops.length) throw new Error("No commands found");
  return ops;
}

export function commandsToCells(spec, {
  startX = 0,
  startY = 0,
  startHeading = 2, // south
} = {}) {
  const ops = parseCommandSpec(spec);
  const out = [];
  let x = Number(startX) || 0;
  let y = Number(startY) || 0;
  let heading = ((Number(startHeading) || 0) % 4 + 4) % 4;
  out.push({ x, y });

  for (const op of ops) {
    if (op.op === "L") {
      heading = (heading + 1) % 4;
      continue;
    }
    if (op.op === "R") {
      heading = (heading + 3) % 4;
      continue;
    }

    for (let i = 0; i < op.n; i++) {
      const step = STEP_BY_HEADING[heading];
      x += step.x;
      y += step.y;
      out.push({ x, y });
    }
  }

  if (out.length < 2) throw new Error("Command sequence must emit at least 2 cells");

  const compact = [];
  for (const p of out) {
    if (!compact.length || compact[compact.length - 1].x !== p.x || compact[compact.length - 1].y !== p.y) {
      compact.push(p);
    }
  }
  return compact;
}

function dominantHeading(votes, fallback = 0) {
  const entries = Object.entries(votes || {});
  if (!entries.length) return fallback;
  entries.sort((a, b) => Number(b[1]) - Number(a[1]));
  return Number(entries[0][0]) || fallback;
}

function addOrthogonalBorderBridges(borderMap, roadMap) {
  if (!(borderMap instanceof Map) || !borderMap.size) return borderMap;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const cell of borderMap.values()) {
    if (cell.x < minX) minX = cell.x;
    if (cell.x > maxX) maxX = cell.x;
    if (cell.y < minY) minY = cell.y;
    if (cell.y > maxY) maxY = cell.y;
  }

  const out = new Map(borderMap);
  const base = new Set(borderMap.keys());
  const hasBase = (x, y) => base.has(keyOf(x, y));

  for (let y = minY - 1; y <= maxY + 1; y++) {
    for (let x = minX - 1; x <= maxX + 1; x++) {
      const k = keyOf(x, y);
      if (base.has(k)) continue;
      if (roadMap?.has(k)) continue;

      const n = hasBase(x, y - 1);
      const e = hasBase(x + 1, y);
      const s = hasBase(x, y + 1);
      const w = hasBase(x - 1, y);
      if (!((n && e) || (e && s) || (s && w) || (w && n))) continue;

      out.set(k, { x, y, votes: { 0: 1 } });
    }
  }

  return out;
}

function buildShapeOnlyTrackData(plan, environment = 0) {
  const out = new TrackData(environment, 28);
  const seen = new Set();
  let borderMap = !plan.closeLoop
    ? pruneOpenEndCaps(plan.borderMap, plan.centerlinePieces, plan.widthTiles)
    : plan.borderMap;
  if (!plan.closeLoop) {
    borderMap = addOrthogonalBorderBridges(borderMap, plan.roadMap);
  }

  const add = (x, y, blockType, rotation = 0) => {
    const key = `${blockType}|${x}|${y}|${rotation}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.addPart(
      x * 4,
      0,
      y * 4,
      blockType,
      rotation,
      RotationAxis.YPositive,
      ColorStyle.Default,
      null,
      null,
    );
  };

  for (const cell of plan.roadMap.values()) {
    add(cell.x, cell.y, REFERENCE_PALETTE.ROAD, dominantHeading(cell.votes, 0));
  }

  const borderSet = new Set();
  for (const cell of borderMap.values()) borderSet.add(keyOf(cell.x, cell.y));

  const hasBorderAt = (x, y) => borderSet.has(keyOf(x, y));

  for (const cell of borderMap.values()) {
    const n = hasBorderAt(cell.x, cell.y - 1);
    const e = hasBorderAt(cell.x + 1, cell.y);
    const s = hasBorderAt(cell.x, cell.y + 1);
    const w = hasBorderAt(cell.x - 1, cell.y);
    const mask = `${n ? "N" : ""}${e ? "E" : ""}${s ? "S" : ""}${w ? "W" : ""}`;
    const picked = pickBorderPieceForMask(mask || "-", dominantHeading(cell.votes, 0), {
      x: cell.x,
      y: cell.y,
      roadMap: plan.roadMap,
      preferRoadAxis: !plan.closeLoop,
    });
    add(cell.x, cell.y, picked.blockType, picked.rotation);
  }

  return out;
}

export function trackEquivalentByPartSet(codeA, codeB) {
  const a = decodePolyTrack1(codeA);
  const b = decodePolyTrack1(codeB);
  if (!a || a.error || !b || b.error) return false;

  const equivalenceKey = (part) => {
    // Flat road tile is rotationally symmetric for these shape-only calibrations.
    if (part.blockType === REFERENCE_PALETTE.ROAD) {
      return stablePartKey({ ...part, rotation: 0 });
    }
    return stablePartKey(part);
  };

  const mA = new Map();
  const mB = new Map();
  for (const p of a.parts) {
    const k = equivalenceKey(p);
    mA.set(k, (mA.get(k) || 0) + 1);
  }
  for (const p of b.parts) {
    const k = equivalenceKey(p);
    mB.set(k, (mB.get(k) || 0) + 1);
  }
  if (mA.size !== mB.size) return false;
  for (const [k, v] of mA.entries()) {
    if ((mB.get(k) || 0) !== v) return false;
  }
  return true;
}

export function buildCommandCase(def) {
  const style = normalizeStyle(def.style);
  const cells = commandsToCells(def.commands, {
    startX: def.startX ?? 0,
    startY: def.startY ?? 0,
    startHeading: def.startHeading ?? 2,
  });

  const centerlinePieces = centerlineToPieces(cells, {
    closed: !!def.closed,
    widthTiles: Math.max(1, Number(def.widthTiles) || 1),
  });

  const roadMap = expandRoadWidth(centerlinePieces, { widthTiles: Math.max(1, Number(def.widthTiles) || 1) });
  const borderMap = buildBorderFromRoad(roadMap);
  const plan = {
    widthTiles: Math.max(1, Number(def.widthTiles) || 1),
    closeLoop: !!def.closed,
    centerlinePieces,
    roadMap,
    borderMap,
  };

  const environment = Number.isInteger(def.environment) ? def.environment : 0;
  const trackData = style === "shape-only"
    ? buildShapeOnlyTrackData(plan, environment)
    : planToTrackData(plan, { environment, borderEnabled: true });

  const shareCode = encodePolyTrack1ShareCode(def.id, trackData, "");
  const decoded = decodePolyTrack1(shareCode);
  if (!decoded || decoded.error) {
    throw new Error(`decode failed for ${def.id}: ${decoded?.error || "unknown error"}`);
  }

  const counts = {};
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of decoded.parts) {
    counts[p.blockType] = (counts[p.blockType] || 0) + 1;
    const x = Math.round(p.x / 4);
    const y = Math.round(p.z / 4);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const expectedShareCode = String(def.expectedShareCode || "").trim();
  const status = expectedShareCode
    ? (trackEquivalentByPartSet(shareCode, expectedShareCode) ? "match" : "mismatch")
    : "missing_expected";

  return {
    id: def.id,
    label: def.label,
    commands: def.commands,
    style,
    closed: !!def.closed,
    widthTiles: Math.max(1, Number(def.widthTiles) || 1),
    shareCode,
    expectedShareCode,
    status,
    parts: decoded.parts.length,
    counts,
    bbox: { w: maxX - minX + 1, h: maxY - minY + 1 },
    decoded,
  };
}

export function renderDecodedAscii(decoded) {
  const pts = decoded.parts.map((p) => ({
    id: p.blockType,
    x: Math.round(p.x / 4),
    y: Math.round(p.z / 4),
  }));
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));
  for (const p of pts) {
    let ch = "?";
    if (p.id === 25) ch = ".";
    else if ([10, 11, 12].includes(p.id)) ch = "#";
    else if ([92, 93].includes(p.id)) ch = "S";
    else if ([75, 77].includes(p.id)) ch = "C";
    else if ([76, 78].includes(p.id)) ch = "M";
    grid[p.y - minY][p.x - minX] = ch;
  }
  return grid.map((r) => r.join("")).join("\n");
}
