import { blockName, decodePolyTrack1 } from "./lib.mjs";

function usage() {
  // eslint-disable-next-line no-console
  console.error("Usage: node tools/polytrack1/decode.mjs \"PolyTrack1...\" [--parts]");
  process.exit(2);
}

const code = process.argv[2];
if (!code) usage();
const dumpParts = process.argv.includes("--parts");

const decoded = decodePolyTrack1(code);
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
    // eslint-disable-next-line no-console
    console.log(`${i}: ${blockName(p.blockType)}  (${p.x},${p.y},${p.z}) rot=${p.rotation} axis=${p.rotAxis} color=${p.color}`);
  }
}

