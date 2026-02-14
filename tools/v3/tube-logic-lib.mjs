import fs from "node:fs";
import zlib from "node:zlib";

const TILE = 4;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const REVERSE_LOOKUP = (() => {
  const arr = new Int16Array(128);
  arr.fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) arr[ALPHABET.charCodeAt(i)] = i;
  return arr;
})();

const DIRECTIONS = [
  { name: "N", dx: 0, dz: -TILE },
  { name: "W", dx: -TILE, dz: 0 },
  { name: "S", dx: 0, dz: TILE },
  { name: "E", dx: TILE, dz: 0 },
];

const CHECKPOINT_ORDER_BLOCKS = new Set([52, 65, 75, 77]);

// Tube / tube-adjacent pieces seen in real v3 maps.
export const TUBE_BLOCK_IDS = new Set([
  28, // Pipe
  47, // HalfPipe
  48, // QuarterPipe
  64, // TubeOpen
  74, // HalfPipeWide
  49, // WallRideLeft
  50, // WallRideRight
  31, // TunnelEntry
  32, // TunnelMid
  33, // TunnelExit
  45, // CorkLeft
  46, // CorkRight
  60, // LoopFull
  61, // LoopHalf
  62, // SpiralUp
  63, // SpiralDown
  88, // Helix
  90, // Corkscrew
]);

function packBits(bytes, bitOffset, numBits, value, isLast) {
  const byteIndex = Math.floor(bitOffset / 8);
  while (byteIndex >= bytes.length) bytes.push(0);
  const bitPos = bitOffset - 8 * byteIndex;
  bytes[byteIndex] |= (value << bitPos) & 255;
  if (bitPos > 8 - numBits && !isLast) {
    const nextByteIndex = byteIndex + 1;
    if (nextByteIndex >= bytes.length) bytes.push(0);
    bytes[nextByteIndex] |= value >> (8 - bitPos);
  }
}

function customDecode(str) {
  let bitOffset = 0;
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    const cc = str.charCodeAt(i);
    if (cc >= REVERSE_LOOKUP.length) return null;
    const value = REVERSE_LOOKUP[cc];
    if (value === -1) return null;
    const isLast = i === str.length - 1;
    if ((30 & ~value) !== 0) {
      packBits(bytes, bitOffset, 6, value, isLast);
      bitOffset += 6;
    } else {
      packBits(bytes, bitOffset, 5, value & 31, isLast);
      bitOffset += 5;
    }
  }
  return Buffer.from(bytes);
}

function readU32LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function readU24LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) >>> 0;
}

export function decodeV3ShareCode(code) {
  if (!code.startsWith("v3")) return null;

  const nameLenBytes = customDecode(code.slice(2, 4));
  if (!nameLenBytes || nameLenBytes.length < 1) return null;
  const nameLen = nameLenBytes[0];

  const nameEncoded = code.slice(4, 4 + nameLen);
  const nameBytes = customDecode(nameEncoded);
  const name = nameBytes ? new TextDecoder().decode(nameBytes) : "Track";

  const dataStr = code.slice(4 + nameLen);
  const dataBytes = customDecode(dataStr);
  if (!dataBytes) return null;

  let inflated;
  try {
    inflated = zlib.inflateSync(dataBytes);
  } catch {
    return null;
  }

  const parts = [];
  let off = 0;
  while (off + 6 <= inflated.length) {
    const blockType = inflated[off] | (inflated[off + 1] << 8);
    off += 2;
    const count = readU32LE(inflated, off);
    off += 4;
    for (let i = 0; i < count; i++) {
      if (off + 10 > inflated.length) return null;
      const xRaw = readU24LE(inflated, off) - 2 ** 23; off += 3;
      const yRaw = readU24LE(inflated, off); off += 3;
      const zRaw = readU24LE(inflated, off) - 2 ** 23; off += 3;
      const rotation = inflated[off] & 3; off += 1;
      let cpOrder = null;
      if (CHECKPOINT_ORDER_BLOCKS.has(blockType)) {
        if (off + 2 > inflated.length) return null;
        cpOrder = inflated[off] | (inflated[off + 1] << 8);
        off += 2;
      }
      parts.push({ blockType, rotation, x: xRaw * TILE, y: yRaw, z: zRaw * TILE, cpOrder });
    }
  }

  return { name, parts };
}

