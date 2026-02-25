/* eslint-disable */
// Minimal PolyTrack track model + PolyTrack1 encoder for image-trace generation.

export const BlockType = {
  Straight: 0,
  TurnSharp: 1,
  Start: 5,
  Finish: 6,
  TurnShort: 36,
  Checkpoint: 52,
  Fence: 58,
  Barrier: 59,
  WideRoad: 68,
  NarrowRoad: 69,
  TurnLong3: 83,
};

export const Environment = {
  Summer: 0,
  Winter: 1,
  Desert: 2,
  Default: 3,
};

export const RotationAxis = { YPositive: 0 };
export const ColorStyle = { Default: 0 };

export const BlockTypeName = {};
for (const [name, id] of Object.entries(BlockType)) {
  BlockTypeName[id] = name;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function readBits(bytes, bitOffset) {
  const byteIndex = bitOffset >> 3;
  const bitIndex = bitOffset & 7;
  const b0 = bytes[byteIndex] || 0;
  const b1 = bytes[byteIndex + 1] || 0;
  const b2 = bytes[byteIndex + 2] || 0;
  const b3 = bytes[byteIndex + 3] || 0;
  const value = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> bitIndex;
  return value & 63;
}

function customEncode(bytes) {
  let bitOffset = 0;
  let out = "";
  const totalBits = bytes.length * 8;
  while (bitOffset < totalBits) {
    const value = readBits(bytes, bitOffset);
    if ((30 & ~value) !== 0) {
      out += ALPHABET[value];
      bitOffset += 6;
    } else {
      out += ALPHABET[value & 31];
      bitOffset += 5;
    }
  }
  return out;
}

function writeI32LE(out, value) {
  const x = value | 0;
  out.push(x & 255, (x >> 8) & 255, (x >> 16) & 255, (x >> 24) & 255);
}

function writeU32LE(out, value) {
  const x = value >>> 0;
  out.push(x & 255, (x >> 8) & 255, (x >> 16) & 255, (x >> 24) & 255);
}

function writeVarUintLE(out, value, bytes) {
  let x = value >>> 0;
  for (let i = 0; i < bytes; i++) {
    out.push(x & 255);
    x >>>= 8;
  }
}

function bytesForUnsigned(value) {
  const x = value >>> 0;
  if (x <= 0xff) return 1;
  if (x <= 0xffff) return 2;
  if (x <= 0xffffff) return 3;
  return 4;
}

export class TrackPart {
  constructor(x, y, z, blockType, rotation, rotationAxis, color, checkpointOrder, startOrder) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.blockType = blockType;
    this.rotation = rotation;
    this.rotationAxis = rotationAxis;
    this.color = color;
    this.checkpointOrder = checkpointOrder;
    this.startOrder = startOrder;
  }
}

export class TrackData {
  constructor(environment = Environment.Summer, colorRepresentation = 28) {
    this.environment = environment;
    this.colorRepresentation = colorRepresentation;
    this.parts = new Map();
  }

  addPart(x, y, z, blockType, rotation = 0, rotationAxis = RotationAxis.YPositive, color = ColorStyle.Default, checkpointOrder = null, startOrder = null) {
    const part = new TrackPart(x, y, z, blockType, rotation, rotationAxis, color, checkpointOrder, startOrder);
    if (!this.parts.has(blockType)) this.parts.set(blockType, []);
    this.parts.get(blockType).push(part);
    return part;
  }
}

const PT1_CHECKPOINT_BLOCKS = new Set([BlockType.Checkpoint, 65, 75, 77]);
const PT1_START_BLOCKS = new Set([BlockType.Start, 91, 92, 93]);

