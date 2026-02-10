import fs from "node:fs";
import readline from "node:readline";
import zlib from "node:zlib";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function readBits(bytes, bitOffset) {
  const byteIndex = bitOffset >> 3;
  const bitIndex = bitOffset & 7;
  const b0 = bytes[byteIndex] || 0;
  const b1 = bytes[byteIndex + 1] || 0;
  const b2 = bytes[byteIndex + 2] || 0;
  const b3 = bytes[byteIndex + 3] || 0;
  const val = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> bitIndex;
  return val & 63;
}

function customEncode(bytes) {
  let bitOffset = 0;
  let result = "";
  const totalBits = 8 * bytes.length;
  while (bitOffset < totalBits) {
    const value = readBits(bytes, bitOffset);
    let charIndex;
    if ((30 & ~value) !== 0) {
      charIndex = value;
      bitOffset += 6;
    } else {
      charIndex = value & 31;
      bitOffset += 5;
    }
    result += ALPHABET[charIndex];
  }
  return result;
}

function serializeV3Format(partsByType, checkpointOrderBlockTypes) {
  const bytes = [];
  const blockTypes = Array.from(partsByType.keys()).sort((a, b) => a - b);

  for (const blockType of blockTypes) {
    const parts = partsByType.get(blockType);
    bytes.push(blockType & 255, (blockType >> 8) & 255);
    const count = parts.length;
    bytes.push(count & 255, (count >> 8) & 255, (count >> 16) & 255, (count >> 24) & 255);

    for (const p of parts) {
      const xRaw = Math.round(p.x / 4) + 2 ** 23;
      bytes.push(xRaw & 255, (xRaw >> 8) & 255, (xRaw >> 16) & 255);

      const yRaw = p.y >>> 0;
      bytes.push(yRaw & 255, (yRaw >> 8) & 255, (yRaw >> 16) & 255);

      const zRaw = Math.round(p.z / 4) + 2 ** 23;
      bytes.push(zRaw & 255, (zRaw >> 8) & 255, (zRaw >> 16) & 255);

      bytes.push(p.rotation & 3);

      if (checkpointOrderBlockTypes.has(blockType)) {
        const co = (p.cpOrder ?? 0) >>> 0;
        bytes.push(co & 255, (co >> 8) & 255);
      }
    }
  }

  return Buffer.from(bytes);
}

function encodeV3ShareCode(name, partsByType, checkpointOrderBlockTypes) {
  const nameBytes = new TextEncoder().encode(name);
  const nameEncoded = customEncode(nameBytes);
  const nameLenBytes = customEncode(Uint8Array.from([nameEncoded.length & 255]));

  const raw = serializeV3Format(partsByType, checkpointOrderBlockTypes);
  const deflated = zlib.deflateSync(raw, { level: 9 });
  const trackEncoded = customEncode(deflated);
  return `v3${nameLenBytes}${nameEncoded}${trackEncoded}`;
}

function usage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  node tools/ndjson-to-v3-sharecodes.mjs --input <tracks.ndjson> [--output <out.txt>]",
      "",
      "Options:",
      "  --limit <n>         Convert first N tracks (default: all)",
      "  --line <n>          Convert only the Nth line (1-based)",
      "  --name <substring>  Convert only tracks whose name includes substring (case-insensitive)",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { input: null, output: null, limit: Infinity, line: null, name: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--line") out.line = Number(argv[++i]);
    else if (a === "--name") out.name = String(argv[++i] ?? "");
    else usage();
  }
  if (!out.input) usage();
  if (out.line != null && (!Number.isFinite(out.line) || out.line < 1)) usage();
  if (!Number.isFinite(out.limit) || out.limit < 1) out.limit = Infinity;
  if (out.name != null && !out.name) out.name = null;
  return out;
}

const args = parseArgs(process.argv);
const nameNeedle = args.name ? args.name.toLowerCase() : null;

const input = fs.createReadStream(args.input, { encoding: "utf8" });
const rl = readline.createInterface({ input, crlfDelay: Infinity });
const output = args.output ? fs.createWriteStream(args.output, { encoding: "utf8" }) : process.stdout;

let lineNo = 0;
let written = 0;

for await (const line of rl) {
  lineNo++;
  if (!line) continue;

  if (args.line != null && lineNo !== args.line) continue;
  if (written >= args.limit) break;

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }

  const trackName = String(obj?.name ?? "Track");
  if (nameNeedle && !trackName.toLowerCase().includes(nameNeedle)) continue;

  const data = obj?.data;
  const minX = Number(data?.min_x ?? 0);
  const minY = Number(data?.min_y ?? 0);
  const minZ = Number(data?.min_z ?? 0);
  const parts = Array.isArray(data?.parts) ? data.parts : [];

  const partsByType = new Map(); // id -> Array<{x,y,z,rotation,cpOrder}>
  const checkpointOrderBlockTypes = new Set();

  for (const group of parts) {
    const id = Number(group?.id);
    const blocks = Array.isArray(group?.blocks) ? group.blocks : [];
    if (!Number.isFinite(id)) continue;

    for (const b of blocks) {
      const x = Number(b?.x) + minX;
      const y = Number(b?.y) + minY;
      const z = Number(b?.z) + minZ;
      const rotation = Number(b?.rotation ?? 0) & 3;
      const cpOrder = b?.cp_order ?? null;
      if (cpOrder != null) checkpointOrderBlockTypes.add(id);

      if (!partsByType.has(id)) partsByType.set(id, []);
      partsByType.get(id).push({ x, y, z, rotation, cpOrder });
    }
  }

  const shareCode = encodeV3ShareCode(trackName, partsByType, checkpointOrderBlockTypes);
  output.write(shareCode + "\n");
  written++;

  if (args.line != null) break;
}

if (output !== process.stdout) output.end();

// eslint-disable-next-line no-console
console.error(`Converted ${written} track(s).`);

