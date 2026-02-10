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
  TurnShort: 36,
  SlopeUpLong: 38,
  SlopeDownLong: 39,
  TurnSLeft: 41,
  TurnSRight: 42,
  IntersectionT: 43,
  IntersectionCross: 44,
  Checkpoint: 52,
  Block: 29,
  HalfBlock: 53,
  QuarterBlock: 54,
  TurnLong3: 83,
};

export const Environment = {
  Default: 0,
  Summer: 1,
  Winter: 2,
  Desert: 3,
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

// ---- Generator helpers ----

const HEADING_DELTA = [
  { dx: 0, dz: -4 },  // 0 = North (-Z)
  { dx: -4, dz: 0 },  // 1 = West (-X)
  { dx: 0, dz: 4 },   // 2 = South (+Z)
  { dx: 4, dz: 0 },   // 3 = East (+X)
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
    seed = Date.now(),
    maxHeight = 24,
    maxAttemptsPerPiece = 25,
    allowIntersections = false,
    intersectionChance = 0.15,
    templateChance = 0.25,
    allowSteepSlopes = true,
  } = params;

  const rng = createRNG(seed);
  const env = Environment[environment] ?? Environment.Summer;

  const elevationProb = Math.max(0, Math.min(0.95, elevation * 0.1));
  const turnProb = Math.max(0, Math.min(0.95, curviness * 0.18));
  const intersectionProb = Math.max(0, Math.min(1, intersectionChance));
  const templateProb = Math.max(0, Math.min(1, templateChance));
  const maxHeightY = Math.max(0, Math.floor(maxHeight));
  const attemptsPerPiece = Math.max(1, Math.floor(maxAttemptsPerPiece));

  let x = 0, y = 0, z = 0;
  let heading = 0;

  const occupied = new Set();
  const placedByCell = new Map();
  const cellKey = (px, py, pz) => `${px},${py},${pz}`;
  const markOccupied = (px, py, pz) => occupied.add(cellKey(px, py, pz));
  const isOccupied = (px, py, pz) => occupied.has(cellKey(px, py, pz));
  const isFree = (px, py, pz) => !isOccupied(px, py, pz) && py >= 0;
  const nextPos = (cx, cy, cz, h) => ({
    x: cx + HEADING_DELTA[h].dx,
    y: cy,
    z: cz + HEADING_DELTA[h].dz,
  });

  let lastPlacedKey = null;
  const placePiece = (blockType, rotation, checkpointOrder, startOrder) => {
    placedByCell.set(cellKey(x, y, z), {
      x, y, z, blockType, rotation,
      rotationAxis: RotationAxis.YPositive,
      color: ColorStyle.Default,
      checkpointOrder, startOrder,
    });
    lastPlacedKey = cellKey(x, y, z);
    markOccupied(x, y, z);
  };

  // Intersection helpers
  const axisForHeading = (h) => (h === 0 || h === 2) ? "NS" : "EW";
  const canExitIntoIntersection = (nx, ny, nz, travelHeading) => {
    if (!allowIntersections) return false;
    if (!isOccupied(nx, ny, nz)) return false;
    if (rng() >= intersectionProb) return false;
    const existing = placedByCell.get(cellKey(nx, ny, nz));
    if (!existing) return false;
    if (existing.blockType === BlockType.IntersectionCross) return true;
    if (existing.blockType !== BlockType.Straight) return false;
    return axisForHeading(existing.rotation) !== axisForHeading(travelHeading);
  };
  const ensureIntersectionCrossAtCell = (px, py, pz, travelHeading) => {
    if (!allowIntersections) return false;
    const key = cellKey(px, py, pz);
    const existing = placedByCell.get(key);
    if (!existing) return false;
    if (existing.blockType === BlockType.IntersectionCross) return true;
    if (existing.blockType !== BlockType.Straight) return false;
    if (axisForHeading(existing.rotation) === axisForHeading(travelHeading)) return false;
    existing.blockType = BlockType.IntersectionCross;
    existing.rotation = 0;
    return true;
  };

  // ---- Place Start ----
  placePiece(BlockType.Start, heading, null, 0);
  ({ x, y, z } = nextPos(x, y, z, heading));

  let checkpointsPlaced = 0;
  const checkpointIntervalRaw = numCheckpoints > 0 ? Math.floor(trackLength / (numCheckpoints + 1)) : Infinity;
  const checkpointInterval = Number.isFinite(checkpointIntervalRaw) && checkpointIntervalRaw >= 1 ? checkpointIntervalRaw : 1;

  // ---- Templates from real track patterns ----
  const templates = [
    ["straight", "straight", "straight"],
    ["straight", "straight", "straight", "straight"],
    ["turnR", "straight", "turnL"],
    ["turnL", "straight", "turnR"],
    ["turnR", "straight", "straight", "turnL"],
    ["sLeft", "straight", "sRight"],
    ["sRight", "straight", "sLeft"],
    ["up", "down"],
    ["up", "straight", "down"],
    ["up", "steepUp", "down", "down"],
    ["straight", "straight", "up", "steepUp", "down"],
    ["up", "up", "up", "down", "down", "down"],
    ["upLong", "upLong", "upLong"],
    ["turnShort", "turnShort", "turnShort"],
    ["straight", "straight", "turnShort", "turnShort"],
    ["turnShort", "straight", "straight", "turnShort"],
  ];
  const actionQueue = [];

  // ---- Piece placement functions ----

  const exitFreeOrIntersect = (ex, ey, ez, h) =>
    isFree(ex, ey, ez) || canExitIntoIntersection(ex, ey, ez, h);

  const placeStraightLike = (blockType, cpOrder) => {
    const exit = nextPos(x, y, z, heading);
    if (!isFree(x, y, z)) return false;
    if (!exitFreeOrIntersect(exit.x, exit.y, exit.z, heading)) return false;
    placePiece(blockType, heading, cpOrder ?? null, null);
    x = exit.x; y = exit.y; z = exit.z;
    return true;
  };

  const placeSlopeUp = (longVariant) => {
    const nextY = y + 1;
    if (nextY > maxHeightY) return false;
    const exit = nextPos(x, y, z, heading);
    if (!isFree(x, y, z)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading)) return false;
    placePiece(longVariant ? BlockType.SlopeUpLong : BlockType.SlopeUp, heading, null, null);
    x = exit.x; y = nextY; z = exit.z;
    return true;
  };

  const placeSlopeDown = (longVariant) => {
    if (y <= 0) return false;
    const nextY = y - 1;
    const exit = nextPos(x, nextY, z, heading);
    if (!isFree(x, nextY, z)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading)) return false;
    y = nextY;
    placePiece(longVariant ? BlockType.SlopeDownLong : BlockType.SlopeDown, heading, null, null);
    x = exit.x; z = exit.z;
    return true;
  };

  const placeSlopeSteep = () => {
    const nextY = y + 2;
    if (nextY > maxHeightY) return false;
    const exit = nextPos(x, y, z, heading);
    if (!isFree(x, y, z)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading)) return false;
    placePiece(BlockType.Slope, heading, null, null);
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
    const exit = nextPos(x, y, z, newHeading);
    if (!isFree(x, y, z)) return false;
    if (!exitFreeOrIntersect(exit.x, exit.y, exit.z, newHeading)) return false;
    const blockType = variant === "short" ? BlockType.TurnShort
                    : variant === "long"  ? BlockType.TurnLong3
                    : BlockType.TurnSharp;
    placePiece(blockType, turnRotation, null, null);
    heading = newHeading;
    x = exit.x; y = exit.y; z = exit.z;
    return true;
  };

  const placeSCurve = (goLeft) => {
    // S-curve: advance forward + shift laterally, same heading
    const leftDir = (heading + 1) % 4;
    const rightDir = (heading + 3) % 4;
    const lateralDir = goLeft ? leftDir : rightDir;
    const ex = x + HEADING_DELTA[heading].dx + HEADING_DELTA[lateralDir].dx;
    const ez = z + HEADING_DELTA[heading].dz + HEADING_DELTA[lateralDir].dz;
    if (!isFree(x, y, z)) return false;
    if (!isFree(ex, y, ez)) return false;
    placePiece(goLeft ? BlockType.TurnSLeft : BlockType.TurnSRight, heading, null, null);
    x = ex; z = ez;
    return true;
  };

  // Weighted turn type selection
  const pickTurnVariant = () => {
    const r = rng();
    if (r < 0.45) return "short";  // TurnShort most common (44% of real tracks)
    if (r < 0.75) return "sharp";  // TurnSharp (28% of real tracks)
    return "long";                  // TurnLong3 (29% of real tracks)
  };

  // ---- Build the track ----

  for (let i = 0; i < trackLength; i++) {
    if (isOccupied(x, y, z)) {
      if (ensureIntersectionCrossAtCell(x, y, z, heading)) {
        ({ x, y, z } = nextPos(x, y, z, heading));
        continue;
      }
      break;
    }

    const shouldCheckpoint = checkpointsPlaced < numCheckpoints && (i + 1) % checkpointInterval === 0;
    let placed = false;

    for (let attempt = 0; attempt < attemptsPerPiece && !placed; attempt++) {
      // Checkpoint takes priority
      if (shouldCheckpoint && attempt === 0) {
        actionQueue.length = 0;
        placed = placeStraightLike(BlockType.Checkpoint, checkpointsPlaced);
        if (placed) checkpointsPlaced++;
        continue;
      }

      // Try template on first attempt
      if (attempt === 0 && !shouldCheckpoint) {
        if (actionQueue.length === 0 && templateProb > 0 && rng() < templateProb) {
          actionQueue.push(...templates[Math.floor(rng() * templates.length)]);
        }

        if (actionQueue.length > 0) {
          const a = actionQueue[0];
          let ok = false;
          if (a === "straight") ok = placeStraightLike(BlockType.Straight, null);
          else if (a === "turnR") ok = placeTurn90(true, pickTurnVariant());
          else if (a === "turnL") ok = placeTurn90(false, pickTurnVariant());
          else if (a === "turnShort") ok = placeTurn90(rng() < 0.5, "short");
          else if (a === "sLeft") ok = placeSCurve(true);
          else if (a === "sRight") ok = placeSCurve(false);
          else if (a === "up") ok = placeSlopeUp(rng() < 0.3);
          else if (a === "upLong") ok = placeSlopeUp(true);
          else if (a === "down") ok = placeSlopeDown(rng() < 0.3);
          else if (a === "downLong") ok = placeSlopeDown(true);
          else if (a === "steepUp") ok = allowSteepSlopes && placeSlopeSteep();
          if (ok) {
            actionQueue.shift();
            placed = true;
            continue;
          }
          actionQueue.length = 0;
        }
      }

      // Elevation
      if (!placed && elevationProb > 0 && rng() < elevationProb) {
        const r = rng();
        if (allowSteepSlopes && r < 0.2) placed = placeSlopeSteep();
        else if (r < 0.55) placed = placeSlopeUp(rng() < 0.3);
        else placed = placeSlopeDown(rng() < 0.3);
        if (placed) continue;
      }

      // Turns and S-curves
      if (!placed && turnProb > 0 && rng() < turnProb) {
        const r = rng();
        if (r < 0.15) {
          placed = placeSCurve(rng() < 0.5);
        } else {
          const variant = pickTurnVariant();
          placed = placeTurn90(rng() < 0.5, variant);
        }
        if (placed) continue;
      }

      // Default: straight
      placed = placeStraightLike(BlockType.Straight, null);
    }

    if (!placed) break;
  }

  // ---- Place Finish ----
  for (let n = 0; n < 8 && isOccupied(x, y, z); n++) {
    if (!ensureIntersectionCrossAtCell(x, y, z, heading)) break;
    ({ x, y, z } = nextPos(x, y, z, heading));
  }

  if (isFree(x, y, z)) {
    placePiece(BlockType.Finish, heading, numCheckpoints, null);
  } else {
    const last = lastPlacedKey ? placedByCell.get(lastPlacedKey) : null;
    if (last && last.blockType === BlockType.Straight) {
      last.blockType = BlockType.Finish;
      last.rotation = heading;
      last.checkpointOrder = numCheckpoints;
    }
  }

  // ---- Build TrackData ----
  const trackData = new TrackData(env, 0);
  const placedParts = Array.from(placedByCell.values()).sort((a, b) => {
    if (a.blockType !== b.blockType) return a.blockType - b.blockType;
    if (a.y !== b.y) return a.y - b.y;
    if (a.z !== b.z) return a.z - b.z;
    return a.x - b.x;
  });
  for (const p of placedParts) {
    trackData.addPart(p.x, p.y, p.z, p.blockType, p.rotation, p.rotationAxis, p.color, p.checkpointOrder, p.startOrder);
  }

  // ---- Scenery ----
  if (includeScenery) {
    const roadPositions = [];
    for (const parts of trackData.parts.values()) {
      for (const p of parts) roadPositions.push({ x: p.x, y: p.y, z: p.z });
    }
    for (const pos of roadPositions) {
      if (rng() < 0.7) continue;
      const offsets = [{ dx: 8, dz: 0 }, { dx: -8, dz: 0 }, { dx: 0, dz: 8 }, { dx: 0, dz: -8 }];
      for (const off of offsets) {
        const sx = pos.x + off.dx;
        const sz = pos.z + off.dz;
        const key = cellKey(sx, pos.y, sz);
        if (occupied.has(key) || rng() < 0.85) continue;
        const sceneryTypes = [BlockType.Block, BlockType.HalfBlock, BlockType.QuarterBlock];
        const sType = sceneryTypes[Math.floor(rng() * sceneryTypes.length)];
        const rot = Math.floor(rng() * 4);
        trackData.addPart(sx, pos.y, sz, sType, rot, RotationAxis.YPositive, ColorStyle.Default, null, null);
        occupied.add(key);
      }
    }
  }

  const shareCode = encodeV3ShareCode(name, trackData);
  return { shareCode, trackData };
}
