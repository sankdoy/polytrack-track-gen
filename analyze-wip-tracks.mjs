import fs from "node:fs";
import { decodePolyTrack1 } from "./tools/polytrack1/lib.mjs";

// Extended block name map
const FULL_BLOCK_NAMES = {
  0: "Straight", 1: "TurnSharp", 2: "SlopeUp", 3: "SlopeDown", 4: "Slope",
  5: "Start", 6: "Finish", 7: "FinishWide", 8: "PlaneFinish", 9: "PlaneFinishWide",
  10: "TurnSLeft", 11: "TurnSRight",
  19: "PillarTop", 20: "Pillar", 21: "PillarBase",
  22: "WallA", 23: "WallB", 24: "WallC",
  25: "LoopStart", 26: "LoopEnd", 27: "LoopMid",
  28: "Pipe", 29: "Block", 30: "Wedge",
  31: "TunnelEntry", 32: "TunnelMid", 33: "TunnelExit",
  34: "BankLeft", 35: "BankRight",
  36: "TurnShort", 37: "SlopeUpShort", 38: "SlopeUpLong", 39: "SlopeDownLong",
  40: "SlopeDownShort", 41: "BridgeRamp", 42: "BridgeDeck",
  43: "IntersectionT", 44: "IntersectionCross",
  45: "CorkLeft", 46: "CorkRight",
  47: "HalfPipe", 48: "QuarterPipe",
  49: "WallRideLeft", 50: "WallRideRight",
  51: "JumpRamp", 52: "Checkpoint",
  53: "HalfBlock", 54: "QuarterBlock",
  55: "Cylinder", 56: "Cone", 57: "Arch",
  58: "Fence", 59: "Barrier",
  60: "LoopFull", 61: "LoopHalf",
  62: "SpiralUp", 63: "SpiralDown",
  64: "TubeOpen", 65: "CheckpointWide",
  66: "Booster", 67: "SlowZone",
  68: "WideRoad", 69: "NarrowRoad",
  70: "CurveBank", 71: "CurveBankWide",
  72: "StuntRamp", 73: "StuntRampWide",
  74: "HalfPipeWide", 75: "PlaneCheckpoint",
  76: "PlaneFinishNarrow", 77: "PlaneCheckpointWide",
  78: "Girder", 79: "GirderCross",
  80: "Platform", 81: "PlatformEdge",
  82: "Rail", 83: "TurnLong3",
  84: "TurnLong4", 85: "TurnLong5",
  86: "SlopeUpSteep", 87: "SlopeDownSteep",
  88: "Helix", 89: "HelixWide",
  90: "Corkscrew", 91: "StartAlt1", 92: "StartAlt2", 93: "StartAlt3",
  94: "Water", 95: "Lava",
};

function bn(id) {
  return FULL_BLOCK_NAMES[id] || `Unknown_${id}`;
}

// "Basic" generator blocks
const BASIC_BLOCKS = new Set([
  0, 1, 2, 3, 4, 5, 6, 19, 20, 21, 29, 36, 38, 39, 43, 44, 52, 53, 54, 83,
]);

const trackCodesFile = new URL("./TRACK_CODES_ONLY.txt", import.meta.url);
const lines = fs.readFileSync(trackCodesFile, "utf8").split("\n").map(l => l.trim()).filter(Boolean);

const perTrack = [];
const globalBlockFreq = {};
const globalAdjacency = {};
const globalColorStats = { totalColored: 0, colorCounts: {}, colorByBlockType: {} };
const globalRotationDist = {};
const allExoticTypes = new Set();
const allRawBlockIds = new Set();
let decodeErrors = 0;
let totalPieces = 0;

