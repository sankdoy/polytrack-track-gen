/* eslint-disable */
// Browser-only track generator + v3 share code encoder.
// Requires `pako` on `globalThis` (loaded via <script> in index.html).

export const BlockType = {
  Straight: 0,
  TurnSharp: 1,
  SlopeUp: 2,
  SlopeDown: 3,
  Slope: 4,
  Start: 5,
  Finish: 6,
  PillarTop: 19,
  Pillar: 20,
  PillarBase: 21,
  TurnShort: 36,
  SlopeUpLong: 38,
  SlopeDownLong: 39,
  IntersectionT: 43,
  IntersectionCross: 44,
  Checkpoint: 52,
  Block: 29,
  HalfBlock: 53,
  QuarterBlock: 54,
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
for (const [name, id] of Object.entries(BlockType)) BlockTypeName[id] = name;

// ---- Encoding (must match game exactly) ----

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

function writeI32LE(out, v) {
  const x = v | 0;
  out.push(x & 255, (x >> 8) & 255, (x >> 16) & 255, (x >> 24) & 255);
}

function writeU32LE(out, v) {
  const x = (v >>> 0);
  out.push(x & 255, (x >> 8) & 255, (x >> 16) & 255, (x >> 24) & 255);
}

function writeVarUintLE(out, v, bytes) {
  let x = (v >>> 0);
  for (let i = 0; i < bytes; i++) {
    out.push(x & 255);
    x >>>= 8;
  }
}

function bytesForUnsigned(v) {
  const x = (v >>> 0);
  if (x <= 0xff) return 1;
  if (x <= 0xffff) return 2;
  if (x <= 0xffffff) return 3;
  return 4;
}

// ---- Track data structures ----

class TrackPart {
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

class TrackData {
  constructor(environment, colorRepresentation) {
    this.environment = environment;
    this.colorRepresentation = colorRepresentation;
    this.parts = new Map();
  }

  addPart(x, y, z, blockType, rotation, rotationAxis, color, checkpointOrder, startOrder) {
    const part = new TrackPart(x, y, z, blockType, rotation, rotationAxis, color, checkpointOrder, startOrder);
    if (!this.parts.has(blockType)) this.parts.set(blockType, []);
    this.parts.get(blockType).push(part);
    return part;
  }
}

// ---- v3 serializer ----

const V3_CHECKPOINT_ORDER_BLOCKS = [BlockType.Checkpoint];

function serializeV3Format(trackData) {
  const bytes = [];
  for (const [blockType, parts] of trackData.parts) {
    bytes.push(blockType & 255, (blockType >> 8) & 255);
    const count = parts.length;
    bytes.push(count & 255, (count >> 8) & 255, (count >> 16) & 255, (count >> 24) & 255);
    for (const p of parts) {
      const xRaw = Math.round(p.x / 4) + Math.pow(2, 23);
      bytes.push(xRaw & 255, (xRaw >> 8) & 255, (xRaw >> 16) & 255);
      const yRaw = p.y >>> 0;
      bytes.push(yRaw & 255, (yRaw >> 8) & 255, (yRaw >> 16) & 255);
      const zRaw = Math.round(p.z / 4) + Math.pow(2, 23);
      bytes.push(zRaw & 255, (zRaw >> 8) & 255, (zRaw >> 16) & 255);
      bytes.push(p.rotation & 3);
      if (V3_CHECKPOINT_ORDER_BLOCKS.includes(blockType)) {
        const co = p.checkpointOrder || 0;
        bytes.push(co & 255, (co >> 8) & 255);
      }
    }
  }
  return new Uint8Array(bytes);
}

export function encodeV3ShareCode(name, trackData) {
  const nameBytes = new TextEncoder().encode(name);
  const nameEncoded = customEncode(nameBytes);
  const nameLenBytes = customEncode(new Uint8Array([nameEncoded.length]));
  if (!globalThis.pako) throw new Error("pako not found on globalThis");
  const rawBytes = serializeV3Format(trackData);
  const deflated = globalThis.pako.deflate(rawBytes, { level: 9 });
  const trackEncoded = customEncode(deflated);
  return "v3" + nameLenBytes + nameEncoded + trackEncoded;
}

// ---- PolyTrack1 (new encoding) ----

const PT1_CHECKPOINT_BLOCKS = new Set([BlockType.Checkpoint, 65, 75, 77]);
const PT1_START_BLOCKS = new Set([BlockType.Start, 91, 92, 93]);

function serializePolyTrack1Format(trackData) {
  const parts = [];
  for (const [, ps] of trackData.parts) for (const p of ps) parts.push(p);

  let minX = 0, minY = 0, minZ = 0;
  if (parts.length) {
    minX = parts[0].x | 0;
    minY = parts[0].y | 0;
    minZ = parts[0].z | 0;
    for (const p of parts) {
      if (p.x < minX) minX = p.x | 0;
      if (p.y < minY) minY = p.y | 0;
      if (p.z < minZ) minZ = p.z | 0;
    }
  }

  let maxDX = 0, maxDY = 0, maxDZ = 0;
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
    const t = p.blockType & 255;
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(p);
  }

  const types = Array.from(byType.keys()).sort((a, b) => a - b);
  for (const t of types) {
    const ps = byType.get(t);
    out.push(t & 255);
    writeU32LE(out, ps.length);
    for (const p of ps) {
      writeVarUintLE(out, (p.x - minX) >>> 0, bytesX);
      writeVarUintLE(out, (p.y - minY) >>> 0, bytesY);
      writeVarUintLE(out, (p.z - minZ) >>> 0, bytesZ);
      out.push((p.rotation ?? 0) & 255);
      out.push((p.rotationAxis ?? 0) & 255);
      out.push((p.color ?? 0) & 255);

      if (PT1_CHECKPOINT_BLOCKS.has(t)) {
        const co = (p.checkpointOrder ?? 0) & 0xffff;
        out.push(co & 255, (co >> 8) & 255);
      }
      if (PT1_START_BLOCKS.has(t)) {
        writeU32LE(out, (p.startOrder ?? 0) >>> 0);
      }
    }
  }

  return new Uint8Array(out);
}

export function encodePolyTrack1ShareCode(name, trackData, author = "") {
  if (!globalThis.pako) throw new Error("pako not found on globalThis");

  const nameBytes = new TextEncoder().encode(String(name ?? ""));
  const authorBytes = new TextEncoder().encode(String(author ?? ""));

  const header = [];
  header.push(Math.min(255, nameBytes.length));
  for (let i = 0; i < Math.min(255, nameBytes.length); i++) header.push(nameBytes[i]);
  header.push(Math.min(255, authorBytes.length));
  for (let i = 0; i < Math.min(255, authorBytes.length); i++) header.push(authorBytes[i]);

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

// ---- Manual mini-tracks (for debugging alignment) ----

export const manualMiniTrackScenarios = [
  // Ramp calibration probes (we're focusing on slope anchoring + rotation).
  // Note: total pieces = (steps.length + Start + Finish). Aim for 6–10 total.
  { id: "ramp1", label: "ramp1 (up → flat → down)", steps: [{ kind: "up" }, { kind: "straight" }, { kind: "down" }, { kind: "straight" }] }, // 6 pieces
  { id: "ramp2", label: "ramp2 (upLong → flat → downLong)", steps: [{ kind: "up", long: true }, { kind: "straight" }, { kind: "down", long: true }, { kind: "straight" }] }, // 6 pieces
  { id: "ramp3", label: "ramp3 (steepUp → flat → steepDown)", steps: [{ kind: "steepUp" }, { kind: "straight" }, { kind: "steepDown" }, { kind: "straight" }] }, // 6 pieces
  { id: "ramp4", label: "ramp4 (east-facing ramps)", steps: [{ kind: "turn", dir: "R", variant: "sharp" }, { kind: "straight" }, { kind: "up", long: true }, { kind: "straight" }, { kind: "down", long: true }, { kind: "straight" }] }, // 8 pieces
  { id: "ramp5", label: "ramp5 (south-facing ramps)", steps: [{ kind: "turn", dir: "R", variant: "sharp" }, { kind: "turn", dir: "R", variant: "sharp" }, { kind: "straight" }, { kind: "up" }, { kind: "straight" }, { kind: "down" }, { kind: "straight" }] }, // 9 pieces
];

function getScenario(id) {
  const s = manualMiniTrackScenarios.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown manual scenario: ${id}`);
  return s;
}

export function generateManualMiniTrack(params = {}) {
  const {
    scenarioId = "ramp1",
    name = "Manual Mini Track",
    environment = "Summer",
    format = "polytrack1",
  } = params;

  const env = Environment[environment] ?? Environment.Summer;
  const trackData = new TrackData(env, 28);
  const placedSequence = [];
  const anchorTrace = [];

  const scenario = getScenario(scenarioId);

  let x = 0, y = 0, z = 0;
  let heading = 0; // 0=N, 1=W, 2=S, 3=E (matches HEADING_DELTA)

  const assertGrid = () => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      throw new Error(`Manual track left integer grid at (${x},${y},${z})`);
    }
    if ((x % TILE) !== 0 || (z % TILE) !== 0) {
      throw new Error(`Manual track left 4-grid at (${x},${y},${z})`);
    }
    if (!Number.isInteger(heading) || heading < 0 || heading > 3) {
      throw new Error(`Manual track invalid heading ${heading}`);
    }
    if (y < 0) throw new Error(`Manual track went below ground y=${y}`);
  };

  const addAt = (px, py, pz, blockType, rotation, checkpointOrder = null, startOrder = null) => {
    trackData.addPart(px, py, pz, blockType, rotation, RotationAxis.YPositive, ColorStyle.Default, checkpointOrder, startOrder);
    placedSequence.push({ x: px, y: py, z: pz, blockType, rotation });
  };
  const add = (blockType, rotation, checkpointOrder = null, startOrder = null) =>
    addAt(x, y, z, blockType, rotation, checkpointOrder, startOrder);

  const move = (h, tiles = 1) => {
    x += HEADING_DELTA[h].dx * tiles;
    z += HEADING_DELTA[h].dz * tiles;
  };

  // Start at origin, then advance 1 tile forward.
  anchorTrace.push({ event: "before", label: "Start", x, y, z, heading });
  add(BlockType.Start, heading, null, 0);
  move(heading, 1);
  assertGrid();
  anchorTrace.push({ event: "after", label: "Start", x, y, z, heading });

  for (const step of scenario.steps) {
    const before = { x, y, z, heading };
    if (step.kind === "straight") {
      add(BlockType.Straight, heading);
      move(heading, 1);
      assertGrid();
      anchorTrace.push({ label: "Straight", ...before, rotation: heading, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "up") {
      const tiles = step.long ? 2 : 1;
      const dy = Number.isFinite(step.dy) ? step.dy : (step.long ? 2 : 1);
      add(step.long ? BlockType.SlopeUpLong : BlockType.SlopeUp, heading);
      move(heading, tiles);
      y += dy;
      assertGrid();
      anchorTrace.push({ label: step.long ? "SlopeUpLong" : "SlopeUp", ...before, rotation: heading, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "down") {
      const tiles = step.long ? 2 : 1;
      const dy = Number.isFinite(step.dy) ? step.dy : (step.long ? 2 : 1);
      // Match generator behavior: slope-down pieces are anchored at the higher (entrance) height,
      // and store their rotation as the "uphill" direction (heading+2).
      const anchorAt = step.anchorAt || "high"; // "high" or "low" (override for experiments)
      const anchorForwardTiles = Number.isFinite(step.anchorForwardTiles) ? step.anchorForwardTiles : 0;
      const anchorYOffset = Number.isFinite(step.anchorYOffset) ? step.anchorYOffset : 0;

      if (anchorAt !== "low" && anchorAt !== "high") {
        throw new Error(`Unknown down anchorAt: ${anchorAt}`);
      }

      const entranceX = before.x, entranceY = before.y, entranceZ = before.z;
      const anchorBaseY = anchorAt === "high" ? entranceY : (entranceY - dy);
      const anchorX = entranceX + HEADING_DELTA[before.heading].dx * anchorForwardTiles;
      const anchorZ = entranceZ + HEADING_DELTA[before.heading].dz * anchorForwardTiles;
      const anchorY = anchorBaseY + anchorYOffset;

      const storedRotation = before.heading;
      addAt(anchorX, anchorY, anchorZ, step.long ? BlockType.SlopeDownLong : BlockType.SlopeDown, storedRotation);

      // Cursor always advances from entrance; height decreases by dy.
      x = entranceX; y = entranceY; z = entranceZ;
      move(heading, tiles);
      y -= dy;
      assertGrid();
      anchorTrace.push({
        label: `${step.long ? "SlopeDownLong" : "SlopeDown"} anchor=${anchorAt} F=${anchorForwardTiles} Y=${anchorYOffset}`,
        ...before,
        rotation: storedRotation,
        anchor: { x: anchorX, y: anchorY, z: anchorZ },
        after: { x, y, z, heading },
      });
      continue;
    }

    if (step.kind === "steepUp") {
      const dy = Number.isFinite(step.dy) ? step.dy : 2;
      add(BlockType.Slope, heading);
      move(heading, 1);
      y += dy;
      assertGrid();
      anchorTrace.push({ label: "Slope(steep up)", ...before, rotation: heading, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "steepDown") {
      const dy = Number.isFinite(step.dy) ? step.dy : 2;
      const storedRotation = before.heading;
      // Anchor at the higher (entrance) height.
      add(BlockType.Slope, storedRotation);
      move(heading, 1);
      y -= dy;
      assertGrid();
      anchorTrace.push({ label: "Slope(steep down)", ...before, rotation: storedRotation, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "turn") {
      const turnRight = step.dir === "R";
      let newHeading, turnRotation;
      if (turnRight) {
        turnRotation = heading;
        newHeading = (heading + 3) % 4;
      } else {
        turnRotation = (heading + 3) % 4;
        newHeading = (heading + 1) % 4;
      }
      const isShort = step.variant === "short";
      const isLong = step.variant === "long";

      const sizeTiles = Number.isFinite(step.sizeTiles) ? step.sizeTiles : (isLong ? 5 : isShort ? 2 : 1);
      const exitForwardTiles = Number.isFinite(step.exitTiles) ? step.exitTiles : (isLong ? 5 : isShort ? 2 : 1);
      const exitLateralTiles = Number.isFinite(step.lateralTiles) ? step.lateralTiles : (isLong ? 4 : isShort ? 1 : 0);

      const blockType = step.variant === "short" ? BlockType.TurnShort
                      : step.variant === "long"  ? BlockType.TurnLong3
                      : BlockType.TurnSharp;

      const entryForwardTiles = Number.isFinite(step.entryForwardTiles) ? step.entryForwardTiles : 0;
      const entryRightTiles = Number.isFinite(step.entryRightTiles) ? step.entryRightTiles : 0;
      const rightHeading = (before.heading + 3) % 4;

      const entranceX = before.x, entranceY = before.y, entranceZ = before.z;
      let anchorX = entranceX, anchorY = entranceY, anchorZ = entranceZ;

      // Mirror the generator’s model: TurnLong3(L) anchor is the opposite corner of its 5x5 footprint.
      if (isLong && !turnRight) {
        const shift = sizeTiles - 1;
        anchorX += HEADING_DELTA[before.heading].dx * shift + HEADING_DELTA[newHeading].dx * shift;
        anchorZ += HEADING_DELTA[before.heading].dz * shift + HEADING_DELTA[newHeading].dz * shift;
      }

      // Empirical: TurnShort(L) stores its anchor at the opposite corner of its 2x2 footprint:
      // shift 1 tile along the entry heading + 1 tile along the exit (new) heading.
      if (isShort && !turnRight) {
        const shift = sizeTiles - 1; // 1 tile for the 2x2 short turn
        anchorX += HEADING_DELTA[before.heading].dx * shift + HEADING_DELTA[newHeading].dx * shift;
        anchorZ += HEADING_DELTA[before.heading].dz * shift + HEADING_DELTA[newHeading].dz * shift;
      }

      if (entryForwardTiles || entryRightTiles) {
        anchorX += HEADING_DELTA[before.heading].dx * entryForwardTiles + HEADING_DELTA[rightHeading].dx * entryRightTiles;
        anchorZ += HEADING_DELTA[before.heading].dz * entryForwardTiles + HEADING_DELTA[rightHeading].dz * entryRightTiles;
      }

      addAt(anchorX, anchorY, anchorZ, blockType, turnRotation);
      heading = newHeading;
      x = entranceX + HEADING_DELTA[newHeading].dx * exitForwardTiles + HEADING_DELTA[before.heading].dx * exitLateralTiles;
      y = entranceY;
      z = entranceZ + HEADING_DELTA[newHeading].dz * exitForwardTiles + HEADING_DELTA[before.heading].dz * exitLateralTiles;
      assertGrid();
      anchorTrace.push({
        label: `${BlockTypeName[blockType] || blockType}${turnRight ? " (R)" : " (L)"} size=${sizeTiles} entryF=${entryForwardTiles} entryR=${entryRightTiles} exit=${exitForwardTiles}+lat${exitLateralTiles}`,
        ...before,
        rotation: turnRotation,
        anchor: { x: anchorX, y: anchorY, z: anchorZ },
        after: { x, y, z, heading },
      });
      continue;
    }

    throw new Error(`Unknown step kind: ${step?.kind}`);
  }

  anchorTrace.push({ event: "before", label: "Finish", x, y, z, heading });
  add(BlockType.Finish, heading);
  anchorTrace.push({ event: "after", label: "Finish", x, y, z, heading });

  const shareCode =
    format === "v3"
      ? encodeV3ShareCode(name, trackData)
      : encodePolyTrack1ShareCode(name, trackData, "");
  return { shareCode, trackData, name, seed: null, placedSequence, anchorTrace, manualScenarioId: scenarioId, manualScenarioLabel: scenario.label };
}

// ---- Generator helpers ----

const TILE = 4;

const HEADING_DELTA = [
  { dx: 0, dz: -TILE },  // 0 = North (-Z)
  { dx: -TILE, dz: 0 },  // 1 = West (-X)
  { dx: 0, dz: TILE },   // 2 = South (+Z)
  { dx: TILE, dz: 0 },   // 3 = East (+X)
];

function createRNG(seed) {
  let s = seed | 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Track generator ----

export function generateTrack(params = {}) {
  const {
    name = "Generated Track",
    length: trackLength = 30,
    elevation = 1,
    curviness = 1,
    numCheckpoints = 2,
    environment = "Summer",
    includeScenery = false,
    includePillars = false,
    seed = Date.now(),
    maxHeight = 24,
    maxAttemptsPerPiece = 25,
    allowIntersections = false,
    intersectionChance = 0.15,
    templateChance = 0.25,
    allowSteepSlopes = true,
    format = "polytrack1",
  } = params;

  const rng = createRNG(seed);
  const env = Environment[environment] ?? Environment.Summer;

  const elevationProb = Math.max(0, Math.min(0.8, elevation * 0.08));
  const turnProb = Math.max(0, Math.min(0.8, curviness * 0.09));
  const intersectionProb = Math.max(0, Math.min(1, intersectionChance));
  const templateProb = Math.max(0, Math.min(1, templateChance));
  const maxHeightY = Math.max(0, Math.floor(maxHeight));
  const attemptsPerPiece = Math.max(1, Math.floor(maxAttemptsPerPiece));

  let x = 0, y = 0, z = 0;
  let heading = 0;

  const placedByCell = new Map();
  const placedSequence = [];
  const footprintDebug = params.footprintDebug || false;
  const footprintDebugLimit = params.footprintDebugLimit || 50;
  const anchorKey = (px, py, pz) => `${px},${py},${pz}`;
  const xzKey = (px, pz) => `${px},${pz}`;

  // Track occupancy per (x,z) by integer Y levels.
  // Use a Set of occupied integer Y coordinates for each (x,z).
  const occupiedXZ = new Map(); // xzKey -> Set<number>
  const collidesAt = (px, pz, yMin, yMax) => {
    const key = xzKey(px, pz);
    const set = occupiedXZ.get(key);
    if (!set) return false;
    for (let yy = yMin; yy <= yMax; yy++) {
      if (set.has(yy)) return true;
    }
    return false;
  };
  const canReserveAt = (px, pz, yMin, yMax) => yMin >= 0 && !collidesAt(px, pz, yMin, yMax);
  const reserveAt = (px, pz, yMin, yMax, blockType) => {
    const key = xzKey(px, pz);
    let set = occupiedXZ.get(key);
    if (!set) {
      set = new Set();
      occupiedXZ.set(key, set);
    }
    for (let yy = yMin; yy <= yMax; yy++) set.add(yy);
  };
  const isFree = (px, py, pz) => canReserveAt(px, pz, py, py);
  const hasAnchor = (px, py, pz) => placedByCell.has(anchorKey(px, py, pz));

  const nextPos = (cx, cy, cz, h, tiles = 1) => ({
    x: cx + HEADING_DELTA[h].dx * tiles,
    y: cy,
    z: cz + HEADING_DELTA[h].dz * tiles,
  });

  const canFootprint = (ax, ay, az, footprint) => {
    for (const c of footprint) {
      const wx = ax + c.dx;
      const wz = az + c.dz;
      const yMin = ay + c.yMin;
      const yMax = ay + c.yMax;
      if (!canReserveAt(wx, wz, yMin, yMax)) return false;
    }
    return true;
  };
  const reserveFootprint = (ax, ay, az, blockType, footprint) => {
    // Helper: collect conflicts for debugging
    const footprintConflicts = (ax, ay, az, footprint) => {
      const conflicts = [];
      for (const c of footprint) {
        const wx = ax + c.dx;
        const wz = az + c.dz;
        const yMin = ay + c.yMin;
        const yMax = ay + c.yMax;
        const key = xzKey(wx, wz);
        const set = occupiedXZ.get(key);
        const bad = [];
        if (set) {
          for (let yy = yMin; yy <= yMax; yy++) if (set.has(yy)) bad.push(yy);
        }
        if (bad.length) conflicts.push({ wx, wz, yMin, yMax, bad });
      }
      return conflicts;
    };

    // Validate all footprint cells first
    for (const c of footprint) {
      const wx = ax + c.dx;
      const wz = az + c.dz;
      const yMin = ay + c.yMin;
      const yMax = ay + c.yMax;
      if (!canReserveAt(wx, wz, yMin, yMax)) {
        if (footprintDebug && placedSequence.length <= footprintDebugLimit) {
          const idx = placedSequence.length - 1;
          const part = placedSequence[idx] || { x: ax, y: ay, z: az, blockType };
          const conflicts = footprintConflicts(ax, ay, az, footprint);
          console.warn(`reserveFootprint: blocked at piece#${idx} ${BlockTypeName?.[part.blockType]||part.blockType} @ (${part.x},${part.y},${part.z})`);
          console.warn(`  footprint: ${JSON.stringify(footprint)}`);
          if (conflicts.length) {
            for (const cc of conflicts) {
              console.warn(`  conflict cell: (${cc.wx},[${cc.yMin}-${cc.yMax}],${cc.wz}) occupied Ys: ${cc.bad.join(",")}`);
            }
          } else {
            console.warn("  no existing occupied set found for these cells");
          }
        }
        return false;
      }
    }
    // Reserve
    for (const c of footprint) {
      const wx = ax + c.dx;
      const wz = az + c.dz;
      const yMin = ay + c.yMin;
      const yMax = ay + c.yMax;
      reserveAt(wx, wz, yMin, yMax, blockType);
      if (footprintDebug && placedSequence.length <= footprintDebugLimit) {
        const idx = placedSequence.length - 1;
        const part = placedSequence[idx] || { x: ax, y: ay, z: az, blockType };
        console.debug(`reserveFootprint: reserved for piece#${idx} ${BlockTypeName?.[part.blockType]||part.blockType} cell (${wx},[${yMin}-${yMax}],${wz})`);
      }
    }
    return true;
  };

  const flatFootprint = [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }];
  const slopeFootprint1 = [{ dx: 0, dz: 0, yMin: 0, yMax: 1 }];
  const slopeFootprint2 = [{ dx: 0, dz: 0, yMin: 0, yMax: 2 }];
  const slopeFootprint1Down = [{ dx: 0, dz: 0, yMin: -1, yMax: 0 }];
  const slopeFootprint2Down = [{ dx: 0, dz: 0, yMin: -2, yMax: 0 }];

  const forwardFootprint = (h, tiles, yMin, yMax) => {
    const fp = [];
    for (let i = 0; i < tiles; i++) {
      fp.push({ dx: HEADING_DELTA[h].dx * i, dz: HEADING_DELTA[h].dz * i, yMin, yMax });
    }
    return fp;
  };

  const turnSquareFootprint = (forwardHeading, sideHeading, tiles, yMin, yMax) => {
    const fp = [];
    for (let f = 0; f < tiles; f++) {
      for (let s = 0; s < tiles; s++) {
        fp.push({
          dx: HEADING_DELTA[forwardHeading].dx * f + HEADING_DELTA[sideHeading].dx * s,
          dz: HEADING_DELTA[forwardHeading].dz * f + HEADING_DELTA[sideHeading].dz * s,
          yMin,
          yMax,
        });
      }
    }
    return fp;
  };

  let lastPlacedKey = null;
  const placePieceAt = (px, py, pz, blockType, rotation, checkpointOrder, startOrder, footprint) => {
    const part = {
      x: px, y: py, z: pz, blockType, rotation,
      rotationAxis: RotationAxis.YPositive,
      color: ColorStyle.Default,
      checkpointOrder, startOrder,
    };
    placedByCell.set(anchorKey(px, py, pz), part);
    placedSequence.push(part);
    lastPlacedKey = anchorKey(px, py, pz);
    if (footprintDebug && placedSequence.length <= footprintDebugLimit) {
      const idx = placedSequence.length - 1;
      console.log(`piece#${idx}: ${BlockTypeName?.[blockType]||blockType} @ (${px},${py},${pz}) rot=${rotation} footprint=${JSON.stringify(footprint || flatFootprint)}`);
    }
    if (!reserveFootprint(px, py, pz, blockType, footprint || flatFootprint)) {
      throw new Error("Internal: occupied footprint");
    }
  };
  const placePiece = (blockType, rotation, checkpointOrder, startOrder, footprint) =>
    placePieceAt(x, y, z, blockType, rotation, checkpointOrder, startOrder, footprint);

  // Intersection helpers
  const axisForHeading = (h) => (h === 0 || h === 2) ? "NS" : "EW";
  const canExitIntoIntersection = (nx, ny, nz, travelHeading) => {
    if (!allowIntersections) return false;
    if (rng() >= intersectionProb) return false;
    const existing = placedByCell.get(anchorKey(nx, ny, nz));
    if (!existing) return false;
    if (existing.blockType === BlockType.IntersectionCross) return true;
    if (existing.blockType !== BlockType.Straight) return false;
    return axisForHeading(existing.rotation) !== axisForHeading(travelHeading);
  };
  const ensureIntersectionCrossAtCell = (px, py, pz, travelHeading) => {
    if (!allowIntersections) return false;
    const key = anchorKey(px, py, pz);
    const existing = placedByCell.get(key);
    if (!existing) return false;
    if (existing.blockType === BlockType.IntersectionCross) return true;
    if (existing.blockType !== BlockType.Straight) return false;
    if (axisForHeading(existing.rotation) === axisForHeading(travelHeading)) return false;
    existing.blockType = BlockType.IntersectionCross;
    existing.rotation = 0;
    return true;
  };

  // Check how many free neighbors a cell has (lookahead for avoiding dead ends)
  const countFreeNeighbors = (px, py, pz) => {
    let free = 0;
    for (let h = 0; h < 4; h++) {
      const n = nextPos(px, py, pz, h);
      if (isFree(n.x, n.y, n.z)) free++;
    }
    return free;
  };

  // ---- Place Start ----
  // Start piece is always at origin (0,0,0) in empty territory
  placePiece(BlockType.Start, heading, null, 0, flatFootprint);
  ({ x, y, z } = nextPos(x, y, z, heading, 1));

  let checkpointsPlaced = 0;
  const checkpointIntervalRaw = numCheckpoints > 0 ? Math.floor(trackLength / (numCheckpoints + 1)) : Infinity;
  const checkpointInterval = Number.isFinite(checkpointIntervalRaw) && checkpointIntervalRaw >= 1 ? checkpointIntervalRaw : 1;

  // Track turn tendency: creates sweeping curves instead of random zigzag
  let turnBias = rng() < 0.5 ? 1 : -1; // 1 = prefer right, -1 = prefer left
  let turnBiasCounter = 0;
  const BIAS_SWITCH_INTERVAL = 3 + Math.floor(rng() * 5);

  // ---- Templates from real track patterns ----
  const templates = [
    // Straight runs
    ["straight", "straight", "straight"],
    ["straight", "straight", "straight", "straight", "straight"],
    // Chicane (S-shape from turns)
    ["turnR", "straight", "turnL"],
    ["turnL", "straight", "turnR"],
    ["turnR", "straight", "straight", "turnL"],
    ["turnL", "straight", "straight", "turnR"],
    // Hill patterns
    ["up", "straight", "down"],
    ["up", "up", "straight", "down", "down"],
    ["up", "up", "up", "down", "down", "down"],
    ["up", "steepUp", "straight", "down", "down"],
    // Hill with turn at top
    ["up", "up", "turnR", "down", "down"],
    ["up", "up", "turnL", "down", "down"],
    // Sweeping curves
    ["turnR", "turnR", "straight", "straight"],
    ["turnL", "turnL", "straight", "straight"],
    ["straight", "turnR", "straight", "turnR"],
    ["straight", "turnL", "straight", "turnL"],
    // U-turn
    ["turnR", "turnR"],
    ["turnL", "turnL"],
    // Long gentle slopes
    ["upLong", "straight", "straight", "downLong"],
    ["upLong", "upLong", "downLong", "downLong"],
    // Mixed elevation + turn
    ["up", "turnR", "straight", "down"],
    ["up", "turnL", "straight", "down"],
    ["straight", "up", "straight", "turnR", "down", "straight"],
  ];
  const actionQueue = [];

  // ---- Piece placement functions ----

  const exitFreeOrIntersect = (ex, ey, ez, h, allowIntersectionEntry) =>
    isFree(ex, ey, ez) || (allowIntersectionEntry && canExitIntoIntersection(ex, ey, ez, h));

  const placeStraightLike = (blockType, cpOrder) => {
    const fp = flatFootprint;
    const exit = nextPos(x, y, z, heading, 1);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, exit.y, exit.z, heading, true)) return false;
    placePiece(blockType, heading, cpOrder ?? null, null, fp);
    x = exit.x; y = exit.y; z = exit.z;
    return true;
  };

  const placeSlopeUp = (longVariant) => {
    const footprintTiles = longVariant ? 2 : 1;
    const dy = longVariant ? 2 : 1;
    const nextY = y + dy;
    if (nextY > maxHeightY) return false;
    // Over-approx vertical span for collision: occupies [0..dy] across its footprint.
    const fp = forwardFootprint(heading, footprintTiles, 0, dy);
    const exitTiles = footprintTiles; // advance enough to clear the footprint
    const exit = nextPos(x, y, z, heading, exitTiles);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    placePiece(longVariant ? BlockType.SlopeUpLong : BlockType.SlopeUp, heading, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    return true;
  };

  const placeSlopeDown = (longVariant) => {
    const footprintTiles = longVariant ? 2 : 1;
    const dy = longVariant ? 2 : 1;
    if (y < dy) return false;
    const nextY = y - dy;
    const anchorX = x, anchorY = y, anchorZ = z; // slope-down blocks are anchored at the higher (entrance) height
    const storedRotation = heading; // store "downhill" travel direction
    // Over-approx vertical span for collision: occupies [-dy..0] across its forward footprint.
    const fp = longVariant
      ? forwardFootprint(heading, 2, -dy, 0)
      : forwardFootprint(heading, 1, -dy, 0);
    const exit = nextPos(x, nextY, z, heading, footprintTiles);
    if (!canFootprint(anchorX, anchorY, anchorZ, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    placePieceAt(anchorX, anchorY, anchorZ, longVariant ? BlockType.SlopeDownLong : BlockType.SlopeDown, storedRotation, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    return true;
  };

  const placeSlopeSteep = () => {
    const nextY = y + 2;
    if (nextY > maxHeightY) return false;
    const fp = slopeFootprint2;
    const exit = nextPos(x, y, z, heading, 1);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    placePiece(BlockType.Slope, heading, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    return true;
  };

  const placeSteepDown = () => {
    if (y < 2) return false;
    const nextY = y - 2;
    const fp = slopeFootprint2Down;
    const exit = nextPos(x, nextY, z, heading, 1);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    placePieceAt(x, y, z, BlockType.Slope, heading, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    return true;
  };

  const placeTurn90 = (turnRight, variant) => {
    let newHeading, turnRotation;
    if (turnRight) {
      turnRotation = heading;
      newHeading = (heading + 3) % 4;
    } else {
      turnRotation = (heading + 3) % 4;
      newHeading = (heading + 1) % 4;
    }
    // Turn geometry notes (empirically calibrated via in-game probes):
    // - TurnSharp: 1x1 footprint, exit is 1 tile in new heading.
    // - TurnShort: 2x2 footprint, exit is (2 tiles in new heading) + (1 tile in old heading).
    // - TurnLong3: 5x5 footprint, exit is (5 tiles in new heading) + (4 tiles in old heading).
    const isShort = variant === "short";
    const isSharp = variant === "sharp";
    const isLong = variant === "long";

    const footprintTiles = isLong ? 5 : isShort ? 2 : 1;
    // IMPORTANT: empirically, TurnLong3(L) appears to use a different anchor corner than TurnLong3(R).
    // We model this by shifting the stored anchor to the opposite corner of the square footprint, and
    // flipping footprint directions so collisions cover the actual occupied area.
    const entranceX = x, entranceY = y, entranceZ = z;
    let anchorX = entranceX, anchorZ = entranceZ;
    let fpForwardHeading = heading;
    let fpSideHeading = newHeading;
    if (isLong && !turnRight) {
      const shift = footprintTiles - 1; // 4 tiles for 5x5
      anchorX = entranceX + HEADING_DELTA[heading].dx * shift + HEADING_DELTA[newHeading].dx * shift;
      anchorZ = entranceZ + HEADING_DELTA[heading].dz * shift + HEADING_DELTA[newHeading].dz * shift;
      fpForwardHeading = (heading + 2) % 4;
      fpSideHeading = (newHeading + 2) % 4;
    }
    // Empirical: TurnShort(L) stores its anchor at the opposite corner of its 2x2 footprint.
    if (isShort && !turnRight) {
      const shift = footprintTiles - 1; // 1 tile for 2x2
      anchorX = entranceX + HEADING_DELTA[heading].dx * shift + HEADING_DELTA[newHeading].dx * shift;
      anchorZ = entranceZ + HEADING_DELTA[heading].dz * shift + HEADING_DELTA[newHeading].dz * shift;
      fpForwardHeading = (heading + 2) % 4;
      fpSideHeading = (newHeading + 2) % 4;
    }

    const fp = (isLong || isShort) ? turnSquareFootprint(fpForwardHeading, fpSideHeading, footprintTiles, 0, 0) : flatFootprint;

    const exitForwardTiles = isLong ? 5 : isShort ? 2 : 1;
    const exitLateralTiles = isLong ? 4 : isShort ? 1 : 0;
    const exit = {
      x: entranceX + HEADING_DELTA[newHeading].dx * exitForwardTiles + HEADING_DELTA[heading].dx * exitLateralTiles,
      y: entranceY,
      z: entranceZ + HEADING_DELTA[newHeading].dz * exitForwardTiles + HEADING_DELTA[heading].dz * exitLateralTiles,
    };
    if (!canFootprint(anchorX, y, anchorZ, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, exit.y, exit.z, newHeading, false)) return false;
    // Prefer exits with more free neighbors (avoid dead ends)
    if (countFreeNeighbors(exit.x, exit.y, exit.z) < 1) return false;
    const blockType = variant === "short" ? BlockType.TurnShort
                    : variant === "long"  ? BlockType.TurnLong3
                    : BlockType.TurnSharp;
    placePieceAt(anchorX, y, anchorZ, blockType, turnRotation, null, null, fp);
    heading = newHeading;
    x = exit.x; y = exit.y; z = exit.z;
    return true;
  };

  // Weighted turn type selection
  const pickTurnVariant = () => {
    const r = rng();
    if (r < 0.40) return "short";
    if (r < 0.70) return "sharp";
    return "long";
  };

  // Choose turn direction based on bias (creates flowing curves)
  const pickTurnDirection = () => {
    turnBiasCounter++;
    if (turnBiasCounter >= BIAS_SWITCH_INTERVAL) {
      turnBias = -turnBias;
      turnBiasCounter = 0;
    }
    return rng() < 0.7 ? (turnBias > 0) : (turnBias < 0);
  };

  // ---- Build the track ----

  let piecesPlaced = 0;
  let consecutiveStraight = 0;
  let justPlacedPiece = false; // Skip escape logic for one cycle after placement

  for (let i = 0; i < trackLength; i++) {
    // Skip escape logic immediately after placement; next iteration will use new x,y,z
    if (!justPlacedPiece && !isFree(x, y, z)) {
      if (hasAnchor(x, y, z) && ensureIntersectionCrossAtCell(x, y, z, heading)) {
        ({ x, y, z } = nextPos(x, y, z, heading, 1));
        continue;
      }
      // Try to escape: multiple strategies
      let escaped = false;
      // Strategy 1: turn left or right
      for (const dir of [1, 3]) {
        const tryHeading = (heading + dir) % 4;
        const tryExit = nextPos(x, y, z, tryHeading, 1);
        if (isFree(tryExit.x, tryExit.y, tryExit.z)) {
          heading = tryHeading;
          ({ x, y, z } = tryExit);
          escaped = true;
          break;
        }
      }
      // Strategy 2: go up/down at current position
      if (!escaped) {
        for (const dy of [1, -1]) {
          const tryY = y + dy;
          if (tryY >= 0 && tryY <= maxHeightY && isFree(x, tryY, z)) {
            y = tryY;
            escaped = true;
            break;
          }
        }
      }
      // Strategy 3: reverse
      if (!escaped) {
        const reverseH = (heading + 2) % 4;
        const tryExit = nextPos(x, y, z, reverseH, 1);
        if (isFree(tryExit.x, tryExit.y, tryExit.z)) {
          heading = reverseH;
          ({ x, y, z } = tryExit);
          escaped = true;
        }
      }
      if (!escaped) break;
    }

    // Force remaining checkpoints near the end
    const piecesLeft = trackLength - i;
    const checkpointsRemaining = numCheckpoints - checkpointsPlaced;
    const shouldCheckpoint =
      (checkpointsPlaced < numCheckpoints && (i + 1) % checkpointInterval === 0) ||
      (checkpointsRemaining > 0 && piecesLeft <= checkpointsRemaining + 2);

    // Force descent near end if elevated
    const nearEnd = piecesLeft <= y + 3;
    const shouldDescend = nearEnd && y > 0;

    let placed = false;

    for (let attempt = 0; attempt < attemptsPerPiece && !placed; attempt++) {
      // Checkpoint takes priority
      if (shouldCheckpoint && attempt === 0) {
        actionQueue.length = 0;
        placed = placeStraightLike(BlockType.Checkpoint, checkpointsPlaced);
        if (placed) { checkpointsPlaced++; piecesPlaced++; consecutiveStraight = 0; justPlacedPiece = true; }
        continue;
      }

      // Force descent when near end and elevated
      if (shouldDescend && attempt < 3) {
        if (y >= 2 && allowSteepSlopes) placed = placeSteepDown();
        if (!placed) placed = placeSlopeDown(false);
        if (placed) { piecesPlaced++; consecutiveStraight = 0; justPlacedPiece = true; continue; }
      }

      // Try template on first attempt
      if (attempt === 0 && !shouldCheckpoint && !shouldDescend) {
        if (actionQueue.length === 0 && templateProb > 0 && rng() < templateProb) {
          actionQueue.push(...templates[Math.floor(rng() * templates.length)]);
        }

        if (actionQueue.length > 0) {
          const a = actionQueue[0];
          let ok = false;
          if (a === "straight") ok = placeStraightLike(BlockType.Straight, null);
          else if (a === "turnR") ok = placeTurn90(true, pickTurnVariant());
          else if (a === "turnL") ok = placeTurn90(false, pickTurnVariant());
          else if (a === "up") ok = placeSlopeUp(rng() < 0.3);
          else if (a === "upLong") ok = placeSlopeUp(true);
          else if (a === "down") ok = placeSlopeDown(rng() < 0.3);
          else if (a === "downLong") ok = placeSlopeDown(true);
          else if (a === "steepUp") ok = allowSteepSlopes && placeSlopeSteep();
          if (ok) {
            actionQueue.shift();
            placed = true;
            piecesPlaced++;
            consecutiveStraight = (a === "straight") ? consecutiveStraight + 1 : 0;
            continue;
          }
          actionQueue.length = 0;
        }
      }

      // Elevation - bias toward descent when high, ascent when at ground
      if (!placed && elevationProb > 0 && rng() < elevationProb) {
        const r = rng();
        const descentBias = Math.min(0.6, y * 0.1); // Higher = more likely to descend
        if (r < descentBias) {
          placed = placeSlopeDown(rng() < 0.3);
          if (!placed && allowSteepSlopes && y >= 2) placed = placeSteepDown();
        } else if (allowSteepSlopes && r < descentBias + 0.15) {
          placed = placeSlopeSteep();
        } else {
          placed = placeSlopeUp(rng() < 0.3);
        }
        if (placed) { piecesPlaced++; consecutiveStraight = 0; continue; }
      }

      // Turns - use bias for flowing curves
      // Also force a turn if we've had too many straight pieces
      const forceTurn = consecutiveStraight >= 5 + Math.floor(rng() * 4);
      if (!placed && (forceTurn || (turnProb > 0 && rng() < turnProb))) {
        const variant = pickTurnVariant();
        const turnRight = pickTurnDirection();
        placed = placeTurn90(turnRight, variant);
        // If biased direction fails, try the other
        if (!placed) placed = placeTurn90(!turnRight, variant);
        if (placed) { piecesPlaced++; consecutiveStraight = 0; justPlacedPiece = true; continue; }
      }

      // Default: straight
      placed = placeStraightLike(BlockType.Straight, null);
      if (placed) { piecesPlaced++; consecutiveStraight++; justPlacedPiece = true; }
    }

    if (!placed) break;
    // Reset flag for next iteration; escape logic can now run if needed
    justPlacedPiece = false;
  }

  // ---- Descend to ground before checkpoints/finish ----
  let descentAttempts = 0;
  while (y > 0 && descentAttempts < 20) {
    descentAttempts++;
    if (y >= 2 && allowSteepSlopes) {
      const nextY = y - 2;
      const exit = nextPos(x, nextY, z, heading, 1);
      if (canFootprint(x, y, z, slopeFootprint2Down) && (isFree(exit.x, nextY, exit.z) || descentAttempts > 15)) {
        placePieceAt(x, y, z, BlockType.Slope, (heading + 2) % 4, null, null, slopeFootprint2Down);
        x = exit.x; y = nextY; z = exit.z;
        continue;
      }
    }
    if (y >= 1) {
      const nextY = y - 1;
      const exit = nextPos(x, nextY, z, heading, 1);
      if (canFootprint(x, y, z, slopeFootprint1Down) && (isFree(exit.x, nextY, exit.z) || descentAttempts > 15)) {
        placePieceAt(x, y, z, BlockType.SlopeDown, (heading + 2) % 4, null, null, slopeFootprint1Down);
        x = exit.x; y = nextY; z = exit.z;
        continue;
      }
    }
    // Try turning to find a descent path
    const tryH = (heading + (rng() < 0.5 ? 1 : 3)) % 4;
    const tryExit = nextPos(x, y, z, tryH, 1);
    if (isFree(x, y, z) && isFree(tryExit.x, tryExit.y, tryExit.z)) {
      placeStraightLike(BlockType.Straight, null);
      heading = tryH;
    } else {
      break;
    }
  }

  // ---- Ensure all checkpoints are placed before finish ----
  while (checkpointsPlaced < numCheckpoints) {
    const ok = placeStraightLike(BlockType.Checkpoint, checkpointsPlaced);
    if (!ok) break;
    checkpointsPlaced++;
  }

  // ---- Place Finish ----
  if (canFootprint(x, y, z, flatFootprint)) {
    placePiece(BlockType.Finish, heading, null, null, flatFootprint);
  } else {
    // Try adjacent cells in all directions
    let finishPlaced = false;
    const prevX = x - HEADING_DELTA[heading].dx;
    const prevZ = z - HEADING_DELTA[heading].dz;
    for (const tryH of [heading, (heading + 1) % 4, (heading + 3) % 4, (heading + 2) % 4]) {
      const alt = nextPos(prevX, y, prevZ, tryH, 1);
      if (canFootprint(alt.x, alt.y, alt.z, flatFootprint)) {
        x = alt.x; y = alt.y; z = alt.z;
        placePiece(BlockType.Finish, tryH, null, null, flatFootprint);
        finishPlaced = true;
        break;
      }
    }
    // Last resort: replace last piece with finish
    if (!finishPlaced) {
      const last = lastPlacedKey ? placedByCell.get(lastPlacedKey) : null;
      if (last && last.blockType !== BlockType.Start && last.blockType !== BlockType.Checkpoint) {
        last.blockType = BlockType.Finish;
        last.checkpointOrder = null;
      }
    }
  }

  // ---- Build TrackData ----
  const trackData = new TrackData(env, 28);
  const placedParts = Array.from(placedByCell.values()).sort((a, b) => {
    if (a.blockType !== b.blockType) return a.blockType - b.blockType;
    if (a.y !== b.y) return a.y - b.y;
    if (a.z !== b.z) return a.z - b.z;
    return a.x - b.x;
  });
  for (const p of placedParts) {
    trackData.addPart(p.x, p.y, p.z, p.blockType, p.rotation, p.rotationAxis, p.color, p.checkpointOrder, p.startOrder);
  }

  // ---- Pillars (supports) ----
  // Place a pillar every Nth elevated (non-ramp) track piece.
  // Pillars extend downward until ground (y=0) or until another track occupies the column.
  // Never place pillars beneath ramps/slopes of any kind.
  if (includePillars) {
    const isRamp = (t) =>
      t === BlockType.SlopeUp ||
      t === BlockType.SlopeDown ||
      t === BlockType.SlopeUpLong ||
      t === BlockType.SlopeDownLong ||
      t === BlockType.Slope;

    const PILLAR_SPACING = 10;
    let elevatedCount = 0;

    for (const p of placedSequence) {
      if (!p || p.y <= 0) continue;
      if (p.blockType === BlockType.Start) continue;
      if (isRamp(p.blockType)) continue;

      elevatedCount++;
      if ((elevatedCount % PILLAR_SPACING) !== 0) continue;

      const colX = p.x;
      const colZ = p.z;
      const startY = p.y - 1;
      if (startY < 0) continue;

      const set = occupiedXZ.get(xzKey(colX, colZ));
      let stopAt = -1;
      if (set) {
        for (let yy = startY; yy >= 0; yy--) {
          if (set.has(yy)) { stopAt = yy; break; }
        }
      }
      const minY = stopAt >= 0 ? (stopAt + 1) : 0;

      for (let yy = startY; yy >= minY; yy--) {
        if (!canReserveAt(colX, colZ, yy, yy)) break;
        const t =
          yy === startY ? BlockType.PillarTop :
          yy === 0 ? BlockType.PillarBase :
          BlockType.Pillar;
        // In-game pillar pieces appear to use rotation=2 (180°) consistently; rotationAxis/color are default.
        trackData.addPart(colX, yy, colZ, t, 2, RotationAxis.YPositive, ColorStyle.Default, null, null);
        reserveAt(colX, colZ, yy, yy, t);
      }
    }
  }

  // ---- Scenery ----
  if (includeScenery) {
    const roadPositions = [];
    for (const [t, parts] of trackData.parts) {
      // Only treat road-like pieces as sources for nearby scenery placement.
      if (
        t === BlockType.Block ||
        t === BlockType.HalfBlock ||
        t === BlockType.QuarterBlock ||
        t === BlockType.PillarTop ||
        t === BlockType.Pillar ||
        t === BlockType.PillarBase
      ) continue;
      for (const p of parts) roadPositions.push({ x: p.x, y: p.y, z: p.z });
    }
    for (const pos of roadPositions) {
      if (rng() < 0.7) continue;
      const offsets = [{ dx: 8, dz: 0 }, { dx: -8, dz: 0 }, { dx: 0, dz: 8 }, { dx: 0, dz: -8 }];
      for (const off of offsets) {
        const sx = pos.x + off.dx;
        const sz = pos.z + off.dz;
        if (!canReserveAt(sx, sz, pos.y, pos.y) || rng() < 0.85) continue;
        const sceneryTypes = [BlockType.Block, BlockType.HalfBlock, BlockType.QuarterBlock];
        const sType = sceneryTypes[Math.floor(rng() * sceneryTypes.length)];
        const rot = Math.floor(rng() * 4);
        trackData.addPart(sx, pos.y, sz, sType, rot, RotationAxis.YPositive, ColorStyle.Default, null, null);
        reserveAt(sx, sz, pos.y, pos.y, sType);
      }
    }
  }

  const shareCode =
    format === "v3"
      ? encodeV3ShareCode(name, trackData)
      : encodePolyTrack1ShareCode(name, trackData, "");
  return { shareCode, trackData, name, seed, placedSequence };
}
