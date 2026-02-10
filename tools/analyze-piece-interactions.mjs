import fs from "node:fs";
import readline from "node:readline";

const TILE = 4;
const DIRS = [
  { name: "N", dx: 0, dz: -TILE },
  { name: "W", dx: -TILE, dz: 0 },
  { name: "S", dx: 0, dz: TILE },
  { name: "E", dx: TILE, dz: 0 },
];

function usage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  node tools/analyze-piece-interactions.mjs --input <tracks.ndjson> [--limit <n>]",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { input: null, limit: Infinity };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
    else usage();
  }
  if (!out.input) usage();
  if (!Number.isFinite(out.limit) || out.limit < 1) out.limit = Infinity;
  return out;
}

const args = parseArgs(process.argv);

// Only analyze the pieces we actively generate/use right now.
const INTEREST = new Set([0, 1, 2, 3, 4, 5, 6, 36, 38, 39, 44, 52, 83]);

const typeCounts = new Map(); // id -> count
const neighborCounts = new Map(); // key -> count

function inc(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

function keyOf(x, y, z) {
  return `${x},${y},${z}`;
}

let tracks = 0;

const input = fs.createReadStream(args.input, { encoding: "utf8" });
const rl = readline.createInterface({ input, crlfDelay: Infinity });

for await (const line of rl) {
  if (tracks >= args.limit) break;
  if (!line) continue;

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    continue;
  }

  const data = obj?.data;
  const minX = Number(data?.min_x ?? 0);
  const minY = Number(data?.min_y ?? 0);
  const minZ = Number(data?.min_z ?? 0);
  const parts = Array.isArray(data?.parts) ? data.parts : [];

  const blocks = [];
  for (const group of parts) {
    const id = Number(group?.id);
    if (!INTEREST.has(id)) continue;
    const bs = Array.isArray(group?.blocks) ? group.blocks : [];
    for (const b of bs) {
      blocks.push({
        id,
        rot: Number(b?.rotation ?? 0) & 3,
        x: Number(b?.x) + minX,
        y: Number(b?.y) + minY,
        z: Number(b?.z) + minZ,
      });
    }
  }

  if (blocks.length === 0) {
    tracks++;
    continue;
  }

  const pos = new Map(); // xyz -> {id,rot}
  for (const b of blocks) {
    pos.set(keyOf(b.x, b.y, b.z), { id: b.id, rot: b.rot });
    inc(typeCounts, b.id);
  }

  for (const b of blocks) {
    for (const d of DIRS) {
      for (const dy of [-2, -1, 0, 1, 2]) {
        const nx = b.x + d.dx;
        const ny = b.y + dy;
        const nz = b.z + d.dz;
        const n = pos.get(keyOf(nx, ny, nz));
        if (!n) continue;
        const k = `${b.id}|rot${b.rot}|${d.name}|dy${dy}|->${n.id}`;
        inc(neighborCounts, k);
      }
    }
  }

  tracks++;
}

function topN(map, n) {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// eslint-disable-next-line no-console
console.log(`Tracks analyzed: ${tracks}`);
// eslint-disable-next-line no-console
console.log("");
// eslint-disable-next-line no-console
console.log("Top piece counts:");
for (const [id, c] of topN(typeCounts, 20)) {
  // eslint-disable-next-line no-console
  console.log(`  id ${id}: ${c}`);
}

// eslint-disable-next-line no-console
console.log("");
// eslint-disable-next-line no-console
console.log("Top neighbor interactions (cardinal step=1 tile, dy in [-2..2]):");
for (const [k, c] of topN(neighborCounts, 60)) {
  // eslint-disable-next-line no-console
  console.log(`  ${c}x  ${k}`);
}

