import { decodePolyTrack1, blockName, stablePartKey } from "./lib.mjs";

function usage() {
  // eslint-disable-next-line no-console
  console.error("Usage: node tools/polytrack1/diff.mjs <oldCode> <newCode> [--limit N]");
  process.exit(2);
}

const oldCode = process.argv[2];
const newCode = process.argv[3];
if (!oldCode || !newCode) usage();

const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx !== -1 ? Math.max(0, Number(process.argv[limitIdx + 1] || 40)) : 40;

function summarize(decoded) {
  const counts = new Map();
  for (const p of decoded.parts) counts.set(p.blockType, (counts.get(p.blockType) || 0) + 1);
  return { name: decoded.name, author: decoded.author, env: decoded.environment, colorRep: decoded.colorRep, parts: decoded.parts.length, counts };
}

function countsToStr(counts) {
  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([id, c]) => `${blockName(id)}(${id}):${c}`)
    .join(", ");
}

function multiset(parts) {
  const m = new Map();
  for (const p of parts) {
    const k = stablePartKey(p);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

function subtractCounts(a, b) {
  // returns a - b (no negatives)
  const out = new Map();
  for (const [k, v] of a.entries()) {
    const w = b.get(k) || 0;
    if (v > w) out.set(k, v - w);
  }
  return out;
}

function parseKey(k) {
  const [blockType, x, y, z, rotation, rotAxis, color, checkpointOrder, startOrder] = k.split(",");
  return {
    blockType: Number(blockType),
    x: Number(x),
    y: Number(y),
    z: Number(z),
    rotation: Number(rotation),
    rotAxis: Number(rotAxis),
    color: Number(color),
    checkpointOrder: checkpointOrder === "" ? null : Number(checkpointOrder),
    startOrder: startOrder === "" ? null : Number(startOrder),
  };
}

function formatPart(p) {
  const extras = [];
  if (p.checkpointOrder != null) extras.push(`cp=${p.checkpointOrder}`);
  if (p.startOrder != null) extras.push(`start=${p.startOrder}`);
  return `${blockName(p.blockType)} (${p.x},${p.y},${p.z}) rot=${p.rotation}${extras.length ? " " + extras.join(" ") : ""}`;
}

function expandMap(m) {
  const out = [];
  for (const [k, v] of m.entries()) {
    for (let i = 0; i < v; i++) out.push(parseKey(k));
  }
  return out;
}

function scoreMatch(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const man = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
  let penalty = 0;
  if (a.rotation !== b.rotation) penalty += 1000;
  if ((a.checkpointOrder ?? null) !== (b.checkpointOrder ?? null)) penalty += 1000;
  if ((a.startOrder ?? null) !== (b.startOrder ?? null)) penalty += 1000;
  return { score: man + penalty, dx, dy, dz, man };
}

function matchMoved(oldParts, newParts) {
  // Greedy by best-score. Works well when only a few pieces differ.
  const remainingNew = newParts.slice();
  const moves = [];
  const unmatchedOld = [];
  for (const op of oldParts) {
    let bestIdx = -1;
    let best = null;
    for (let i = 0; i < remainingNew.length; i++) {
      const np = remainingNew[i];
      if (np.blockType !== op.blockType) continue;
      const s = scoreMatch(op, np);
      if (!best || s.score < best.score) {
        best = { ...s, from: op, to: np };
        bestIdx = i;
      }
    }
    // Only accept "reasonable" matches: same rotation/orders (penalty==0) and within 32 units manhattan.
    if (best && best.score < 1000 && best.man <= 32) {
      remainingNew.splice(bestIdx, 1);
      moves.push(best);
    } else {
      unmatchedOld.push(op);
    }
  }
  const unmatchedNew = remainingNew;
  return { moves, unmatchedOld, unmatchedNew };
}

const oldDecoded = decodePolyTrack1(oldCode);
const newDecoded = decodePolyTrack1(newCode);
if (!oldDecoded || oldDecoded.error) {
  // eslint-disable-next-line no-console
  console.error("Old decode failed", oldDecoded?.error || "");
  process.exit(1);
}
if (!newDecoded || newDecoded.error) {
  // eslint-disable-next-line no-console
  console.error("New decode failed", newDecoded?.error || "");
  process.exit(1);
}

const a = summarize(oldDecoded);
const b = summarize(newDecoded);

// eslint-disable-next-line no-console
console.log("== Summary ==");
// eslint-disable-next-line no-console
console.log(`old: name=${JSON.stringify(a.name)} parts=${a.parts} types=${a.counts.size} env=${a.env} colorRep=${a.colorRep}`);
// eslint-disable-next-line no-console
console.log(`new: name=${JSON.stringify(b.name)} parts=${b.parts} types=${b.counts.size} env=${b.env} colorRep=${b.colorRep}`);
// eslint-disable-next-line no-console
console.log("");

const oldMS = multiset(oldDecoded.parts);
const newMS = multiset(newDecoded.parts);

const removed = subtractCounts(oldMS, newMS);
const added = subtractCounts(newMS, oldMS);

const removedParts = expandMap(removed);
const addedParts = expandMap(added);

// eslint-disable-next-line no-console
console.log("== Exact Differences (tuple-level) ==");
// eslint-disable-next-line no-console
console.log(`removed: ${removedParts.length}, added: ${addedParts.length}`);
if (removedParts.length) {
  // eslint-disable-next-line no-console
  console.log("\nremoved (first):");
  for (const p of removedParts.slice(0, limit)) console.log(" - " + formatPart(p));
}
if (addedParts.length) {
  // eslint-disable-next-line no-console
  console.log("\nadded (first):");
  for (const p of addedParts.slice(0, limit)) console.log(" + " + formatPart(p));
}

// Try to interpret as moves within same blockType.
const { moves, unmatchedOld, unmatchedNew } = matchMoved(removedParts, addedParts);
if (moves.length || unmatchedOld.length || unmatchedNew.length) {
  // eslint-disable-next-line no-console
  console.log("\n== Interpreted Moves (greedy, same-type, small delta) ==");
  // eslint-disable-next-line no-console
  console.log(`moves: ${moves.length}, unmatchedRemoved: ${unmatchedOld.length}, unmatchedAdded: ${unmatchedNew.length}`);
  for (const m of moves.slice(0, limit)) {
    // eslint-disable-next-line no-console
    console.log(` * ${blockName(m.from.blockType)} Δ(${m.dx},${m.dy},${m.dz})  from (${m.from.x},${m.from.y},${m.from.z}) -> (${m.to.x},${m.to.y},${m.to.z}) rot=${m.from.rotation}`);
  }
}