for (let i = 0; i < lines.length; i++) {
  const code = lines[i];
  const decoded = decodePolyTrack1(code);
  if (!decoded || decoded.error) {
    decodeErrors++;
    perTrack.push({ index: i, error: decoded?.error || "decode failed" });
    continue;
  }

  const parts = decoded.parts;
  const pieceCount = parts.length;
  totalPieces += pieceCount;
  const typeCounts = {};
  const uniqueTypes = new Set();
  let minY = Infinity, maxY = -Infinity;
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  for (const p of parts) {
    allRawBlockIds.add(p.blockType);
    const name = bn(p.blockType);
    typeCounts[name] = (typeCounts[name] || 0) + 1;
    uniqueTypes.add(name);

    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;

    globalBlockFreq[name] = (globalBlockFreq[name] || 0) + 1;
    globalRotationDist[p.rotation] = (globalRotationDist[p.rotation] || 0) + 1;

    if (p.color !== 0) {
      globalColorStats.totalColored++;
      globalColorStats.colorCounts[p.color] = (globalColorStats.colorCounts[p.color] || 0) + 1;
      const key = `${name}:color${p.color}`;
      globalColorStats.colorByBlockType[key] = (globalColorStats.colorByBlockType[key] || 0) + 1;
    }

    if (!BASIC_BLOCKS.has(p.blockType)) {
      allExoticTypes.add(`${name}(${p.blockType})`);
    }
  }

  // Adjacency pairs based on placement order
  for (let j = 0; j < parts.length - 1; j++) {
    const a = bn(parts[j].blockType);
    const b = bn(parts[j + 1].blockType);
    const key = `${a} -> ${b}`;
    globalAdjacency[key] = (globalAdjacency[key] || 0) + 1;
  }

  perTrack.push({
    index: i,
    name: decoded.name,
    author: decoded.author,
    environment: decoded.environment,
    colorRep: decoded.colorRep,
    pieceCount,
    heightRange: { minY, maxY, span: maxY - minY },
    bbox: {
      x: { min: minX, max: maxX, size: maxX - minX },
      z: { min: minZ, max: maxZ, size: maxZ - minZ },
    },
    uniqueTypeCount: uniqueTypes.size,
    uniqueTypes: Array.from(uniqueTypes).sort(),
  });
}

// Top 80 adjacency pairs
const topAdjacency = Object.entries(globalAdjacency)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 80)
  .map(([pair, count]) => ({ pair, count }));

// Sort global block freq descending
const sortedBlockFreq = Object.entries(globalBlockFreq)
  .sort((a, b) => b[1] - a[1])
  .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});

// Top color by block type
const topColorByBlock = Object.entries(globalColorStats.colorByBlockType)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 40)
  .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});

// Height/size stats
const heights = perTrack.filter(t => !t.error).map(t => t.heightRange.span);
const sizes = perTrack.filter(t => !t.error).map(t => Math.max(t.bbox.x.size, t.bbox.z.size));
const pieces = perTrack.filter(t => !t.error).map(t => t.pieceCount);

const result = {
  totalTracks: lines.length,
  decodeErrors,
  successfulTracks: lines.length - decodeErrors,
  totalPieces,
  avgPieces: Math.round(totalPieces / (lines.length - decodeErrors)),
  maxPieces: Math.max(...pieces),
  minPieces: Math.min(...pieces),
  avgHeight: Math.round(heights.reduce((a, b) => a + b, 0) / heights.length),
  maxHeight: Math.max(...heights),
  avgSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
  maxSize: Math.max(...sizes),
  allRawBlockIds: Array.from(allRawBlockIds).sort((a, b) => a - b),
  globalBlockFrequency: sortedBlockFreq,
  globalAdjacencyTop80: topAdjacency,
  rotationDistribution: globalRotationDist,
  colorUsage: {
    totalColored: globalColorStats.totalColored,
    colorCounts: globalColorStats.colorCounts,
    topColorByBlockType: topColorByBlock,
  },
  exoticBlockTypes: Array.from(allExoticTypes).sort(),
  perTrack,
};

console.log(JSON.stringify(result, null, 2));
