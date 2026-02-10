import fs from "node:fs";
import readline from "node:readline";
import zlib from "node:zlib";

const TILE = 4;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const REVERSE_LOOKUP = (() => {
  const arr = new Int16Array(128);
  arr.fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) arr[ALPHABET.charCodeAt(i)] = i;
  return arr;
})();

function usage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  node tools/v3/filter-sharecodes.mjs --input <sharecodes.txt> --output <out.txt>",
      "  node tools/v3/filter-sharecodes.mjs --input <sharecodes.txt> --in-place",
      "",
      "Filters to only tracks that decode and contain both Start (id 5) and Finish (id 6).",
      "",
      "Options:",
      "  --keep-bad   Keep undecodable lines (default: drop)",
      "  --keep-empty Keep empty lines (default: drop)",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { input: null, output: null, inPlace: false, keepBad: false, keepEmpty: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--in-place") out.inPlace = true;
    else if (a === "--keep-bad") out.keepBad = true;
    else if (a === "--keep-empty") out.keepEmpty = true;
    else usage();
  }
  if (!out.input) usage();
  if (out.inPlace && out.output) usage();
  if (!out.inPlace && !out.output) usage();
  return out;
}

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

function decodeV3ShareCode(code) {
  if (!code.startsWith("v3")) return null;

  const nameLenBytes = customDecode(code.slice(2, 4));
  if (!nameLenBytes || nameLenBytes.length < 1) return null;
  const nameLen = nameLenBytes[0];

  const dataStr = code.slice(4 + nameLen);
  const dataBytes = customDecode(dataStr);
  if (!dataBytes) return null;

  let inflated;
  try {
    inflated = zlib.inflateSync(dataBytes);
  } catch {
    return null;
  }

  // Parse $A format
  const CHECKPOINT_ORDER_BLOCKS = new Set([52, 65, 75, 77]);
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

  return { parts };
}

function hasBlockType(parts, id) {
  for (const p of parts) if (p.blockType === id) return true;
  return false;
}

function backupPathFor(inputPath) {
  const base = `${inputPath}.bak`;
  if (!fs.existsSync(base)) return base;
  for (let i = 1; i < 1000; i++) {
    const p = `${base}.${i}`;
    if (!fs.existsSync(p)) return p;
  }
  return `${base}.${Date.now()}`;
}

const args = parseArgs(process.argv);
const outputPath = args.inPlace ? `${args.input}.tmp.filtered` : args.output;

const input = fs.createReadStream(args.input, { encoding: "utf8" });
const rl = readline.createInterface({ input, crlfDelay: Infinity });
const out = fs.createWriteStream(outputPath, { encoding: "utf8" });

const stats = {
  total: 0,
  kept: 0,
  droppedEmpty: 0,
  droppedBad: 0,
  droppedNoStart: 0,
  droppedNoFinish: 0,
};

for await (const lineRaw of rl) {
  stats.total++;
  const trimmed = lineRaw.trim();
  if (!trimmed) {
    if (args.keepEmpty) {
      out.write("\n");
      stats.kept++;
    } else {
      stats.droppedEmpty++;
    }
    continue;
  }

  const decoded = decodeV3ShareCode(trimmed);
  if (!decoded) {
    if (args.keepBad) {
      out.write(trimmed + "\n");
      stats.kept++;
    } else {
      stats.droppedBad++;
    }
    continue;
  }

  const hasStart = hasBlockType(decoded.parts, 5);
  const hasFinish = hasBlockType(decoded.parts, 6);
  if (!hasStart) {
    stats.droppedNoStart++;
    continue;
  }
  if (!hasFinish) {
    stats.droppedNoFinish++;
    continue;
  }

  out.write(trimmed + "\n");
  stats.kept++;
}

await new Promise((resolve) => out.end(resolve));

if (args.inPlace) {
  const bak = backupPathFor(args.input);
  fs.renameSync(args.input, bak);
  fs.renameSync(outputPath, args.input);
  // eslint-disable-next-line no-console
  console.log(`Wrote filtered sharecodes to ${args.input} (backup: ${bak})`);
} else {
  // eslint-disable-next-line no-console
  console.log(`Wrote filtered sharecodes to ${outputPath}`);
}

// eslint-disable-next-line no-console
console.log(
  [
    `Total lines:       ${stats.total}`,
    `Kept:             ${stats.kept}`,
    `Dropped empty:    ${stats.droppedEmpty}`,
    `Dropped bad:      ${stats.droppedBad}`,
    `Dropped no Start: ${stats.droppedNoStart}`,
    `Dropped no Finish:${stats.droppedNoFinish}`,
  ].join("\n"),
);

