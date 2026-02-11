import zlib from "node:zlib";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const REVERSE_LOOKUP = new Array(123).fill(-1);
for (let i = 0; i < 26; i++) REVERSE_LOOKUP[65 + i] = i;
for (let i = 0; i < 26; i++) REVERSE_LOOKUP[97 + i] = 26 + i;
for (let i = 0; i < 10; i++) REVERSE_LOOKUP[48 + i] = 52 + i;

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
    const charCode = str.charCodeAt(i);
    if (charCode >= REVERSE_LOOKUP.length) return null;
    const value = REVERSE_LOOKUP[charCode];
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

function readI32LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24));
}

function readU32LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function readVarUint(buf, off, n) {
  let v = 0;
  for (let i = 0; i < n; i++) v |= buf[off + i] << (8 * i);
  return v >>> 0;
}

// PolyTrack1/newest format fields.
// Checkpoint order bytes exist only for checkpoint blocks (NOT finish blocks).
const CHECKPOINT_BLOCKS = new Set([52, 65, 75, 77]);
const START_BLOCKS = new Set([5, 91, 92, 93]);

function parseTrackBytes(bytes, offset = 0) {
  let n = offset;
  if (bytes.length - n < 2 + 13) return null;

  const environment = bytes[n]; n += 1;
  const colorRep = bytes[n]; n += 1;

  const minX = readI32LE(bytes, n); n += 4;
  const minY = readI32LE(bytes, n); n += 4;
  const minZ = readI32LE(bytes, n); n += 4;

  const packed = bytes[n]; n += 1;
  const bytesX = packed & 3;
  const bytesY = (packed >> 2) & 3;
  const bytesZ = (packed >> 4) & 3;
  if (bytesX < 1 || bytesX > 4 || bytesY < 1 || bytesY > 4 || bytesZ < 1 || bytesZ > 4) return null;

  const parts = [];

  while (n < bytes.length) {
    if (bytes.length - n < 1) return null;
    const blockType = bytes[n]; n += 1;

    if (bytes.length - n < 4) return null;
    const count = readU32LE(bytes, n); n += 4;

    for (let i = 0; i < count; i++) {
      if (bytes.length - n < bytesX + bytesY + bytesZ + 3) return null;
      const x = readVarUint(bytes, n, bytesX) + minX; n += bytesX;
      const y = readVarUint(bytes, n, bytesY) + minY; n += bytesY;
      const z = readVarUint(bytes, n, bytesZ) + minZ; n += bytesZ;

      const rotation = bytes[n]; n += 1;
      const rotAxis = bytes[n]; n += 1;
      const color = bytes[n]; n += 1;

      let checkpointOrder = null;
      if (CHECKPOINT_BLOCKS.has(blockType)) {
        if (bytes.length - n < 2) return null;
        checkpointOrder = bytes[n] | (bytes[n + 1] << 8);
        n += 2;
      }

      let startOrder = null;
      if (START_BLOCKS.has(blockType)) {
        if (bytes.length - n < 4) return null;
        startOrder = readU32LE(bytes, n);
        n += 4;
      }

      parts.push({ blockType, x, y, z, rotation, rotAxis, color, checkpointOrder, startOrder });
    }
  }

  return { environment, colorRep, parts };
}

