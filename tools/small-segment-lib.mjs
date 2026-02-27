import zlib from "node:zlib";

import {
  centerlineToPieces,
  expandRoadWidth,
  buildBorderFromRoad,
  planToTrackData,
  REFERENCE_PALETTE,
} from "../docs/image-track-core.mjs";
import {
  ColorStyle,
  RotationAxis,
  TrackData,
  encodePolyTrack1ShareCode,
} from "../docs/track-web.mjs";
import { decodePolyTrack1 } from "./polytrack1/lib.mjs";

if (!globalThis.pako) {
  globalThis.pako = {
    deflate: (data) => zlib.deflateSync(Buffer.from(data)),
    inflate: (data) => zlib.inflateSync(Buffer.from(data)),
  };
}

const BORDER_FAMILY = new Set([
  REFERENCE_PALETTE.BORDER,
  REFERENCE_PALETTE.TURN_LEFT,
  REFERENCE_PALETTE.TURN_RIGHT,
]);

const ROAD_FAMILY = new Set([
  REFERENCE_PALETTE.ROAD,
  REFERENCE_PALETTE.CHECKPOINT_ALT,
  REFERENCE_PALETTE.FINISH_MARKER_ALT,
  REFERENCE_PALETTE.FINISH,
  REFERENCE_PALETTE.FINISH_MARKER,
  REFERENCE_PALETTE.START,
  REFERENCE_PALETTE.START_ALT,
]);

function remapBlockTypeForMicroStyle(blockType) {
  if (blockType === REFERENCE_PALETTE.ROAD) return REFERENCE_PALETTE.BORDER;
  if (blockType === REFERENCE_PALETTE.FINISH) return REFERENCE_PALETTE.CHECKPOINT_ALT;
  if (blockType === REFERENCE_PALETTE.FINISH_MARKER) return REFERENCE_PALETTE.FINISH_MARKER_ALT;
  return blockType;
}

function remapTrackDataForMicroStyle(trackData) {
  const out = new TrackData(trackData.environment, trackData.colorRepresentation);
  const seen = new Set();

  for (const [blockType, parts] of trackData.parts.entries()) {
    const mappedType = remapBlockTypeForMicroStyle(blockType);
    for (const p of parts) {
      const key = [
        mappedType,
        p.x,
        p.y,
        p.z,
        p.rotation,
        p.rotationAxis ?? RotationAxis.YPositive,
        p.color ?? ColorStyle.Default,
        p.checkpointOrder ?? "",
        p.startOrder ?? "",
      ].join("|");

      if (seen.has(key)) continue;
      seen.add(key);

      out.addPart(
        p.x,
        p.y,
        p.z,
        mappedType,
        p.rotation,
        p.rotationAxis ?? RotationAxis.YPositive,
        p.color ?? ColorStyle.Default,
        p.checkpointOrder ?? null,
        p.startOrder ?? null,
      );
    }
  }

  return out;
}

export function buildSmallSegmentCase(def) {
  let centerlinePieces = null;
  let roadMap = null;
  let borderMap = null;
  let shareCode = def.fixedShareCode || null;
  let decoded = null;

  if (shareCode) {
    decoded = decodePolyTrack1(shareCode);
  } else {
    centerlinePieces = centerlineToPieces(def.cells, {
      closed: def.closed,
      widthTiles: def.widthTiles,
    });

    roadMap = expandRoadWidth(centerlinePieces, { widthTiles: def.widthTiles });
    borderMap = buildBorderFromRoad(roadMap);

    const plan = {
      widthTiles: def.widthTiles,
      closeLoop: def.closed,
      centerlinePieces,
      roadMap,
      borderMap,
    };

    let trackData = planToTrackData(plan, {
      borderEnabled: true,
    });

    if (def.microStyle) {
      trackData = remapTrackDataForMicroStyle(trackData);
    }

    shareCode = encodePolyTrack1ShareCode(def.id, trackData, "");
    decoded = decodePolyTrack1(shareCode);
  }

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

  const start = decoded.parts.find((p) => p.blockType === REFERENCE_PALETTE.START || p.blockType === REFERENCE_PALETTE.START_ALT);

  return {
    id: def.id,
    label: def.label,
    shouldLookLike: def.shouldLookLike,
    closed: def.closed,
    widthTiles: def.widthTiles,
    shareCode,
    parts: decoded.parts.length,
    centerline: centerlinePieces ? centerlinePieces.length : null,
    road: roadMap ? roadMap.size : null,
    border: borderMap ? borderMap.size : null,
    startType: start?.blockType ?? null,
    bbox: {
      w: maxX - minX + 1,
      h: maxY - minY + 1,
    },
    counts,
    decoded,
  };
}

export function renderCaseAscii(decoded) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  const cells = decoded.parts.map((p) => ({
    id: p.blockType,
    x: Math.round(p.x / 4),
    y: Math.round(p.z / 4),
  }));

  for (const c of cells) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const grid = Array.from({ length: h }, () => Array.from({ length: w }, () => " "));

  for (const c of cells) {
    let ch = "?";
    if (c.id === REFERENCE_PALETTE.START || c.id === REFERENCE_PALETTE.START_ALT) ch = "S";
    else if (c.id === REFERENCE_PALETTE.FINISH_MARKER || c.id === REFERENCE_PALETTE.FINISH_MARKER_ALT) ch = "M";
    else if (c.id === REFERENCE_PALETTE.FINISH || c.id === REFERENCE_PALETTE.CHECKPOINT_ALT) ch = "C";
    else if (BORDER_FAMILY.has(c.id)) ch = "#";
    else if (ROAD_FAMILY.has(c.id)) ch = ".";

    const gx = c.x - minX;
    const gy = c.y - minY;

    // Keep road/start/checkpoint symbols if the marker overlaps.
    if (ch === "M" && grid[gy][gx] !== " ") continue;
    grid[gy][gx] = ch;
  }

  return grid.map((row) => row.join("")).join("\n");
}
