/* eslint-disable */
// WIP Experimental Track Generator
// Imports shared encoding from track-web.mjs, has its own generation logic.
// Uses exotic block types, colors, and patterns learned from 52 reference tracks.

import {
  BlockType, BlockTypeName, Environment, RotationAxis, ColorStyle,
  TrackData, TrackPart,
  encodePolyTrack1ShareCode, encodeV3ShareCode,
} from "./track-web.mjs?v=2026-02-13";

// ---- Extended block types from analysis of 52 reference tracks ----
// These are IDs discovered in real community tracks.
const WipBlock = {
  // Road variants
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
  IntersectionCross: 44,
  Checkpoint: 52,
  TurnLong3: 83,

  // Exotic road pieces (from reference tracks)
  TurnSLeft: 10,
  TurnSRight: 11,
  SlopeUpShort: 37,
  SlopeUpSteep: 86,
  SlopeDownSteep: 87,
  BankLeft: 34,
  BankRight: 35,
  CurveBank: 70,
  CurveBankWide: 71,
  WideRoad: 68,
  NarrowRoad: 69,
  Booster: 66,
  JumpRamp: 51,
  StuntRamp: 72,
  StuntRampWide: 73,

  // Loop/corkscrew pieces
  LoopStart: 25,
  LoopEnd: 26,
  LoopMid: 27,
  LoopHalf: 61,
  LoopFull: 60,
  Helix: 88,
  Corkscrew: 90,
  CorkLeft: 45,
  CorkRight: 46,
  SpiralUp: 62,
  SpiralDown: 63,

  // Wall ride / pipe
  WallRideLeft: 49,
  WallRideRight: 50,
  Pipe: 28,
  HalfPipe: 47,
  QuarterPipe: 48,
  HalfPipeWide: 74,
  TubeOpen: 64,

  // Tunnel
  TunnelEntry: 31,
  TunnelMid: 32,
  TunnelExit: 33,

  // Bridge
  BridgeRamp: 41,
  BridgeDeck: 42,

  // Structure / decoration
  Block: 29,
  HalfBlock: 53,
  QuarterBlock: 54,
  Wedge: 30,
  Cylinder: 55,
  Cone: 56,
  Arch: 57,
  Fence: 58,
  Barrier: 59,
  Platform: 80,
  PlatformEdge: 81,
  Girder: 78,
  GirderCross: 79,
  Rail: 82,
  WallA: 22,

  // Pillars
  PillarTop: 19,
  Pillar: 20,
  PillarBase: 21,

  // Checkpoint/start variants
  CheckpointWide: 65,
  PlaneCheckpoint: 75,
  PlaneCheckpointWide: 77,
  FinishWide: 7,
};

const WipBlockName = {};
for (const [name, id] of Object.entries(WipBlock)) WipBlockName[id] = name;

// ---- Color palette (from analysis: colors 1-3, 32-40 are most used) ----
const COLOR = {
  DEFAULT: 0,
  WHITE: 1,      // 155K uses - most popular
  DARK: 2,       // 84K uses
  GREEN: 3,      // 74K uses
  RED: 32,       // 53K uses
  ORANGE: 33,    // 21K uses
  YELLOW: 34,    // 14K uses
  BLUE: 36,      // 28K uses
  PURPLE: 37,    // 12K uses
  TEAL: 38,      // 4K uses
  PINK: 39,      // 4.5K uses
  BROWN: 40,     // 15K uses
};

// Scenery color themes
const THEME_FOREST = { trunk: COLOR.BROWN, leaves: COLOR.GREEN, ground: COLOR.DARK };
const THEME_URBAN = { wall: COLOR.WHITE, roof: COLOR.DARK, accent: COLOR.RED };
const THEME_DESERT = { sand: COLOR.YELLOW, rock: COLOR.ORANGE, sky: COLOR.BLUE };
const THEME_NEON = { glow1: COLOR.PURPLE, glow2: COLOR.PINK, glow3: COLOR.TEAL };

// ---- Grid constants ----
const TILE = 4;
const HEADING_DELTA = [
  { dx: 0, dz: -TILE },  // 0 = North (-Z)
  { dx: -TILE, dz: 0 },  // 1 = West (-X)
  { dx: 0, dz: TILE },   // 2 = South (+Z)
  { dx: TILE, dz: 0 },   // 3 = East (+X)
];

// Checkpoint blocks that need 2-byte order in PolyTrack1
const PT1_CHECKPOINT_BLOCKS = new Set([WipBlock.Checkpoint, 65, 75, 77]);
const PT1_START_BLOCKS = new Set([WipBlock.Start, 91, 92, 93]);

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

// ---- WIP Templates (richer than main generator) ----
// These include exotic pieces and more dramatic sequences.
const WIP_TEMPLATES = [
  // Basic flowing
  ["straight", "straight", "straight", "straight"],
  ["turnR", "straight", "turnL"],
  ["turnL", "straight", "turnR"],

  // Hills
  ["up", "up", "straight", "down", "down"],
  ["upLong", "straight", "straight", "downLong"],
  ["up", "up", "up", "straight", "straight", "down", "down", "down"],

  // Big hill with turn at peak
  ["up", "up", "up", "turnR", "straight", "down", "down", "down"],
  ["upLong", "upLong", "turnL", "downLong", "downLong"],

  // Sweeping curves
  ["turnR", "turnR", "straight", "straight"],
  ["turnL", "turnL", "straight", "straight"],
  ["straight", "turnR", "straight", "turnR", "straight"],

  // U-turns
  ["turnR", "turnR"],
  ["turnL", "turnL"],

  // Jump
  ["jump"],

  // Double hill (valley)
  ["up", "up", "down", "down", "up", "up", "down", "down"],

  // Zigzag descent
  ["down", "turnR", "down", "turnL", "down"],

  // Speed section (long straights with booster feeling)
  ["straight", "straight", "straight", "straight", "straight", "straight"],

  // Tunnel section
  ["tunnel"],

  // Wall ride section
  ["wallride"],

  // Loop section
  ["loop"],

  // Helix climb
  ["helix_up"],

  // Stunt section
  ["stunt"],

  // Archway corridor
  ["archway"],

  // Big jump (longer runup)
  ["bigJump"],

  // Pipe section
  ["pipeSection"],
];