function decodePolyTrack1(code) {
  if (!code.startsWith("PolyTrack1")) return null;
  const outer = code.slice("PolyTrack1".length);

  const outerBytes = customDecode(outer);
  if (!outerBytes) return { error: "customDecode(outer) failed" };

  let inflated2;
  try {
    inflated2 = zlib.inflateSync(outerBytes);
  } catch {
    return { error: "inflate(outerBytes) failed" };
  }

  const innerStr = inflated2.toString("utf8");
  if (!innerStr || innerStr.length < 5) return { error: "innerStr empty/short" };
  for (let i = 0; i < Math.min(innerStr.length, 128); i++) {
    const cc = innerStr.charCodeAt(i);
    if (cc >= REVERSE_LOOKUP.length || REVERSE_LOOKUP[cc] === -1) {
      return { error: "innerStr contains non-alphabet chars", sampleChar: innerStr[i], sampleCode: cc };
    }
  }
  const innerBytes = customDecode(innerStr);
  if (!innerBytes) return { error: "customDecode(innerStr) failed" };

  let inflated1;
  try {
    inflated1 = zlib.inflateSync(innerBytes);
  } catch {
    return { error: "inflate(innerBytes) failed" };
  }

  // Header: [nameLen:1][name][authorLen:1][author]
  if (inflated1.length < 2) return { error: "header too short" };
  const nameLen = inflated1[0];
  const nameStart = 1;
  const nameEnd = nameStart + nameLen;
  if (nameEnd >= inflated1.length) return { error: "bad name len" };
  let name = "";
  try {
    name = new TextDecoder().decode(inflated1.subarray(nameStart, nameEnd));
  } catch {
    return { error: "name decode failed" };
  }

  const authorLen = inflated1[nameEnd];
  const authorStart = nameEnd + 1;
  const authorEnd = authorStart + authorLen;
  if (authorEnd > inflated1.length) return { error: "bad author len" };
  let author = "";
  if (authorLen) {
    try {
      author = new TextDecoder().decode(inflated1.subarray(authorStart, authorEnd));
    } catch {
      return { error: "author decode failed" };
    }
  }

  const parsed = parseTrackBytes(inflated1, authorEnd);
  if (!parsed) return { error: "parseTrackBytes failed" };
  return { ...parsed, name, author };
}

function usage() {
  // eslint-disable-next-line no-console
  console.error("Usage: node tools/polytrack1/decode.mjs \"PolyTrack1...\" [--parts]");
  process.exit(2);
}

const code = process.argv[2];
if (!code) usage();
const dumpParts = process.argv.includes("--parts");

const decoded = decodePolyTrack1(code.trim());
if (!decoded || decoded.error) {
  // eslint-disable-next-line no-console
  console.error("Decode failed", decoded?.error ? `(${decoded.error})` : "");
  if (decoded && decoded.error) {
    // eslint-disable-next-line no-console
    console.error(decoded);
  }
  process.exit(1);
}

const counts = new Map();
for (const p of decoded.parts) counts.set(p.blockType, (counts.get(p.blockType) || 0) + 1);

// eslint-disable-next-line no-console
console.log(`name=${JSON.stringify(decoded.name)} author=${JSON.stringify(decoded.author)} env=${decoded.environment} colorRep=${decoded.colorRep} parts=${decoded.parts.length} uniqueTypes=${counts.size}`);
for (const [id, c] of Array.from(counts.entries()).sort((a, b) => a[0] - b[0])) {
  // eslint-disable-next-line no-console
  console.log(`${id}\\t${c}`);
}

if (dumpParts) {
  const BLOCK_NAMES = {
    0: "Straight",
    1: "TurnSharp",
    2: "SlopeUp",
    3: "SlopeDown",
    4: "Slope",
    5: "Start",
    6: "Finish",
    36: "TurnShort",
    38: "SlopeUpLong",
    39: "SlopeDownLong",
    43: "IntersectionT",
    44: "IntersectionCross",
    52: "Checkpoint",
    83: "TurnLong3",
  };

  const parts = decoded.parts.slice().sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.z !== b.z) return a.z - b.z;
    if (a.x !== b.x) return a.x - b.x;
    if (a.blockType !== b.blockType) return a.blockType - b.blockType;
    return a.rotation - b.rotation;
  });
  // eslint-disable-next-line no-console
  console.log("\nparts:");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const name = BLOCK_NAMES[p.blockType] || String(p.blockType);
    // eslint-disable-next-line no-console
    console.log(`${i}: ${name}  (${p.x},${p.y},${p.z}) rot=${p.rotation} axis=${p.rotAxis} color=${p.color}`);
  }
}
