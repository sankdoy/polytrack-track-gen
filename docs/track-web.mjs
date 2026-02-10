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
  const placePiece = (blockType, rotation, checkpointOrder, startOrder, footprint) => {
    const part = {
      x, y, z, blockType, rotation,
      rotationAxis: RotationAxis.YPositive,
      color: ColorStyle.Default,
      checkpointOrder, startOrder,
    };
    placedByCell.set(anchorKey(x, y, z), part);
    placedSequence.push(part);
    lastPlacedKey = anchorKey(x, y, z);
    if (!reserveFootprint(x, y, z, blockType, footprint || flatFootprint)) {
      throw new Error("Internal: occupied footprint");
    }
  };

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
    const nextY = y + 1;
    if (nextY > maxHeightY) return false;
    const fp = forwardFootprint(heading, footprintTiles, 0, 1);
    const exit = nextPos(x, y, z, heading, 1);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    placePiece(longVariant ? BlockType.SlopeUpLong : BlockType.SlopeUp, heading, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    return true;
  };

  const placeSlopeDown = (longVariant) => {
    const footprintTiles = longVariant ? 2 : 1;
    if (y <= 0) return false;
    const nextY = y - 1; // slope-down blocks are anchored at the lower (exit) height
    const fp = forwardFootprint(heading, footprintTiles, 0, 1);
    const exit = nextPos(x, nextY, z, heading, 1);
    if (!canFootprint(x, nextY, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    y = nextY;
    placePiece(longVariant ? BlockType.SlopeDownLong : BlockType.SlopeDown, heading, null, null, fp);
    x = exit.x; z = exit.z;
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
    const fp = slopeFootprint2;
    const exit = nextPos(x, nextY, z, heading, 1);
    if (!canFootprint(x, nextY, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    y = nextY;
    placePiece(BlockType.Slope, (heading + 2) % 4, null, null, fp);
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
    const isLong = variant === "long";
    const footprintTiles = isLong ? 3 : 1;
    const fp = isLong ? turnSquareFootprint(heading, newHeading, footprintTiles, 0, 0) : flatFootprint;
    const exit = nextPos(x, y, z, newHeading, 1);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, exit.y, exit.z, newHeading, false)) return false;
    // Prefer exits with more free neighbors (avoid dead ends)
    if (countFreeNeighbors(exit.x, exit.y, exit.z) < 1) return false;
    const blockType = variant === "short" ? BlockType.TurnShort
                    : variant === "long"  ? BlockType.TurnLong3
                    : BlockType.TurnSharp;
    placePiece(blockType, turnRotation, null, null, fp);
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
    if (!isFree(x, y, z)) {
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
    if (y >= 2 && allowSteepSlopes) {
      const anchorY = y - 2;
      const exit = nextPos(x, anchorY, z, heading, 1);
      if (canFootprint(x, anchorY, z, slopeFootprint2) && (isFree(exit.x, anchorY, exit.z) || descentAttempts > 15)) {
        y = anchorY;
        placePiece(BlockType.Slope, (heading + 2) % 4, null, null, slopeFootprint2);
        const e = nextPos(x, y, z, heading, 1);
        x = e.x; z = e.z;
        continue;
      }
    }
    if (y >= 1) {
      const anchorY = y - 1;
      const exit = nextPos(x, anchorY, z, heading, 1);
      if (canFootprint(x, anchorY, z, slopeFootprint1) && (isFree(exit.x, anchorY, exit.z) || descentAttempts > 15)) {
        y = anchorY;
        placePiece(BlockType.SlopeDown, heading, null, null, slopeFootprint1);
        const e = nextPos(x, y, z, heading, 1);
        x = e.x; z = e.z;
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
        if (!canReserveAt(sx, sz, pos.y, pos.y) || rng() < 0.85) continue;
        const sceneryTypes = [BlockType.Block, BlockType.HalfBlock, BlockType.QuarterBlock];
        const sType = sceneryTypes[Math.floor(rng() * sceneryTypes.length)];
        const rot = Math.floor(rng() * 4);
        trackData.addPart(sx, pos.y, sz, sType, rot, RotationAxis.YPositive, ColorStyle.Default, null, null);
        reserveAt(sx, sz, pos.y, pos.y, sType);
      }
    }
  }

  const shareCode = encodeV3ShareCode(name, trackData);
  return { shareCode, trackData, name, seed, placedSequence };
}