const EXOTIC_TEMPLATE_ACTIONS = new Set([
  "tunnel",
  "wallride",
  "loop",
  "helix_up",
  "stunt",
  "archway",
  "pipeSection",
  "bigJump",
]);
const BASIC_WIP_TEMPLATES = WIP_TEMPLATES.filter((tpl) => !tpl.some((a) => EXOTIC_TEMPLATE_ACTIONS.has(a)));
const EXOTIC_WIP_TEMPLATES = WIP_TEMPLATES.filter((tpl) => tpl.some((a) => EXOTIC_TEMPLATE_ACTIONS.has(a)));

// ---- Main WIP Generator ----

export function generateWipTrack(params = {}) {
  const {
    name = "WIP Track",
    length: trackLength = 50,
    elevation = 3,
    curviness = 3,
    numCheckpoints = 2,
    environment = "Summer",
    includeScenery = true,
    seed = Date.now(),
    maxHeight = 60,
    maxAttemptsPerPiece = 30,
    jumpChance = 0.20,
    complexity = 5,    // 1-10: how exotic to get
    sceneryDensity = 5, // 1-10: how much decoration
    jumpScale = 5,      // 1-10: how big jumps are
    useExoticBlocks = true,
    format = "polytrack1",
  } = params;

  const rng = createRNG(seed);
  const env = Environment[environment] ?? Environment.Summer;

  const complexityClamped = Math.max(1, Math.min(10, Number(complexity) || 5));
  const complexity01 = (complexityClamped - 1) / 9;
  const elevationProb = Math.max(0, Math.min(0.8, elevation * 0.08));
  const turnProb = Math.max(0, Math.min(0.8, curviness * 0.09));
  const jumpProb = Math.max(0, Math.min(1, jumpChance));
  const maxHeightY = Math.max(0, Math.floor(maxHeight));
  const attemptsPerPiece = Math.max(1, Math.floor(maxAttemptsPerPiece));
  const templateProb = 0.20 + complexity01 * 0.45;
  const exoticProb = useExoticBlocks ? (0.05 + complexity01 * 0.75) : 0;
  const sceneryProb = Math.min(1, sceneryDensity * 0.015);

  let x = 0, y = 0, z = 0;
  let heading = 0;

  const placedByCell = new Map();
  const placedSequence = [];
  const anchorKey = (px, py, pz) => `${px},${py},${pz}`;
  const xzKey = (px, pz) => `${px},${pz}`;

  const occupiedXZ = new Map();
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
  const reserveAt = (px, pz, yMin, yMax) => {
    const key = xzKey(px, pz);
    let set = occupiedXZ.get(key);
    if (!set) {
      set = new Set();
      occupiedXZ.set(key, set);
    }
    for (let yy = yMin; yy <= yMax; yy++) set.add(yy);
  };
  const isFree = (px, py, pz) => canReserveAt(px, pz, py, py);

  const nextPos = (cx, cy, cz, h, tiles = 1) => ({
    x: cx + HEADING_DELTA[h].dx * tiles,
    y: cy,
    z: cz + HEADING_DELTA[h].dz * tiles,
  });

  const flatFootprint = [{ dx: 0, dz: 0, yMin: 0, yMax: 0 }];

  const forwardFootprint = (h, tiles, yMin, yMax) => {
    const fp = [];
    for (let i = 0; i < tiles; i++) {
      fp.push({ dx: HEADING_DELTA[h].dx * i, dz: HEADING_DELTA[h].dz * i, yMin, yMax });
    }
    return fp;
  };

  const turnSquareFootprint = (fwdH, sideH, tiles) => {
    const fp = [];
    for (let f = 0; f < tiles; f++) {
      for (let s = 0; s < tiles; s++) {
        fp.push({
          dx: HEADING_DELTA[fwdH].dx * f + HEADING_DELTA[sideH].dx * s,
          dz: HEADING_DELTA[fwdH].dz * f + HEADING_DELTA[sideH].dz * s,
          yMin: 0, yMax: 0,
        });
      }
    }
    return fp;
  };

  const canFootprint = (ax, ay, az, footprint) => {
    for (const c of footprint) {
      if (!canReserveAt(ax + c.dx, az + c.dz, ay + c.yMin, ay + c.yMax)) return false;
    }
    return true;
  };

  const reserveFootprint = (ax, ay, az, footprint) => {
    for (const c of footprint) {
      if (!canReserveAt(ax + c.dx, az + c.dz, ay + c.yMin, ay + c.yMax)) return false;
    }
    for (const c of footprint) {
      reserveAt(ax + c.dx, az + c.dz, ay + c.yMin, ay + c.yMax);
    }
    return true;
  };

  const trackData = new TrackData(env, 28);

  const addToTrackData = (px, py, pz, blockType, rotation, color, cpOrder, startOrder) => {
    trackData.addPart(px, py, pz, blockType, rotation, RotationAxis.YPositive, color, cpOrder, startOrder);
  };

  const placePieceAt = (px, py, pz, blockType, rotation, cpOrder, startOrder, footprint, color = 0) => {
    const part = { x: px, y: py, z: pz, blockType, rotation, color };
    placedByCell.set(anchorKey(px, py, pz), part);
    placedSequence.push(part);
    if (!reserveFootprint(px, py, pz, footprint || flatFootprint)) return false;
    addToTrackData(px, py, pz, blockType, rotation, color, cpOrder, startOrder);
    return true;
  };

  const placePiece = (blockType, rotation, cpOrder, startOrder, footprint, color = 0) =>
    placePieceAt(x, y, z, blockType, rotation, cpOrder, startOrder, footprint, color);

  const countFreeNeighbors = (px, py, pz) => {
    let free = 0;
    for (let h = 0; h < 4; h++) {
      const n = nextPos(px, py, pz, h);
      if (isFree(n.x, n.y, n.z)) free++;
    }
    return free;
  };

  // ---- Piece placement functions ----

  let slopeChainDir = null;
  let slopeChainIndex = -1;
  const resetSlopeChain = () => { slopeChainDir = null; slopeChainIndex = -1; };
  const nextSlopeAlt = (dir) => slopeChainDir === dir && (((slopeChainIndex + 1) % 2) === 1);
  const commitSlope = (dir) => {
    if (slopeChainDir === dir) slopeChainIndex++;
    else { slopeChainDir = dir; slopeChainIndex = 0; }
  };

  const placeStraightLike = (blockType, cpOrder, color = 0) => {
    const exit = nextPos(x, y, z, heading, 1);
    if (!canFootprint(x, y, z, flatFootprint)) return false;
    if (!isFree(exit.x, exit.y, exit.z)) return false;
    placePiece(blockType, heading, cpOrder ?? null, null, flatFootprint, color);
    x = exit.x; y = exit.y; z = exit.z;
    resetSlopeChain();
    return true;
  };

  const pickStraightRoadType = () => {
    if (!useExoticBlocks) return WipBlock.Straight;
    const swapChance = exoticProb * 0.55;
    if (rng() >= swapChance) return WipBlock.Straight;
    const r = rng();
    if (r < 0.40) return WipBlock.Booster;
    if (r < 0.70) return WipBlock.WideRoad;
    return WipBlock.NarrowRoad;
  };

  const placeSlopeUp = (longVariant) => {
    const tiles = longVariant ? 2 : 1;
    const dy = longVariant ? 2 : 1;
    const nextY = y + dy;
    if (nextY > maxHeightY) return false;
    const fp = forwardFootprint(heading, tiles, 0, dy);
    const exit = nextPos(x, y, z, heading, tiles);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!isFree(exit.x, nextY, exit.z)) return false;
    const alt = nextSlopeAlt("up");
    const blockType = longVariant
      ? (alt ? WipBlock.SlopeDownLong : WipBlock.SlopeUpLong)
      : (alt ? WipBlock.SlopeDown : WipBlock.SlopeUp);
    const storedRot = alt ? ((heading + 2) % 4) : heading;
    placePiece(blockType, storedRot, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    commitSlope("up");
    return true;
  };

  const placeSlopeDown = (longVariant) => {
    const tiles = longVariant ? 2 : 1;
    const dy = longVariant ? 2 : 1;
    if (y < dy) return false;
    const nextY = y - dy;
    const alt = nextSlopeAlt("down");
    const anchorX = x + (longVariant ? HEADING_DELTA[heading].dx : 0);
    const anchorY = nextY;
    const anchorZ = z + (longVariant ? HEADING_DELTA[heading].dz : 0);
    const storedRot = alt ? ((heading + 2) % 4) : heading;
    const fp = forwardFootprint(heading, tiles, 0, dy);
    const exit = nextPos(x, nextY, z, heading, tiles);
    if (!canFootprint(anchorX, anchorY, anchorZ, fp)) return false;
    if (!isFree(exit.x, nextY, exit.z)) return false;
    const blockType = longVariant
      ? (alt ? WipBlock.SlopeUpLong : WipBlock.SlopeDownLong)
      : (alt ? WipBlock.SlopeUp : WipBlock.SlopeDown);
    placePieceAt(anchorX, anchorY, anchorZ, blockType, storedRot, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    commitSlope("down");
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
    const isShort = variant === "short";
    const isLong = variant === "long";
    const footprintTiles = isLong ? 5 : isShort ? 2 : 1;
    const entranceX = x, entranceZ = z;
    let anchorX = entranceX, anchorZ = entranceZ;
    let fpFwdH = heading, fpSideH = newHeading;

    if ((isLong && !turnRight) || (isShort && !turnRight) || (isShort && turnRight)) {
      const shift = footprintTiles - 1;
      anchorX = entranceX + HEADING_DELTA[heading].dx * shift + HEADING_DELTA[newHeading].dx * shift;
      anchorZ = entranceZ + HEADING_DELTA[heading].dz * shift + HEADING_DELTA[newHeading].dz * shift;
      fpFwdH = (heading + 2) % 4;
      fpSideH = (newHeading + 2) % 4;
    }

    const fp = (isLong || isShort) ? turnSquareFootprint(fpFwdH, fpSideH, footprintTiles) : flatFootprint;
    const exitFwd = isLong ? 5 : isShort ? 2 : 1;
    const exitLat = isLong ? 4 : isShort ? 1 : 0;
    const exit = {
      x: entranceX + HEADING_DELTA[newHeading].dx * exitFwd + HEADING_DELTA[heading].dx * exitLat,
      y,
      z: entranceZ + HEADING_DELTA[newHeading].dz * exitFwd + HEADING_DELTA[heading].dz * exitLat,
    };
    if (!canFootprint(anchorX, y, anchorZ, fp)) return false;
    if (!isFree(exit.x, exit.y, exit.z)) return false;
    if (countFreeNeighbors(exit.x, exit.y, exit.z) < 1) return false;
    const blockType = variant === "short" ? WipBlock.TurnShort
                    : variant === "long"  ? WipBlock.TurnLong3
                    : WipBlock.TurnSharp;
    placePieceAt(anchorX, y, anchorZ, blockType, turnRotation, null, null, fp);
    heading = newHeading;
    x = exit.x; y = exit.y; z = exit.z;
    resetSlopeChain();
    return true;
  };

  // ---- Jump placement (same calibrated system as main gen) ----
  const headingSign = (h) => ({
    dx: HEADING_DELTA[h].dx / TILE,
    dz: HEADING_DELTA[h].dz / TILE,
  });

  const estimatePreSpeed = () => {
    let effectiveTiles = 0;
    for (let j = placedSequence.length - 1; j >= 0; j--) {
      const bt = placedSequence[j].blockType;
      if (bt === WipBlock.Straight || bt === WipBlock.Checkpoint) effectiveTiles++;
      else if (bt === WipBlock.SlopeDown || bt === WipBlock.SlopeDownLong) { effectiveTiles += 2; }
      else if (bt === WipBlock.SlopeUp || bt === WipBlock.SlopeUpLong) { effectiveTiles = Math.max(0, effectiveTiles - 2); break; }
      else if (bt === WipBlock.TurnSharp || bt === WipBlock.TurnShort || bt === WipBlock.TurnLong3) { effectiveTiles = Math.max(effectiveTiles, 3); break; }
      else if (bt === WipBlock.Start) { effectiveTiles++; break; }
      else break;
    }
    return effectiveTiles;
  };

  const placeJump = (scale = 1) => {
    const baseRunup = 3 + Math.floor(rng() * 4);
    const runup = Math.min(baseRunup + Math.floor(scale * 2), 12);
    const preSpeed = estimatePreSpeed();
    const totalFlat = preSpeed + runup;
    if (totalFlat < 4) return 0;
    const gapWU = Math.max(16, Math.round(13.81 * Math.sqrt(totalFlat) - 2.51));
    const gapCells = Math.ceil(gapWU / TILE);
    const baseY = y;
    const flightY = baseY + 2;
    if (flightY > maxHeightY) return 0;
    const hs = headingSign(heading);
    let cx = x, cz = z;

    // Pre-check runup
    for (let i = 0; i < runup; i++) {
      if (!canReserveAt(cx, cz, baseY, baseY)) return 0;
      cx += HEADING_DELTA[heading].dx; cz += HEADING_DELTA[heading].dz;
    }
    // Pre-check takeoff
    for (let t = 0; t < 2; t++) {
      if (!canReserveAt(cx + HEADING_DELTA[heading].dx * t, cz + HEADING_DELTA[heading].dz * t, baseY, flightY)) return 0;
    }
    const rampExitX = cx + HEADING_DELTA[heading].dx * 2;
    const rampExitZ = cz + HEADING_DELTA[heading].dz * 2;
    cx = rampExitX; cz = rampExitZ;
    // Pre-check gap
    for (let i = 0; i < gapCells; i++) {
      if (!canReserveAt(cx, cz, baseY + 1, flightY)) return 0;
      cx += HEADING_DELTA[heading].dx; cz += HEADING_DELTA[heading].dz;
    }
    // Landing
    const landX = rampExitX + hs.dx * gapWU;
    const landZ = rampExitZ + hs.dz * gapWU;
    if (!canReserveAt(landX, landZ, baseY + 1, flightY)) return 0;
    const altX = landX + HEADING_DELTA[heading].dx;
    const altZ = landZ + HEADING_DELTA[heading].dz;
    if (!canReserveAt(altX, altZ, baseY, baseY + 1)) return 0;
    const exitX = altX + HEADING_DELTA[heading].dx;
    const exitZ = altZ + HEADING_DELTA[heading].dz;
    if (!isFree(exitX, baseY, exitZ)) return 0;

    // Place the jump
    for (let i = 0; i < runup; i++) {
      placePiece(WipBlock.Straight, heading, null, null, flatFootprint);
      x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;
    }
    const rampFp = forwardFootprint(heading, 2, 0, 2);
    placePiece(WipBlock.SlopeUpLong, heading, null, null, rampFp);
    x += HEADING_DELTA[heading].dx * 2; z += HEADING_DELTA[heading].dz * 2; y = flightY;
    for (let i = 0; i < gapCells; i++) {
      reserveAt(x + HEADING_DELTA[heading].dx * i, z + HEADING_DELTA[heading].dz * i, baseY + 1, flightY);
    }
    const downFp = [{ dx: 0, dz: 0, yMin: 0, yMax: 1 }];
    placePieceAt(landX, flightY - 1, landZ, WipBlock.SlopeDown, heading, null, null, downFp);
    const altFp = [{ dx: 0, dz: 0, yMin: 0, yMax: 1 }];
    placePieceAt(altX, baseY, altZ, WipBlock.SlopeUp, (heading + 2) % 4, null, null, altFp);
    x = exitX; z = exitZ; y = baseY;
    resetSlopeChain();
    return runup + 3;
  };

  // ---- Exotic piece placement ----

  // Place a sequence of exotic blocks along current heading (decorative alongside track)
  const placeExoticDecoration = (blockType, count, color, offsetSide) => {
    const sideH = offsetSide > 0 ? (heading + 3) % 4 : (heading + 1) % 4;
    const sideDist = Math.abs(offsetSide);
    let placed = 0;
    for (let i = 0; i < count; i++) {
      const dx = HEADING_DELTA[heading].dx * i + HEADING_DELTA[sideH].dx * sideDist;
      const dz = HEADING_DELTA[heading].dz * i + HEADING_DELTA[sideH].dz * sideDist;
      const sx = x + dx, sz = z + dz;
      if (canReserveAt(sx, sz, y, y)) {
        addToTrackData(sx, y, sz, blockType, heading, color, null, null);
        reserveAt(sx, sz, y, y);
        placed++;
      }
    }
    return placed;
  };

  // Place tunnel section: entry + mids + exit along heading
  const placeTunnelSection = () => {
    const len = 3 + Math.floor(rng() * 4); // 3-6 pieces long
    const positions = [];
    let cx = x, cz = z;
    // Pre-check all positions
    for (let i = 0; i < len; i++) {
      if (!canReserveAt(cx, cz, y, y)) return 0;
      positions.push({ x: cx, z: cz });
      cx += HEADING_DELTA[heading].dx;
      cz += HEADING_DELTA[heading].dz;
    }
    if (!isFree(cx, y, cz)) return 0;

    // Place tunnel pieces as decoration alongside straights
    for (let i = 0; i < len; i++) {
      const px = positions[i].x, pz = positions[i].z;
      // Place the straight road piece
      placePiece(WipBlock.Straight, heading, null, null, flatFootprint);
      x += HEADING_DELTA[heading].dx;
      z += HEADING_DELTA[heading].dz;

      // Place arch decorations on both sides
      const leftH = (heading + 1) % 4;
      const rightH = (heading + 3) % 4;
      for (const sH of [leftH, rightH]) {
        const sx = px + HEADING_DELTA[sH].dx;
        const sz = pz + HEADING_DELTA[sH].dz;
        if (canReserveAt(sx, sz, y, y + 2)) {
          // Wall column
          addToTrackData(sx, y, sz, WipBlock.Block, heading, COLOR.WHITE, null, null);
          addToTrackData(sx, y + 1, sz, WipBlock.Block, heading, COLOR.WHITE, null, null);
          reserveAt(sx, sz, y, y + 1);
        }
      }
      // Arch on top
      if (canReserveAt(px, pz, y + 2, y + 2)) {
        addToTrackData(px, y + 2, pz, WipBlock.Arch, heading, COLOR.DARK, null, null);
        reserveAt(px, pz, y + 2, y + 2);
      }
    }
    resetSlopeChain();
    return len;
  };

  // Place wall ride section: several WallRideLeft/Right pieces
  const placeWallRideSection = () => {
    if (!useExoticBlocks) return 0;
    const len = 2 + Math.floor(rng() * 3);
    let cx = x, cz = z;
    for (let i = 0; i < len; i++) {
      if (!canReserveAt(cx, cz, y, y)) return 0;
      cx += HEADING_DELTA[heading].dx;
      cz += HEADING_DELTA[heading].dz;
    }
    if (!isFree(cx, y, cz)) return 0;

    const isRight = rng() < 0.5;
    const wallType = isRight ? WipBlock.WallRideRight : WipBlock.WallRideLeft;
    for (let i = 0; i < len; i++) {
      placePiece(wallType, heading, null, null, flatFootprint, COLOR.DARK);
      x += HEADING_DELTA[heading].dx;
      z += HEADING_DELTA[heading].dz;
    }
    resetSlopeChain();
    return len;
  };

  // Place loop section: LoopStart + LoopMid*N + LoopEnd
  const placeLoopSection = () => {
    if (!useExoticBlocks) return 0;
    const mids = 2 + Math.floor(rng() * 3);
    const total = mids + 2;
    let cx = x, cz = z;
    for (let i = 0; i < total; i++) {
      if (!canReserveAt(cx, cz, y, y + 4)) return 0;
      cx += HEADING_DELTA[heading].dx;
      cz += HEADING_DELTA[heading].dz;
    }
    if (!isFree(cx, y, cz)) return 0;

    const color = rng() < 0.5 ? COLOR.GREEN : COLOR.BLUE;
    // LoopStart
    const loopFp = [{ dx: 0, dz: 0, yMin: 0, yMax: 4 }];
    placePiece(WipBlock.LoopStart, heading, null, null, loopFp, color);
    x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;
    // LoopMid pieces
    for (let i = 0; i < mids; i++) {
      placePiece(WipBlock.LoopMid, heading, null, null, loopFp, color);
      x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;
    }
    // LoopEnd
    placePiece(WipBlock.LoopEnd, heading, null, null, loopFp, color);
    x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;

    resetSlopeChain();
    return total;
  };

  // Place helix climb: spirals up gaining height
  const placeHelixSection = () => {
    if (!useExoticBlocks) return 0;
    const count = 3 + Math.floor(rng() * 4);
    let cx = x, cz = z, cy = y;
    for (let i = 0; i < count; i++) {
      if (!canReserveAt(cx, cz, cy, cy + 2)) return 0;
      if (cy + 2 > maxHeightY) return 0;
      cx += HEADING_DELTA[heading].dx;
      cz += HEADING_DELTA[heading].dz;
      cy += 1;
    }
    if (!isFree(cx, cy, cz)) return 0;

    const color = rng() < 0.5 ? COLOR.RED : COLOR.PURPLE;
    for (let i = 0; i < count; i++) {
      const fp = [{ dx: 0, dz: 0, yMin: 0, yMax: 2 }];
      placePiece(WipBlock.Helix, heading, null, null, fp, color);
      x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;
      y += 1;
    }
    resetSlopeChain();
    return count;
  };

  // Place stunt ramp section
  const placeStuntSection = () => {
    if (!useExoticBlocks) return 0;
    const len = 2 + Math.floor(rng() * 2);
    let cx = x, cz = z;
    for (let i = 0; i < len; i++) {
      if (!canReserveAt(cx, cz, y, y + 1)) return 0;
      cx += HEADING_DELTA[heading].dx;
      cz += HEADING_DELTA[heading].dz;
    }
    if (!isFree(cx, y, cz)) return 0;

    const useWide = rng() < 0.5;
    const blockType = useWide ? WipBlock.StuntRampWide : WipBlock.StuntRamp;
    const color = COLOR.ORANGE;
    for (let i = 0; i < len; i++) {
      const fp = [{ dx: 0, dz: 0, yMin: 0, yMax: 1 }];
      placePiece(blockType, heading, null, null, fp, color);
      x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;
    }
    resetSlopeChain();
    return len;
  };

  // Place archway corridor (blocks + arches forming a tunnel-like structure)
  const placeArchwaySection = () => {
    const len = 3 + Math.floor(rng() * 5);
    let cx = x, cz = z;
    for (let i = 0; i < len; i++) {
      if (!canReserveAt(cx, cz, y, y)) return 0;
      cx += HEADING_DELTA[heading].dx; cz += HEADING_DELTA[heading].dz;
    }
    if (!isFree(cx, y, cz)) return 0;

    const wallColor = rng() < 0.5 ? COLOR.WHITE : COLOR.BROWN;
    const archColor = COLOR.DARK;
    for (let i = 0; i < len; i++) {
      const px = x, pz = z;
      // Road piece
      placePiece(WipBlock.Straight, heading, null, null, flatFootprint);
      x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;

      // Decorative arches every other piece
      if (i % 2 === 0) {
        const leftH = (heading + 1) % 4;
        const rightH = (heading + 3) % 4;
        for (const sH of [leftH, rightH]) {
          const sx = px + HEADING_DELTA[sH].dx;
          const sz = pz + HEADING_DELTA[sH].dz;
          for (let h = 0; h < 3; h++) {
            if (canReserveAt(sx, sz, y + h, y + h)) {
              addToTrackData(sx, y + h, sz, WipBlock.Block, 0, wallColor, null, null);
              reserveAt(sx, sz, y + h, y + h);
            }
          }
        }
        // Arch on top
        if (canReserveAt(px, pz, y + 3, y + 3)) {
          addToTrackData(px, y + 3, pz, WipBlock.Arch, heading, archColor, null, null);
          reserveAt(px, pz, y + 3, y + 3);
        }
      }
    }
    resetSlopeChain();
    return len;
  };

  // Place pipe section
  const placePipeSection = () => {
    if (!useExoticBlocks) return 0;
    const len = 3 + Math.floor(rng() * 4);
    let cx = x, cz = z;
    for (let i = 0; i < len; i++) {
      if (!canReserveAt(cx, cz, y, y + 2)) return 0;
      cx += HEADING_DELTA[heading].dx; cz += HEADING_DELTA[heading].dz;
    }
    if (!isFree(cx, y, cz)) return 0;

    const color = COLOR.WHITE;
    for (let i = 0; i < len; i++) {
      const fp = [{ dx: 0, dz: 0, yMin: 0, yMax: 2 }];
      placePiece(WipBlock.Pipe, heading, null, null, fp, color);
      x += HEADING_DELTA[heading].dx; z += HEADING_DELTA[heading].dz;
    }
    resetSlopeChain();
    return len;
  };

  const tryPlaceExoticSection = (piecesLeft) => {
    if (!useExoticBlocks || piecesLeft < 4) return 0;
    const options = [];
    if (piecesLeft >= 4) {
      options.push(placeStuntSection, placeWallRideSection);
    }
    if (piecesLeft >= 6) {
      options.push(placeTunnelSection, placePipeSection, placeArchwaySection);
    }
    if (piecesLeft >= 7) {
      options.push(placeLoopSection);
    }
    if (piecesLeft >= 8 && y + 3 <= maxHeightY) {
      options.push(placeHelixSection);
    }
    if (piecesLeft >= 10) {
      options.push(() => placeJump(jumpScale / 3));
    }
    if (!options.length) return 0;

    const attempts = 1 + Math.floor(complexity01 * 2);
    for (let i = 0; i < attempts; i++) {
      const fn = options[Math.floor(rng() * options.length)];
      const placed = fn();
      if (placed > 0) return placed;
    }
    return 0;
  };

  // ---- Scenery placement ----

  const placeSceneryTree = (bx, by, bz) => {
    const trunkH = 1 + Math.floor(rng() * 3);
    for (let ty = 0; ty < trunkH; ty++) {
      if (!canReserveAt(bx, bz, by + ty, by + ty)) return;
      addToTrackData(bx, by + ty, bz, WipBlock.Block, 0, COLOR.BROWN, null, null);
      reserveAt(bx, bz, by + ty, by + ty);
    }
    const canopyY = by + trunkH;
    // Central canopy
    if (canReserveAt(bx, bz, canopyY, canopyY)) {
      addToTrackData(bx, canopyY, bz, WipBlock.Block, 0, COLOR.GREEN, null, null);
      reserveAt(bx, bz, canopyY, canopyY);
    }
    // Side leaves
    for (const d of [{ dx: TILE, dz: 0 }, { dx: -TILE, dz: 0 }, { dx: 0, dz: TILE }, { dx: 0, dz: -TILE }]) {
      if (rng() < 0.6 && canReserveAt(bx + d.dx, bz + d.dz, canopyY, canopyY)) {
        const leafType = rng() < 0.5 ? WipBlock.HalfBlock : WipBlock.QuarterBlock;
        addToTrackData(bx + d.dx, canopyY, bz + d.dz, leafType, Math.floor(rng() * 4), COLOR.GREEN, null, null);
        reserveAt(bx + d.dx, bz + d.dz, canopyY, canopyY);
      }
    }
  };

  const placeSceneryBuilding = (bx, by, bz) => {
    const height = 3 + Math.floor(rng() * 5);
    const wallColor = [COLOR.WHITE, COLOR.DARK, COLOR.RED, COLOR.BLUE][Math.floor(rng() * 4)];
    for (let ty = 0; ty < height; ty++) {
      if (!canReserveAt(bx, bz, by + ty, by + ty)) return;
      addToTrackData(bx, by + ty, bz, WipBlock.Block, 0, wallColor, null, null);
      reserveAt(bx, bz, by + ty, by + ty);
    }
    // Roof
    if (canReserveAt(bx, bz, by + height, by + height)) {
      addToTrackData(bx, by + height, bz, WipBlock.HalfBlock, 0, COLOR.DARK, null, null);
      reserveAt(bx, bz, by + height, by + height);
    }
    // Windows (quarter blocks on sides)
    if (height >= 3) {
      for (const d of [{ dx: TILE, dz: 0 }, { dx: -TILE, dz: 0 }]) {
        const wy = by + 1 + Math.floor(rng() * (height - 2));
        if (canReserveAt(bx + d.dx, bz + d.dz, wy, wy)) {
          addToTrackData(bx + d.dx, wy, bz + d.dz, WipBlock.QuarterBlock, 0, COLOR.YELLOW, null, null);
          reserveAt(bx + d.dx, bz + d.dz, wy, wy);
        }
      }
    }
  };

  const placeSceneryTower = (bx, by, bz) => {
    const height = 5 + Math.floor(rng() * 8);
    const color = [COLOR.RED, COLOR.BLUE, COLOR.PURPLE][Math.floor(rng() * 3)];
    for (let ty = 0; ty < height; ty++) {
      if (!canReserveAt(bx, bz, by + ty, by + ty)) return;
      addToTrackData(bx, by + ty, bz, WipBlock.Cylinder, 0, color, null, null);
      reserveAt(bx, bz, by + ty, by + ty);
    }
    // Cone top
    if (canReserveAt(bx, bz, by + height, by + height)) {
      addToTrackData(bx, by + height, bz, WipBlock.Cone, 0, COLOR.ORANGE, null, null);
      reserveAt(bx, bz, by + height, by + height);
    }
  };

  const placeSceneryArch = (bx, by, bz) => {
    const color = COLOR.WHITE;
    // Two pillars
    for (const dx of [-TILE, TILE]) {
      for (let ty = 0; ty < 3; ty++) {
        if (canReserveAt(bx + dx, bz, by + ty, by + ty)) {
          addToTrackData(bx + dx, by + ty, bz, WipBlock.Block, 0, color, null, null);
          reserveAt(bx + dx, bz, by + ty, by + ty);
        }
      }
    }
    // Arch span
    if (canReserveAt(bx, bz, by + 3, by + 3)) {
      addToTrackData(bx, by + 3, bz, WipBlock.Arch, 0, COLOR.DARK, null, null);
      reserveAt(bx, bz, by + 3, by + 3);
    }
  };

  // ---- Turn helpers ----
  const pickTurnVariant = () => {
    const r = rng();
    if (r < (0.50 - complexity01 * 0.25)) return "short";
    if (r < (0.85 - complexity01 * 0.15)) return "sharp";
    return "long";
  };

  let turnBias = rng() < 0.5 ? 1 : -1;
  let turnBiasCounter = 0;
  const BIAS_SWITCH = 3 + Math.floor(rng() * 5);
  const pickTurnDir = () => {
    turnBiasCounter++;
    if (turnBiasCounter >= BIAS_SWITCH) { turnBias = -turnBias; turnBiasCounter = 0; }
    return rng() < 0.7 ? (turnBias > 0) : (turnBias < 0);
  };

  // ---- Place Start ----
  placePiece(WipBlock.Start, heading, null, 0, flatFootprint);
  ({ x, y, z } = nextPos(x, y, z, heading, 1));

  let checkpointsPlaced = 0;
  const cpInterval = numCheckpoints > 0 ? Math.floor(trackLength / (numCheckpoints + 1)) : Infinity;

  const actionQueue = [];
  let piecesPlaced = 0;
  let consecutiveStraight = 0;
  let justPlacedPiece = false;

  // ---- Build the track ----
  for (let i = 0; i < trackLength; i++) {
    if (!justPlacedPiece && !isFree(x, y, z)) {
      let escaped = false;
      for (const dir of [1, 3]) {
        const tryH = (heading + dir) % 4;
        const tryExit = nextPos(x, y, z, tryH, 1);
        if (isFree(tryExit.x, tryExit.y, tryExit.z)) {
          heading = tryH; ({ x, y, z } = tryExit); escaped = true; break;
        }
      }
      if (!escaped) {
        for (const dy of [1, -1]) {
          const tryY = y + dy;
          if (tryY >= 0 && tryY <= maxHeightY && isFree(x, tryY, z)) { y = tryY; escaped = true; break; }
        }
      }
      if (!escaped) {
        const revH = (heading + 2) % 4;
        const tryExit = nextPos(x, y, z, revH, 1);
        if (isFree(tryExit.x, tryExit.y, tryExit.z)) { heading = revH; ({ x, y, z } = tryExit); escaped = true; }
      }
      if (!escaped) break;
    }

    const piecesLeft = trackLength - i;
    const cpRemaining = numCheckpoints - checkpointsPlaced;
    const shouldCp = (checkpointsPlaced < numCheckpoints && (i + 1) % cpInterval === 0) ||
                     (cpRemaining > 0 && piecesLeft <= cpRemaining + 2);
    const nearEnd = piecesLeft <= y + 3;
    const shouldDescend = nearEnd && y > 0;

    let placed = false;

    for (let attempt = 0; attempt < attemptsPerPiece && !placed; attempt++) {
      // Checkpoint
      if (shouldCp && attempt === 0) {
        actionQueue.length = 0;
        placed = placeStraightLike(WipBlock.Checkpoint, checkpointsPlaced);
        if (placed) { checkpointsPlaced++; piecesPlaced++; consecutiveStraight = 0; justPlacedPiece = true; }
        continue;
      }

      // Forced descent
      if (shouldDescend && attempt < 3) {
        if (y >= 2) placed = placeSlopeDown(true);
        if (!placed) placed = placeSlopeDown(false);
        if (placed) { piecesPlaced++; consecutiveStraight = 0; justPlacedPiece = true; continue; }
      }

      // Template system
      if (attempt === 0 && !shouldCp && !shouldDescend) {
        if (actionQueue.length === 0 && rng() < templateProb) {
          const allowExoticTemplates = useExoticBlocks && EXOTIC_WIP_TEMPLATES.length > 0;
          const preferExotic = allowExoticTemplates && rng() < exoticProb;
          const pool = preferExotic
            ? EXOTIC_WIP_TEMPLATES
            : (BASIC_WIP_TEMPLATES.length ? BASIC_WIP_TEMPLATES : WIP_TEMPLATES);
          actionQueue.push(...pool[Math.floor(rng() * pool.length)]);
        }

        if (actionQueue.length > 0) {
          const a = actionQueue[0];
          let ok = false;
          if (a === "straight") ok = placeStraightLike(pickStraightRoadType(), null);
          else if (a === "turnR") ok = placeTurn90(true, pickTurnVariant());
          else if (a === "turnL") ok = placeTurn90(false, pickTurnVariant());
          else if (a === "up") ok = placeSlopeUp(rng() < 0.3);
          else if (a === "upLong") ok = placeSlopeUp(true);
          else if (a === "down") ok = placeSlopeDown(rng() < 0.3);
          else if (a === "downLong") ok = placeSlopeDown(true);
          else if (a === "jump") {
            const jp = placeJump(jumpScale / 5);
            if (jp > 0) { actionQueue.shift(); placed = true; piecesPlaced += jp; i += jp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "bigJump") {
            const jp = placeJump(jumpScale / 3);
            if (jp > 0) { actionQueue.shift(); placed = true; piecesPlaced += jp; i += jp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "tunnel") {
            const tp = placeTunnelSection();
            if (tp > 0) { actionQueue.shift(); placed = true; piecesPlaced += tp; i += tp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "wallride") {
            const wp = placeWallRideSection();
            if (wp > 0) { actionQueue.shift(); placed = true; piecesPlaced += wp; i += wp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "loop") {
            const lp = placeLoopSection();
            if (lp > 0) { actionQueue.shift(); placed = true; piecesPlaced += lp; i += lp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "helix_up") {
            const hp = placeHelixSection();
            if (hp > 0) { actionQueue.shift(); placed = true; piecesPlaced += hp; i += hp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "stunt") {
            const sp = placeStuntSection();
            if (sp > 0) { actionQueue.shift(); placed = true; piecesPlaced += sp; i += sp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "archway") {
            const ap = placeArchwaySection();
            if (ap > 0) { actionQueue.shift(); placed = true; piecesPlaced += ap; i += ap - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          else if (a === "pipeSection") {
            const pp = placePipeSection();
            if (pp > 0) { actionQueue.shift(); placed = true; piecesPlaced += pp; i += pp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
          }
          if (ok) { actionQueue.shift(); placed = true; piecesPlaced++; consecutiveStraight = (a === "straight") ? consecutiveStraight + 1 : 0; continue; }
          actionQueue.length = 0;
        }
      }

      // Opportunistic exotic section insertion
      if (!placed && !shouldCp && !shouldDescend && slopeChainDir === null) {
        const sectionChance = 0.02 + exoticProb * 0.28;
        if (rng() < sectionChance) {
          const ep = tryPlaceExoticSection(piecesLeft);
          if (ep > 0) { placed = true; piecesPlaced += ep; i += ep - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
        }
      }

      // Elevation
      if (!placed && elevationProb > 0 && rng() < elevationProb) {
        const r = rng();
        const descentBias = Math.min(0.6, y * 0.1);
        if (r < descentBias) {
          placed = placeSlopeDown(rng() < 0.3);
          if (!placed && y >= 2) placed = placeSlopeDown(true);
        } else {
          placed = placeSlopeUp(rng() < 0.3);
        }
        if (placed) { piecesPlaced++; consecutiveStraight = 0; continue; }
      }

      // Jumps
      if (!placed && jumpProb > 0 && !shouldDescend && slopeChainDir === null) {
        if (piecesLeft > 18 && y + 2 <= maxHeightY && piecesPlaced > 3 && rng() < jumpProb) {
          const jp = placeJump(jumpScale / 5);
          if (jp > 0) { placed = true; piecesPlaced += jp; i += jp - 1; consecutiveStraight = 0; justPlacedPiece = true; continue; }
        }
      }

      // Turns
      const forceTurn = consecutiveStraight >= 5 + Math.floor(rng() * 4);
      if (!placed && (forceTurn || (turnProb > 0 && rng() < turnProb))) {
        const variant = pickTurnVariant();
        const turnRight = pickTurnDir();
        placed = placeTurn90(turnRight, variant);
        if (!placed) placed = placeTurn90(!turnRight, variant);
        if (placed) { piecesPlaced++; consecutiveStraight = 0; justPlacedPiece = true; continue; }
      }

      // Default straight
      placed = placeStraightLike(pickStraightRoadType(), null);
      if (placed) { piecesPlaced++; consecutiveStraight++; justPlacedPiece = true; }
    }

    if (!placed) break;
    justPlacedPiece = false;
  }

  // ---- Descend to ground ----
  let descentAttempts = 0;
  while (y > 0 && descentAttempts < 30) {
    descentAttempts++;
    if (y >= 2 && placeSlopeDown(true)) continue;
    if (y >= 1 && placeSlopeDown(false)) continue;
    const preferRight = rng() < 0.5;
    for (const tr of preferRight ? [true, false] : [false, true]) {
      if (placeTurn90(tr, "sharp")) break;
    }
    if (y > 0 && !placeSlopeDown(false)) break;
  }

  // ---- Remaining checkpoints ----
  while (checkpointsPlaced < numCheckpoints) {
    if (!placeStraightLike(WipBlock.Checkpoint, checkpointsPlaced)) break;
    checkpointsPlaced++;
  }

  // ---- Finish ----
  if (isFree(x, y, z)) {
    placePiece(WipBlock.Finish, heading, null, null, flatFootprint);
  }

  // ---- Scenery (post-generation) ----
  if (includeScenery) {
    const roadPositions = [];
    for (const p of placedSequence) {
      if (p.blockType !== WipBlock.Block && p.blockType !== WipBlock.HalfBlock &&
          p.blockType !== WipBlock.QuarterBlock && p.blockType !== WipBlock.Cylinder &&
          p.blockType !== WipBlock.Cone && p.blockType !== WipBlock.Arch) {
        roadPositions.push(p);
      }
    }

    const sideOffsets = [
      { dx: TILE * 2, dz: 0 }, { dx: -TILE * 2, dz: 0 },
      { dx: 0, dz: TILE * 2 }, { dx: 0, dz: -TILE * 2 },
      { dx: TILE * 3, dz: 0 }, { dx: -TILE * 3, dz: 0 },
      { dx: 0, dz: TILE * 3 }, { dx: 0, dz: -TILE * 3 },
    ];

    for (const pos of roadPositions) {
      if (pos.y > 0) continue;
      for (const off of sideOffsets) {
        const sx = pos.x + off.dx;
        const sz = pos.z + off.dz;
        if (!canReserveAt(sx, sz, 0, 0)) continue;
        const r = rng();
        const threshold = sceneryProb;
        if (r < threshold * 0.3) placeSceneryTree(sx, 0, sz);
        else if (r < threshold * 0.5) placeSceneryBuilding(sx, 0, sz);
        else if (r < threshold * 0.6) placeSceneryTower(sx, 0, sz);
        else if (r < threshold * 0.65) placeSceneryArch(sx, 0, sz);
      }
    }
  }

  // ---- Encode ----
  const shareCode = format === "v3"
    ? encodeV3ShareCode(name, trackData)
    : encodePolyTrack1ShareCode(name, trackData, "");

  return { shareCode, trackData, name, seed, placedSequence };
}