function keyOf(x, y, z) {
  return `${x},${y},${z}`;
}

function sortedObjectFromMap(map) {
  return Object.fromEntries(
    [...map.entries()].sort(([a], [b]) => String(a).localeCompare(String(b), "en")),
  );
}

export function analyzeTubeLogic(code, {
  topK = 3,
  tubeBlockIds = TUBE_BLOCK_IDS,
} = {}) {
  const decoded = decodeV3ShareCode(code);
  if (!decoded) return null;

  const pos = new Map(decoded.parts.map((p) => [keyOf(p.x, p.y, p.z), p]));
  const tubeParts = decoded.parts.filter((p) => tubeBlockIds.has(p.blockType));
  const pieceCounts = new Map();
  const keySamples = new Map();
  const offsetCounts = new Map(); // key => Map(offset => count)

  const vertical = new Map([
    [62, { total: 0, anyVertical: 0, hasPositiveDy: 0, hasNegativeDy: 0 }],
    [63, { total: 0, anyVertical: 0, hasPositiveDy: 0, hasNegativeDy: 0 }],
  ]);

  for (const p of tubeParts) {
    pieceCounts.set(p.blockType, (pieceCounts.get(p.blockType) || 0) + 1);

    const key = `${p.blockType}:r${p.rotation}`;
    keySamples.set(key, (keySamples.get(key) || 0) + 1);

    let hasPos = false;
    let hasNeg = false;
    let hasAnyVertical = false;

    let byOffset = offsetCounts.get(key);
    if (!byOffset) {
      byOffset = new Map();
      offsetCounts.set(key, byOffset);
    }

    for (const d of DIRECTIONS) {
      for (const dy of [-2, -1, 0, 1, 2]) {
        const n = pos.get(keyOf(p.x + d.dx, p.y + dy, p.z + d.dz));
        if (!n || !tubeBlockIds.has(n.blockType)) continue;

        const offset = `${d.name}:dy${dy}`;
        byOffset.set(offset, (byOffset.get(offset) || 0) + 1);

        if (dy > 0) {
          hasPos = true;
          hasAnyVertical = true;
        } else if (dy < 0) {
          hasNeg = true;
          hasAnyVertical = true;
        }
      }
    }

    if (vertical.has(p.blockType)) {
      const item = vertical.get(p.blockType);
      item.total++;
      if (hasAnyVertical) item.anyVertical++;
      if (hasPos) item.hasPositiveDy++;
      if (hasNeg) item.hasNegativeDy++;
    }
  }

  const topOffsets = {};
  for (const [k, map] of [...offsetCounts.entries()].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    const arr = [...map.entries()]
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], "en"))
      .slice(0, topK)
      .map(([offset, count]) => ({ offset, count }));
    topOffsets[k] = arr;
  }

  const verticalOut = {};
  for (const [id, v] of vertical.entries()) {
    verticalOut[String(id)] = {
      total: v.total,
      anyVertical: v.anyVertical,
      hasPositiveDy: v.hasPositiveDy,
      hasNegativeDy: v.hasNegativeDy,
      positiveRatio: v.total ? Number((v.hasPositiveDy / v.total).toFixed(6)) : 0,
      negativeRatio: v.total ? Number((v.hasNegativeDy / v.total).toFixed(6)) : 0,
    };
  }

  return {
    name: decoded.name,
    tubePartCount: tubeParts.length,
    tubePieceCounts: sortedObjectFromMap(pieceCounts),
    pieceRotationSamples: sortedObjectFromMap(keySamples),
    topOffsets,
    verticalBias: verticalOut,
  };
}

export function readShareCodeFromTrackCodes({ line = 51, path = "TRACK_CODES_ONLY.txt" } = {}) {
  const lines = fs.readFileSync(path, "utf8")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const idx = Number(line) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= lines.length) {
    throw new Error(`Invalid line ${line} for ${path}; available lines=${lines.length}`);
  }
  return lines[idx];
}