function serializePolyTrack1Format(trackData) {
  const parts = [];
  for (const [, list] of trackData.parts) {
    for (const p of list) parts.push(p);
  }

  let minX = 0;
  let minY = 0;
  let minZ = 0;
  if (parts.length > 0) {
    minX = parts[0].x | 0;
    minY = parts[0].y | 0;
    minZ = parts[0].z | 0;
    for (const p of parts) {
      if (p.x < minX) minX = p.x | 0;
      if (p.y < minY) minY = p.y | 0;
      if (p.z < minZ) minZ = p.z | 0;
    }
  }

  let maxDX = 0;
  let maxDY = 0;
  let maxDZ = 0;
  for (const p of parts) {
    const dx = (p.x - minX) >>> 0;
    const dy = (p.y - minY) >>> 0;
    const dz = (p.z - minZ) >>> 0;
    if (dx > maxDX) maxDX = dx;
    if (dy > maxDY) maxDY = dy;
    if (dz > maxDZ) maxDZ = dz;
  }

  const bytesX = bytesForUnsigned(maxDX);
  const bytesY = bytesForUnsigned(maxDY);
  const bytesZ = bytesForUnsigned(maxDZ);
  const packed = (bytesX & 3) | ((bytesY & 3) << 2) | ((bytesZ & 3) << 4);

  const out = [];
  out.push((trackData.environment ?? 0) & 255);
  out.push((trackData.colorRepresentation ?? 28) & 255);
  writeI32LE(out, minX);
  writeI32LE(out, minY);
  writeI32LE(out, minZ);
  out.push(packed);

  const byType = new Map();
  for (const p of parts) {
    const id = p.blockType & 255;
    if (!byType.has(id)) byType.set(id, []);
    byType.get(id).push(p);
  }

  const types = Array.from(byType.keys()).sort((a, b) => a - b);
  for (const id of types) {
    const items = byType.get(id);
    out.push(id & 255);
    writeU32LE(out, items.length);

    for (const p of items) {
      writeVarUintLE(out, (p.x - minX) >>> 0, bytesX);
      writeVarUintLE(out, (p.y - minY) >>> 0, bytesY);
      writeVarUintLE(out, (p.z - minZ) >>> 0, bytesZ);
      out.push((p.rotation ?? 0) & 255);
      out.push((p.rotationAxis ?? RotationAxis.YPositive) & 255);
      out.push((p.color ?? ColorStyle.Default) & 255);

      if (PT1_CHECKPOINT_BLOCKS.has(id)) {
        const cp = (p.checkpointOrder ?? 0) & 0xffff;
        out.push(cp & 255, (cp >> 8) & 255);
      }

      if (PT1_START_BLOCKS.has(id)) {
        writeU32LE(out, (p.startOrder ?? 0) >>> 0);
      }
    }
  }

  return new Uint8Array(out);
}

export function encodePolyTrack1ShareCode(name, trackData, author = "") {
  if (!globalThis.pako) {
    throw new Error("pako not found on globalThis");
  }

  const nameBytes = new TextEncoder().encode(String(name ?? ""));
  const authorBytes = new TextEncoder().encode(String(author ?? ""));

  const header = [];
  const safeNameLen = Math.min(255, nameBytes.length);
  const safeAuthorLen = Math.min(255, authorBytes.length);

  header.push(safeNameLen);
  for (let i = 0; i < safeNameLen; i++) header.push(nameBytes[i]);

  header.push(safeAuthorLen);
  for (let i = 0; i < safeAuthorLen; i++) header.push(authorBytes[i]);

  const body = serializePolyTrack1Format(trackData);
  const inflated1 = new Uint8Array(header.length + body.length);
  inflated1.set(header, 0);
  inflated1.set(body, header.length);

  const innerDeflated = globalThis.pako.deflate(inflated1, { level: 9 });
  const innerStr = customEncode(innerDeflated);

  const outerBytes = new TextEncoder().encode(innerStr);
  const outerDeflated = globalThis.pako.deflate(outerBytes, { level: 9 });
  const outerStr = customEncode(outerDeflated);

  return "PolyTrack1" + outerStr;
}

// Legacy compatibility: older scripts import this symbol.
// The rework now emits PolyTrack1 only, so we route through the current encoder.
export function encodeV3ShareCode(name, trackData) {
  return encodePolyTrack1ShareCode(name, trackData, "");
}

export function summarizeTrackData(trackData) {
  let total = 0;
  const counts = new Map();
  for (const [id, items] of trackData.parts.entries()) {
    const c = items.length;
    total += c;
    counts.set(id, c);
  }

  const byType = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => `${BlockTypeName[id] || id}:${c}`)
    .join(", ");

  return { total, counts, byType };
}
