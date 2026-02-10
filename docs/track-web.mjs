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

  const elevationProb = Math.max(0, Math.min(0.8, elevation * 0.08));
  const turnProb = Math.max(0, Math.min(0.8, curviness * 0.09));
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
  placePiece(BlockType.Start, heading, null, 0);
  ({ x, y, z } = nextPos(x, y, z, heading));

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

  const placeSteepDown = () => {
    if (y < 2) return false;
    const nextY = y - 2;
    const exit = nextPos(x, nextY, z, heading);
    if (!isFree(x, nextY, z)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading)) return false;
    y = nextY;
    placePiece(BlockType.Slope, (heading + 2) % 4, null, null);
    x = exit.x; z = exit.z;
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
    // Prefer exits with more free neighbors (avoid dead ends)
    if (countFreeNeighbors(exit.x, exit.y, exit.z) < 1) return false;
    const blockType = variant === "short" ? BlockType.TurnShort
                    : variant === "long"  ? BlockType.TurnLong3
                    : BlockType.TurnSharp;
    placePiece(blockType, turnRotation, null, null);
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

  for (let i = 0; i < trackLength; i++) {
    // Handle occupied cell
    if (isOccupied(x, y, z)) {
      if (ensureIntersectionCrossAtCell(x, y, z, heading)) {
        ({ x, y, z } = nextPos(x, y, z, heading));
        continue;
      }
      // Try to escape: multiple strategies
      let escaped = false;
      // Strategy 1: turn left or right
      for (const dir of [1, 3]) {
        const tryHeading = (heading + dir) % 4;
        const tryExit = nextPos(x, y, z, tryHeading);
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
        const tryExit = nextPos(x, y, z, reverseH);
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
        if (placed) { checkpointsPlaced++; piecesPlaced++; consecutiveStraight = 0; }
        continue;
      }

      // Force descent when near end and elevated
      if (shouldDescend && attempt < 3) {
        if (y >= 2 && allowSteepSlopes) placed = placeSteepDown();
        if (!placed) placed = placeSlopeDown(false);
        if (placed) { piecesPlaced++; consecutiveStraight = 0; continue; }
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
        if (placed) { piecesPlaced++; consecutiveStraight = 0; continue; }
      }

      // Default: straight
      placed = placeStraightLike(BlockType.Straight, null);
      if (placed) { piecesPlaced++; consecutiveStraight++; }
    }

    if (!placed) break;
  }

  // ---- Descend to ground before checkpoints/finish ----
  let descentAttempts = 0;
  while (y > 0 && descentAttempts < 20) {
    descentAttempts++;
    if (y >= 2 && allowSteepSlopes && isFree(x, y - 2, z)) {
      const exit = nextPos(x, y - 2, z, heading);
      if (isFree(x, y - 2, z) && (isFree(exit.x, y - 2, exit.z) || descentAttempts > 15)) {
        y -= 2;
        placePiece(BlockType.Slope, (heading + 2) % 4, null, null);
        const e = nextPos(x, y, z, heading);
        x = e.x; z = e.z;
        continue;
      }
    }
    if (y >= 1 && isFree(x, y - 1, z)) {
      const exit = nextPos(x, y - 1, z, heading);
      if (isFree(x, y - 1, z) && (isFree(exit.x, y - 1, exit.z) || descentAttempts > 15)) {
        y -= 1;
        placePiece(BlockType.SlopeDown, heading, null, null);
        const e = nextPos(x, y, z, heading);
        x = e.x; z = e.z;
        continue;
      }
    }
    // Try turning to find a descent path
    const tryH = (heading + (rng() < 0.5 ? 1 : 3)) % 4;
    const tryExit = nextPos(x, y, z, tryH);
    if (isFree(x, y, z) && isFree(tryExit.x, tryExit.y, tryExit.z)) {
      placeStraightLike(BlockType.Straight, null);
      heading = tryH;
    } else {
      break;
    }
  }

  // ---- Ensure all checkpoints are placed before finish ----
  while (checkpointsPlaced < numCheckpoints) {
    if (!isFree(x, y, z)) break;
    const exit = nextPos(x, y, z, heading);
    if (!isFree(exit.x, exit.y, exit.z) && !isFree(exit.x, y, exit.z)) break;
    placePiece(BlockType.Checkpoint, heading, checkpointsPlaced, null);
    checkpointsPlaced++;
    x = exit.x; z = exit.z;
  }

  // ---- Place Finish ----
  if (isFree(x, y, z)) {
    placePiece(BlockType.Finish, heading, null, null);
  } else {
    // Try adjacent cells in all directions
    let finishPlaced = false;
    const prevX = x - HEADING_DELTA[heading].dx;
    const prevZ = z - HEADING_DELTA[heading].dz;
    for (const tryH of [heading, (heading + 1) % 4, (heading + 3) % 4, (heading + 2) % 4]) {
      const alt = nextPos(prevX, y, prevZ, tryH);
      if (isFree(alt.x, alt.y, alt.z)) {
        x = alt.x; y = alt.y; z = alt.z;
        placePiece(BlockType.Finish, tryH, null, null);
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
