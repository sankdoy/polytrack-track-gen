import fs from "node:fs";
import readline from "node:readline";
import zlib from "node:zlib";

const TILE = 4;
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

function readU32LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0;
}

function readU24LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) >>> 0;
}

const CHECKPOINT_ORDER_BLOCKS = new Set([52, 65, 75, 77]);

function decodeV3ShareCode(code) {
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

function usage() {
  // eslint-disable-next-line no-console
  console.error("Usage: node tools/v3/extract-connector-rules.mjs --input <sharecodes.txt> [--limit <n>] [--out <rules.json>]");
  process.exit(2);
}

function parseArgs(argv) {
  const out = { input: null, outPath: null, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--out") out.outPath = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else usage();
  }
  if (!out.input) usage();
  if (!Number.isFinite(out.limit) || out.limit < 1) out.limit = Infinity;
  return out;
}

const args = parseArgs(process.argv);

const dirs = [
  { name: "N", dx: 0, dz: -TILE },
  { name: "W", dx: -TILE, dz: 0 },
  { name: "S", dx: 0, dz: TILE },
  { name: "E", dx: TILE, dz: 0 },
];

// Restrict to the core road-ish pieces for now.
const INTEREST = new Set([0, 1, 2, 3, 4, 5, 6, 36, 38, 39, 44, 52, 83]);

const counts = new Map(); // `${id}|rot${r}|${dir}|dy${dy}` -> count

function inc(map, k) {
  map.set(k, (map.get(k) || 0) + 1);
}

function keyOf(x, y, z) {
  return `${x},${y},${z}`;
}

const input = fs.createReadStream(args.input, { encoding: "utf8" });
const rl = readline.createInterface({ input, crlfDelay: Infinity });

let ok = 0;
let bad = 0;

for await (const line of rl) {
  if (ok >= args.limit) break;
  const code = line.trim();
  if (!code) continue;
  const decoded = decodeV3ShareCode(code);
  if (!decoded) {
    bad++;
    continue;
  }
  ok++;

  const parts = decoded.parts.filter((p) => INTEREST.has(p.blockType));
  const pos = new Map();
  for (const p of parts) pos.set(keyOf(p.x, p.y, p.z), p);

  for (const p of parts) {
    for (const d of dirs) {
      for (const dy of [-2, -1, 0, 1, 2]) {
        const n = pos.get(keyOf(p.x + d.dx, p.y + dy, p.z + d.dz));
        if (!n) continue;
        inc(counts, `${p.blockType}|rot${p.rotation}|${d.name}|dy${dy}`);
      }
    }
  }
}

const rules = {};
for (const [k, c] of counts.entries()) {
  const [idStr, rotPart, dir, dyPart] = k.split("|");
  const id = idStr;
  const rot = rotPart.slice(3);
  const dy = dyPart.slice(2);
  rules[id] ??= {};
  rules[id][rot] ??= [];
  rules[id][rot].push({ dir, dy: Number(dy), count: c });
}

for (const id of Object.keys(rules)) {
  for (const rot of Object.keys(rules[id])) {
    rules[id][rot].sort((a, b) => b.count - a.count);
    rules[id][rot] = rules[id][rot].slice(0, 12);
  }
}

const meta = { tracksDecoded: ok, bad, interestIds: Array.from(INTEREST) };
const outObj = { meta, rules };

if (args.outPath) {
  fs.writeFileSync(args.outPath, JSON.stringify(outObj, null, 2), "utf8");
} else {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(outObj, null, 2));
}

// eslint-disable-next-line no-console
console.error(`Decoded: ${ok}, bad: ${bad}`);
