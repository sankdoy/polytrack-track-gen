/**
 * PolyTrack Track Decoder, Analyzer & Generator
 *
 * Complete reverse-engineered implementation of the PolyTrack track format.
 * Supports decoding v3 share codes into human-readable descriptions
 * and generating new random tracks with controllable parameters.
 */

const pako = require('pako');

// ============================================================
// ENUMS (extracted from game bundle)
// ============================================================

/** Block/piece type IDs */
const BlockType = {
  Straight: 0,
  TurnSharp: 1,
  SlopeUp: 2,
  SlopeDown: 3,
  Slope: 4,
  Start: 5,
  Finish: 6,
  ToWideMiddle: 7,
  ToWideLeft: 8,
  ToWideRight: 9,
  StraightWide: 10,
  InnerCornerWide: 11,
  OuterCornerWide: 12,
  SlopeUpLeftWide: 13,
  SlopeUpRightWide: 14,
  SlopeDownLeftWide: 15,
  SlopeDownRightWide: 16,
  SlopeLeftWide: 17,
  SlopeRightWide: 18,
  PillarTop: 19,
  PillarMiddle: 20,
  PillarBottom: 21,
  PillarShort: 22,
  PlanePillarBottom: 23,
  PlanePillarShort: 24,
  Plane: 25,
  PlaneWall: 26,
  PlaneWallCorner: 27,
  PlaneWallInnerCorner: 28,
  Block: 29,
  WallTrackTop: 30,
  WallTrackMiddle: 31,
  WallTrackBottom: 32,
  PlaneSlopeUp: 33,
  PlaneSlopeDown: 34,
  PlaneSlope: 35,
  TurnShort: 36,
  TurnLong: 37,
  SlopeUpLong: 38,
  SlopeDownLong: 39,
  SlopePillar: 40,
  TurnSLeft: 41,
  TurnSRight: 42,
  IntersectionT: 43,
  IntersectionCross: 44,
  PillarBranch1: 45,
  PillarBranch2: 46,
  PillarBranch3: 47,
  PillarBranch4: 48,
  WallTrackBottomCorner: 49,
  WallTrackMiddleCorner: 50,
  WallTrackTopCorner: 51,
  Checkpoint: 52,
  HalfBlock: 53,
  QuarterBlock: 54,
  HalfPlane: 55,
  QuarterPlane: 56,
  PlaneBridge: 57,
  SignArrowLeft: 58,
  SignArrowRight: 59,
  // 60 is missing in the enum
  SignArrowUp: 61,
  SignArrowDown: 62,
  SignWarning: 63,
  SignWrongWay: 64,
  CheckpointWide: 65,
  WallTrackCeiling: 66,
  WallTrackFloor: 67,
  BlockSlopedDown: 68,
  BlockSlopedDownInnerCorner: 69,
  BlockSlopedDownOuterCorner: 70,
  BlockSlopedUp: 71,
  BlockSlopedUpInnerCorner: 72,
  BlockSlopedUpOuterCorner: 73,
  FinishWide: 74,
  PlaneCheckpoint: 75,
  PlaneFinish: 76,
  PlaneCheckpointWide: 77,
  PlaneFinishWide: 78,
  WallTrackBottomInnerCorner: 79,
  WallTrackInnerCorner: 80,
  WallTrackTopInnerCorner: 81,
  TurnLong2: 82,
  TurnLong3: 83,
  SlopePillarShort: 84,
  BlockSlopeUp: 85,
  BlockSlopeDown: 86,
  BlockSlopeVerticalTop: 87,
  BlockSlopeVerticalBottom: 88,
  // 89 missing
  PlaneSlopeVerticalBottom: 90,
  StartWide: 91,
  PlaneStart: 92,
  PlaneStartWide: 93,
  TurnShortLeftWide: 94,
  TurnShortRightWide: 95,
  TurnLongLeftWide: 96,
  TurnLongRightWide: 97,
  SlopeUpVertical: 98,
  PlaneSlopePillar: 99,
  PlaneSlopePillarShort: 100,
  PillarBranch1Top: 101,
  PillarBranch1Bottom: 102,
  PillarBranch1Middle: 103,
  PillarBranch2Top: 104,
  PillarBranch2Middle: 105,
  PillarBranch2Bottom: 106,
  PillarBranch3Top: 107,
  PillarBranch3Middle: 108,
  PillarBranch3Bottom: 109,
  PillarBranch4Top: 110,
  PillarBranch4Middle: 111,
  PillarBranch4Bottom: 112,
  PillarBranch5: 113,
  PillarBranch5Top: 114,
  PillarBranch5Middle: 115,
  PillarBranch5Bottom: 116,
  ToWideDouble: 117,
  ToWideDiagonal: 118,
  StraightPillarBottom: 119,
  StraightPillarShort: 120,
  TurnSharpPillarBottom: 121,
  TurnSharpPillarShort: 122,
  IntersectionTPillarBottom: 123,
  IntersectionTPillarShort: 124,
  IntersectionCrossPillarBottom: 125,
  IntersectionCrossPillarShort: 126,
  PlaneBridgeCorner: 127,
  PlaneBridgeIntersectionT: 128,
  PlaneBridgeIntersectionCross: 129,
  BlockBridge: 130,
  BlockBridgeCorner: 131,
  BlockBridgeIntersectionT: 132,
  BlockBridgeIntersectionCross: 133,
  WallTrackCeilingCorner: 134,
  WallTrackCeilingPlaneCorner: 135,
  WallTrackFloorCorner: 136,
  WallTrackFloorPlaneCorner: 137,
  SlopeUpVerticalLeftWide: 138,
  SlopeUpVerticalRightWide: 139,
  BlockSlopeVerticalCornerTop: 140,
  BlockSlopeVerticalCornerBottom: 141,
  WallTrackSlopeToVertical: 142,
  PlaneSlopeToVertical: 143,
  BlockSlopeToVertical: 144,
  PlaneSlopeUpLong: 145,
  PlaneSlopeDownLong: 146,
  SlopeUpLongLeftWide: 147,
  SlopeUpLongRightWide: 148,
  SlopeDownLongLeftWide: 149,
  SlopeDownLongRightWide: 150,
  BlockSlopeUpLong: 151,
  BlockSlopeDownLong: 152,
  BlockSlopeVerticalInnerCornerBottom: 153,
  BlockSlopeVerticalInnerCornerTop: 154,
  BlockInnerCorner: 155,
};

// Reverse lookup: ID -> name
const BlockTypeName = {};
for (const [name, id] of Object.entries(BlockType)) {
  BlockTypeName[id] = name;
}

/** Category of blocks */
const Category = {
  Special: 0,
  Road: 1,
  RoadTurns: 2,
  RoadWide: 3,
  Plane: 4,
  Block: 5,
  WallTrack: 6,
  Pillar: 7,
  Sign: 8,
};

/** Rotation axis */
const RotationAxis = {
  YPositive: 0,
  YNegative: 1,
  XPositive: 2,
  XNegative: 3,
  ZPositive: 4,
  ZNegative: 5,
};
const RotationAxisName = {};
for (const [name, id] of Object.entries(RotationAxis)) {
  RotationAxisName[id] = name;
}

/** Environment/season */
const Environment = {
  Default: 0,
  Summer: 1,
  Winter: 2,
  Desert: 3,
  Custom0: 32,
  Custom1: 33,
  Custom2: 34,
  Custom3: 35,
  Custom4: 36,
  Custom5: 37,
  Custom6: 38,
  Custom7: 39,
  Custom8: 40,
};
const EnvironmentName = {};
for (const [name, id] of Object.entries(Environment)) {
  EnvironmentName[id] = name;
}

/** Color/style */
const ColorStyle = {
  Default: 0,
  Summer: 1,
  Winter: 2,
  Desert: 3,
  Custom0: 32,
  Custom1: 33,
  Custom2: 34,
  Custom3: 35,
  Custom4: 36,
  Custom5: 37,
  Custom6: 38,
  Custom7: 39,
  Custom8: 40,
};
const ColorStyleName = {};
for (const [name, id] of Object.entries(ColorStyle)) {
  ColorStyleName[id] = name;
}

// All checkpoint-like blocks (checkpoints + finish lines)
const CHECKPOINT_BLOCKS = [
  BlockType.Checkpoint,
  BlockType.CheckpointWide,
  BlockType.PlaneCheckpoint,
  BlockType.PlaneCheckpointWide,
  BlockType.Finish,
  BlockType.FinishWide,
  BlockType.PlaneFinish,
  BlockType.PlaneFinishWide,
];

// Blocks that have 2-byte checkpoint order in $A/v3 format (checkpoints only, NOT finish)
const V3_CHECKPOINT_ORDER_BLOCKS = [
  BlockType.Checkpoint,
  BlockType.CheckpointWide,
  BlockType.PlaneCheckpoint,
  BlockType.PlaneCheckpointWide,
];

// Start blocks (have extra 4-byte startOrder)
const START_BLOCKS = [
  BlockType.Start,
  BlockType.StartWide,
  BlockType.PlaneStart,
  BlockType.PlaneStartWide,
];

const PART_SIZE = 5; // Grid unit size in world coordinates

// ============================================================
// CUSTOM 62-CHAR ENCODING (from game bundle)
// ============================================================

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// Reverse lookup: char code -> index
const REVERSE_LOOKUP = new Array(123).fill(-1);
for (let i = 0; i < 26; i++) REVERSE_LOOKUP[65 + i] = i;       // A-Z -> 0-25
for (let i = 0; i < 26; i++) REVERSE_LOOKUP[97 + i] = 26 + i;  // a-z -> 26-51
for (let i = 0; i < 10; i++) REVERSE_LOOKUP[48 + i] = 52 + i;  // 0-9 -> 52-61

function packBits(bytes, bitOffset, numBits, value, isLast) {
  const byteIndex = Math.floor(bitOffset / 8);
  while (byteIndex >= bytes.length) bytes.push(0);
  const bitPos = bitOffset - 8 * byteIndex;
  bytes[byteIndex] |= (value << bitPos) & 255;
  if (bitPos > 8 - numBits && !isLast) {
    const nextByteIndex = byteIndex + 1;
    if (nextByteIndex >= bytes.length) bytes.push(0);
    bytes[nextByteIndex] |= value >> (8 - bitPos);
  }
}

function readBits(bytes, bitOffset) {
  const byteIndex = Math.floor(bitOffset / 8);
  if (byteIndex >= bytes.length) return 0;
  const bitPos = bitOffset - 8 * byteIndex;
  let value = bytes[byteIndex] >> bitPos;
  if (byteIndex + 1 < bytes.length && bitPos > 2) {
    value |= bytes[byteIndex + 1] << (8 - bitPos);
  }
  return value & 63;
}

/** Decode custom 62-char encoding to bytes */
function customDecode(str) {
  let bitOffset = 0;
  const bytes = [];
  const len = str.length;
  for (let i = 0; i < len; i++) {
    const charCode = str.charCodeAt(i);
    if (charCode >= REVERSE_LOOKUP.length) return null;
    const value = REVERSE_LOOKUP[charCode];
    if (value === -1) return null;
    const isLast = i === len - 1;
    if ((30 & ~value) !== 0) {
      packBits(bytes, bitOffset, 6, value, isLast);
      bitOffset += 6;
    } else {
      packBits(bytes, bitOffset, 5, value & 31, isLast);
      bitOffset += 5;
    }
  }
  return new Uint8Array(bytes);
}

/** Encode bytes to custom 62-char format */
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

// ============================================================
// TRACK DATA STRUCTURE
// ============================================================

class TrackPart {
  constructor(x, y, z, blockType, rotation, rotationAxis, color, checkpointOrder, startOrder) {
    this.x = x;
    this.y = y;
    this.z = z;
    this.blockType = blockType;
    this.rotation = rotation;           // 0-3 (90-degree increments)
    this.rotationAxis = rotationAxis;   // RotationAxis enum
    this.color = color;                 // ColorStyle enum
    this.checkpointOrder = checkpointOrder; // null or number (for checkpoint/finish blocks)
    this.startOrder = startOrder;       // null or number (for start blocks)
  }

  describe() {
    const name = BlockTypeName[this.blockType] || `Unknown(${this.blockType})`;
    const rot = ['North', 'East', 'South', 'West'][this.rotation] || `rot${this.rotation}`;
    const axis = RotationAxisName[this.rotationAxis] || `axis${this.rotationAxis}`;
    const col = ColorStyleName[this.color] || `color${this.color}`;

    let desc = `${name} at (${this.x}, ${this.y}, ${this.z}) facing ${rot}`;
    if (this.rotationAxis !== 0) desc += ` axis=${axis}`;
    if (this.color !== 0) desc += ` style=${col}`;
    if (this.checkpointOrder !== null) desc += ` checkpoint#${this.checkpointOrder}`;
    if (this.startOrder !== null) desc += ` start#${this.startOrder}`;
    return desc;
  }
}

class TrackData {
  constructor(environment, colorRepresentation) {
    this.environment = environment;
    this.colorRepresentation = colorRepresentation;
    this.parts = new Map(); // blockType -> TrackPart[]
  }

  addPart(x, y, z, blockType, rotation, rotationAxis, color, checkpointOrder, startOrder) {
    const part = new TrackPart(x, y, z, blockType, rotation, rotationAxis, color, checkpointOrder, startOrder);
    if (!this.parts.has(blockType)) {
      this.parts.set(blockType, []);
    }
    this.parts.get(blockType).push(part);
    return part;
  }

  getAllParts() {
    const all = [];
    for (const parts of this.parts.values()) {
      all.push(...parts);
    }
    return all;
  }

  get totalPieces() {
    let count = 0;
    for (const parts of this.parts.values()) count += parts.length;
    return count;
  }

  /** Serialize to binary format (newest format used by ex/ox) */
  serialize() {
    const e = [];

    // Byte 0: environment
    e.push(this.environment);
    // Byte 1: color representation
    e.push(this.colorRepresentation);

    // Calculate bounding box
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (const parts of this.parts.values()) {
      for (const p of parts) {
        minX = Math.min(p.x, minX);
        minY = Math.min(p.y, minY);
        minZ = Math.min(p.z, minZ);
        maxX = Math.max(p.x, maxX);
        maxY = Math.max(p.y, maxY);
        maxZ = Math.max(p.z, maxZ);
      }
    }

    if (!Number.isFinite(minX)) {
      minX = minY = minZ = maxX = maxY = maxZ = 0;
    }

    const rangeX = maxX - minX + 1;
    const rangeY = maxY - minY + 1;
    const rangeZ = maxZ - minZ + 1;

    // Variable byte sizes for coordinates (1-4 bytes each)
    const bytesX = Math.max(1, Math.min(4, Math.ceil(Math.log2(rangeX + 1) / 8)));
    const bytesY = Math.max(1, Math.min(4, Math.ceil(Math.log2(rangeY + 1) / 8)));
    const bytesZ = Math.max(1, Math.min(4, Math.ceil(Math.log2(rangeZ + 1) / 8)));

    // Write min coords as int32
    pushInt32(e, minX);
    pushInt32(e, minY);
    pushInt32(e, minZ);

    // Packed byte sizes
    e.push(bytesX | (bytesY << 2) | (bytesZ << 4));

    // Write each block type group
    for (const [blockType, parts] of this.parts) {
      if (blockType < 0 || blockType > 255) throw new Error("Type id out of range");

      e.push(blockType & 255);
      pushInt32LE(e, parts.length);

      for (const p of parts) {
        const dx = p.x - minX;
        const dy = p.y - minY;
        const dz = p.z - minZ;

        pushVarInt(e, dx, bytesX);
        pushVarInt(e, dy, bytesY);
        pushVarInt(e, dz, bytesZ);

        e.push(p.rotation & 3);
        e.push(p.rotationAxis & 7);
        e.push(p.color & 255);

        if (CHECKPOINT_BLOCKS.includes(blockType)) {
          const co = p.checkpointOrder || 0;
          e.push(co & 255, (co >>> 8) & 255);
        }
        if (START_BLOCKS.includes(blockType)) {
          const so = p.startOrder || 0;
          pushInt32LE(e, so);
        }
      }
    }

    return new Uint8Array(e);
  }
}

function pushInt32(arr, val) {
  arr.push(val & 255, (val >>> 8) & 255, (val >>> 16) & 255, (val >>> 24) & 255);
}
const pushInt32LE = pushInt32;

function pushVarInt(arr, val, numBytes) {
  for (let i = 0; i < numBytes; i++) {
    arr.push((val >>> (8 * i)) & 255);
  }
}

// ============================================================
// DECODE FUNCTIONS
// ============================================================

/** Parse raw bytes into TrackData (newest format - format used in PolyTrack1) */
function parseTrackBytes(bytes, offset = 0) {
  let n = offset;

  if (bytes.length - n < 1) return null;
  const environment = bytes[n]; n += 1;
  if (!(environment in EnvironmentName)) return null;

  if (bytes.length - n < 1) return null;
  const colorRep = bytes[n]; n += 1;
  if (!Number.isSafeInteger(colorRep) || colorRep < 0 || colorRep >= 180) return null;

  const track = new TrackData(environment, colorRep);

  if (bytes.length - n < 13) return null;

  // Read min coordinates (int32 LE)
  const minX = readInt32(bytes, n); n += 4;
  const minY = readInt32(bytes, n); n += 4;
  const minZ = readInt32(bytes, n); n += 4;

  // Packed byte sizes
  const packed = bytes[n]; n += 1;
  const bytesX = packed & 3;
  const bytesY = (packed >> 2) & 3;
  const bytesZ = (packed >> 4) & 3;

  if (bytesX < 1 || bytesX > 4 || bytesY < 1 || bytesY > 4 || bytesZ < 1 || bytesZ > 4) return null;

  while (n < bytes.length) {
    if (bytes.length - n < 1) return null;
    const blockType = bytes[n]; n += 1;
    if (!(blockType in BlockTypeName)) return null;

    if (bytes.length - n < 4) return null;
    const count = readUint32(bytes, n); n += 4;

    for (let i = 0; i < count; i++) {
      if (bytes.length - n < bytesX) return null;
      let x = readVarUint(bytes, n, bytesX) + minX; n += bytesX;

      if (bytes.length - n < bytesY) return null;
      let y = readVarUint(bytes, n, bytesY) + minY; n += bytesY;

      if (bytes.length - n < bytesZ) return null;
      let z = readVarUint(bytes, n, bytesZ) + minZ; n += bytesZ;

      if (bytes.length - n < 1) return null;
      const rotation = bytes[n]; n += 1;
      if (rotation < 0 || rotation > 3) return null;

      if (bytes.length - n < 1) return null;
      const rotAxis = bytes[n]; n += 1;
      if (!(rotAxis in RotationAxisName)) return null;

      if (bytes.length - n < 1) return null;
      const color = bytes[n]; n += 1;
      if (!(color in ColorStyleName)) return null;

      let checkpointOrder = null;
      if (CHECKPOINT_BLOCKS.includes(blockType)) {
        if (bytes.length - n < 2) return null;
        checkpointOrder = bytes[n] | (bytes[n + 1] << 8);
        n += 2;
      }

      let startOrder = null;
      if (START_BLOCKS.includes(blockType)) {
        if (bytes.length - n < 4) return null;
        startOrder = readUint32(bytes, n);
        n += 4;
      }

      track.addPart(x, y, z, blockType, rotation, rotAxis, color, checkpointOrder, startOrder);
    }
  }

  return track;
}

function readInt32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24));
}

function readUint32(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function readVarUint(bytes, offset, numBytes) {
  let val = 0;
  for (let i = 0; i < numBytes; i++) {
    val |= bytes[offset + i] << (8 * i);
  }
  return val;
}

/** Decode a v3 share code string into {name, trackData} */
function decodeV3ShareCode(shareCode) {
  if (!shareCode.startsWith('v3')) return null;

  // Name length from first 2 chars after "v3"
  const nameLenBytes = customDecode(shareCode.substring(2, 4));
  if (!nameLenBytes || nameLenBytes.length === 0) return null;
  const nameLen = nameLenBytes[0];

  // Name encoded in next nameLen chars (nameLen = number of ENCODED chars)
  const nameBytes = customDecode(shareCode.substring(4, 4 + nameLen));
  if (!nameBytes) return null;

  let name;
  try {
    name = new TextDecoder('utf-8').decode(nameBytes);
  } catch (e) {
    return null;
  }

  // Track data after name - uses $A format
  const trackDataStr = shareCode.substring(4 + nameLen);
  const trackData = decodeV3TrackData(trackDataStr);
  if (!trackData) return null;

  return { name, trackData };
}

/**
 * Extended block type mapping for IDs 134-178 (colored blocks).
 * Maps raw wire ID -> { blockType, color }
 */
const EXTENDED_BLOCK_MAP = {};
// Custom1 colored blocks (134-148)
const CUSTOM1_BLOCKS = [29,53,54,68,69,70,71,72,73,86,85,130,131,132,133];
for (let i = 0; i < CUSTOM1_BLOCKS.length; i++) {
  EXTENDED_BLOCK_MAP[134 + i] = { blockType: CUSTOM1_BLOCKS[i], color: ColorStyle.Custom1 };
}
// Custom6 colored blocks (149-163)
for (let i = 0; i < CUSTOM1_BLOCKS.length; i++) {
  EXTENDED_BLOCK_MAP[149 + i] = { blockType: CUSTOM1_BLOCKS[i], color: ColorStyle.Custom6 };
}
// Custom0 colored blocks (164-178)
for (let i = 0; i < CUSTOM1_BLOCKS.length; i++) {
  EXTENDED_BLOCK_MAP[164 + i] = { blockType: CUSTOM1_BLOCKS[i], color: ColorStyle.Custom0 };
}

/**
 * Companion block mapping for slope types (IDs 87-98).
 * Some block IDs are rewritten to a different type and get an additional scenery block.
 */
const COMPANION_MAP = {
  87:  { blockType: BlockType.Slope,             companion: BlockType.BlockSlopedUp },
  88:  { blockType: BlockType.SlopeUp,           companion: BlockType.BlockSlopeUp },
  89:  { blockType: BlockType.SlopeDown,         companion: BlockType.BlockSlopeDown },
  90:  { blockType: BlockType.SlopeUpLeftWide,   companion: BlockType.BlockSlopeUp },
  91:  { blockType: BlockType.SlopeUpRightWide,  companion: BlockType.BlockSlopeUp },
  92:  { blockType: BlockType.SlopeDownLeftWide,  companion: BlockType.BlockSlopeDown },
  93:  { blockType: BlockType.SlopeDownRightWide, companion: BlockType.BlockSlopeDown },
  94:  { blockType: BlockType.SlopeLeftWide,     companion: BlockType.BlockSlopedUp },
  95:  { blockType: BlockType.SlopeRightWide,    companion: BlockType.BlockSlopedUp },
  96:  { blockType: BlockType.PlaneSlopeUp,      companion: BlockType.BlockSlopeUp },
  97:  { blockType: BlockType.PlaneSlopeDown,    companion: BlockType.BlockSlopeDown },
  98:  { blockType: BlockType.PlaneSlope,        companion: BlockType.BlockSlopedUp },
};

/** Additional companion block offsets */
const COMPANION_OFFSETS = {
  79:  { companion: BlockType.WallTrackFloorPlaneCorner, offset: { x: 0, y: 0, z: 0 } },
  81:  { companion: BlockType.WallTrackCeilingPlaneCorner, offset: { x: 0, y: 3, z: 0 } },
};

/**
 * Decode track data in $A/v3 format.
 * Format: customDecode -> inflate -> parse blocks
 * Block format per group: [blockType:2][count:4] then per part: [x:3][y:3][z:3][rot:1] + optional checkpoint/start
 */
function decodeV3TrackData(str) {
  const decoded = customDecode(str);
  if (!decoded) return null;

  let inflated;
  try {
    inflated = pako.inflate(decoded);
    if (!inflated || !inflated.length) return null;
  } catch (e) {
    return null;
  }

  const track = new TrackData(Environment.Summer, 0);
  const bytes = inflated;
  let pos = 0;

  while (pos < bytes.length) {
    if (bytes.length - pos < 6) break; // Need at least type(2) + count(4)

    // Read 2-byte block type
    let rawType = bytes[pos] | (bytes[pos + 1] << 8);
    pos += 2;

    let blockType = rawType;
    let color = ColorStyle.Default;
    let isExtended = false;

    // Extended block type mapping (134-178 -> colored blocks)
    if (rawType >= 134 && rawType <= 178 && EXTENDED_BLOCK_MAP[rawType]) {
      blockType = EXTENDED_BLOCK_MAP[rawType].blockType;
      color = EXTENDED_BLOCK_MAP[rawType].color;
      isExtended = true;
    }

    // Companion block check (79, 81, 87-98)
    let companionType = null;
    let companionOffset = { x: 0, y: 0, z: 0 };

    if (COMPANION_OFFSETS[rawType]) {
      companionType = COMPANION_OFFSETS[rawType].companion;
      companionOffset = COMPANION_OFFSETS[rawType].offset;
    } else if (COMPANION_MAP[rawType]) {
      blockType = COMPANION_MAP[rawType].blockType;
      companionType = COMPANION_MAP[rawType].companion;
      isExtended = true;
    }

    // Validate block type - stop parsing if unknown (may be trailing data)
    if (!isExtended && !(blockType in BlockTypeName)) break;

    // Read count (4 bytes)
    const count = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24);
    pos += 4;

    // Sanity check
    if (count < 0 || count > 100000) break;

    let ok = true;
    for (let i = 0; i < count; i++) {
      if (bytes.length - pos < 10) { ok = false; break; }

      const xRaw = (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16)) - 8388608;
      pos += 3;
      const yRaw = bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16);
      pos += 3;
      const zRaw = (bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16)) - 8388608;
      pos += 3;
      const rotation = bytes[pos] & 3;
      pos += 1;

      // In $A format, only actual checkpoint blocks have 2-byte order.
      // Finish blocks and start blocks do NOT have extra bytes.
      let checkpointOrder = null;
      if (V3_CHECKPOINT_ORDER_BLOCKS.includes(blockType)) {
        if (bytes.length - pos < 2) { ok = false; break; }
        checkpointOrder = bytes[pos] | (bytes[pos + 1] << 8);
        pos += 2;
      } else if (CHECKPOINT_BLOCKS.includes(blockType)) {
        // Finish blocks: no extra bytes, use index as order
        checkpointOrder = i;
      }

      let startOrder = null;
      if (START_BLOCKS.includes(blockType)) {
        startOrder = 0;
      }

      const x = 4 * xRaw;
      const y = yRaw;
      const z = 4 * zRaw;

      if (companionType !== null) {
        track.addPart(
          x + companionOffset.x, y + companionOffset.y, z + companionOffset.z,
          companionType, rotation, RotationAxis.YPositive, ColorStyle.Default, null, startOrder
        );
      }

      track.addPart(x, y, z, blockType, rotation, RotationAxis.YPositive, color, checkpointOrder, startOrder);
    }

    if (!ok) break;
  }

  return track.totalPieces > 0 ? track : null;
}

/** Decode track data from the ex format (PolyTrack1/newest format) */
function decodeExTrackData(str) {
  const decoded = customDecode(str);
  if (!decoded) return null;

  try {
    const inflated = pako.inflate(decoded);
    return parseTrackBytes(inflated, 0);
  } catch (e) {
    return null;
  }
}

/** Encode TrackData into a v3 share code (using $A format for track data) */
function encodeV3ShareCode(name, trackData) {
  const nameBytes = new TextEncoder().encode(name);
  // Name length encoded as custom62
  const nameLenEncoded = customEncode(new Uint8Array([nameBytes.length]));
  // Name bytes encoded as custom62
  const nameEncoded = customEncode(nameBytes);

  // Serialize track data in $A format (3-byte coords, 2-byte block types)
  const rawBytes = serializeV3Format(trackData);
  const deflated = pako.deflate(rawBytes, { level: 9 });
  const trackEncoded = customEncode(deflated);

  // v3 + nameLenEncoded + nameEncoded chars = nameLen encoded chars + track data
  // nameLen tells how many ENCODED chars follow for the name
  const nameEncodedLen = nameEncoded.length;
  const nameLenBytes = customEncode(new Uint8Array([nameEncodedLen]));

  return 'v3' + nameLenBytes + nameEncoded + trackEncoded;
}

/** Serialize TrackData to $A binary format (v3 compatible) */
function serializeV3Format(trackData) {
  const bytes = [];

  for (const [blockType, parts] of trackData.parts) {
    // Block type as uint16 LE
    bytes.push(blockType & 255, (blockType >> 8) & 255);

    // Count as uint32 LE
    const count = parts.length;
    bytes.push(count & 255, (count >> 8) & 255, (count >> 16) & 255, (count >> 24) & 255);

    for (const p of parts) {
      // x: divide by 4, add 2^23, write as 3 bytes
      const xRaw = Math.round(p.x / 4) + Math.pow(2, 23);
      bytes.push(xRaw & 255, (xRaw >> 8) & 255, (xRaw >> 16) & 255);

      // y: write as 3 bytes unsigned
      const yRaw = p.y;
      bytes.push(yRaw & 255, (yRaw >> 8) & 255, (yRaw >> 16) & 255);

      // z: divide by 4, add 2^23, write as 3 bytes
      const zRaw = Math.round(p.z / 4) + Math.pow(2, 23);
      bytes.push(zRaw & 255, (zRaw >> 8) & 255, (zRaw >> 16) & 255);

      // rotation: 1 byte
      bytes.push(p.rotation & 3);

      // In $A format, only actual checkpoint blocks have 2-byte order.
      // Finish blocks do NOT have extra bytes.
      if (V3_CHECKPOINT_ORDER_BLOCKS.includes(blockType)) {
        const co = p.checkpointOrder || 0;
        bytes.push(co & 255, (co >> 8) & 255);
      }
    }
  }

  return new Uint8Array(bytes);
}

/** Encode TrackData into PolyTrack1 save string */
function encodePolyTrack1(name, trackData, author = null) {
  const nameBytes = new TextEncoder().encode(name);
  const authorBytes = author ? new TextEncoder().encode(author) : null;
  const authorLen = authorBytes ? authorBytes.length : 0;

  const header = new Uint8Array(1 + nameBytes.length + 1 + authorLen);
  header[0] = nameBytes.length;
  header.set(nameBytes, 1);
  header[1 + nameBytes.length] = authorLen;
  if (authorBytes) header.set(authorBytes, 1 + nameBytes.length + 1);

  const rawBytes = trackData.serialize();

  // First deflate: header + track data
  const deflate1 = pako.deflate(Buffer.concat([header, rawBytes]), { level: 9, windowBits: 9, memLevel: 9 });
  const encoded1 = customEncode(deflate1);

  // Second deflate
  const deflate2 = pako.deflate(Buffer.from(encoded1), { level: 9, windowBits: 15, memLevel: 9 });

  return 'PolyTrack1' + customEncode(deflate2);
}

// ============================================================
// HUMAN-READABLE TRACK DESCRIPTION
// ============================================================

/** Get a category description for a block type */
function getBlockCategory(blockType) {
  const name = BlockTypeName[blockType] || 'Unknown';

  if (name.includes('Start')) return 'start';
  if (name.includes('Finish')) return 'finish';
  if (name.includes('Checkpoint')) return 'checkpoint';
  if (name.includes('Straight')) return 'road';
  if (name.includes('Turn') || name.includes('Corner')) return 'turn';
  if (name.includes('Slope') && name.includes('Up')) return 'uphill';
  if (name.includes('Slope') && name.includes('Down')) return 'downhill';
  if (name.includes('Slope')) return 'slope';
  if (name.includes('Pillar') || name.includes('Bridge')) return 'structure';
  if (name.includes('Block')) return 'scenery';
  if (name.includes('Plane')) return 'platform';
  if (name.includes('Wall')) return 'wall';
  if (name.includes('Sign')) return 'sign';
  if (name.includes('Intersection')) return 'intersection';
  if (name.includes('Wide')) return 'wide-road';
  return 'road';
}

/** Generate a full human-readable description of a track */
function describeTrack(name, trackData) {
  const lines = [];
  lines.push(`=== Track: "${name}" ===`);
  lines.push(`Environment: ${EnvironmentName[trackData.environment] || 'Unknown'}`);
  lines.push(`Total pieces: ${trackData.totalPieces}`);
  lines.push('');

  // Count by category
  const categories = {};
  const allParts = trackData.getAllParts();

  for (const part of allParts) {
    const cat = getBlockCategory(part.blockType);
    if (!categories[cat]) categories[cat] = 0;
    categories[cat]++;
  }

  lines.push('--- Piece Breakdown ---');
  for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${cat}: ${count} pieces`);
  }
  lines.push('');

  // Count by block type
  const typeCounts = {};
  for (const part of allParts) {
    const name = BlockTypeName[part.blockType];
    if (!typeCounts[name]) typeCounts[name] = 0;
    typeCounts[name]++;
  }

  lines.push('--- Detailed Block Types ---');
  for (const [name, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${name}: ${count}`);
  }
  lines.push('');

  // Bounding box
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of allParts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }

  lines.push('--- Dimensions ---');
  lines.push(`  X range: ${minX} to ${maxX} (width: ${maxX - minX + 1})`);
  lines.push(`  Y range: ${minY} to ${maxY} (height: ${maxY - minY + 1})`);
  lines.push(`  Z range: ${minZ} to ${maxZ} (depth: ${maxZ - minZ + 1})`);
  lines.push('');

  // Checkpoints
  const checkpoints = allParts
    .filter(p => p.checkpointOrder !== null)
    .sort((a, b) => a.checkpointOrder - b.checkpointOrder);

  if (checkpoints.length > 0) {
    lines.push('--- Checkpoints ---');
    for (const cp of checkpoints) {
      const typeName = BlockTypeName[cp.blockType];
      lines.push(`  #${cp.checkpointOrder}: ${typeName} at (${cp.x}, ${cp.y}, ${cp.z})`);
    }
    lines.push('');
  }

  // Start positions
  const starts = allParts
    .filter(p => p.startOrder !== null)
    .sort((a, b) => a.startOrder - b.startOrder);

  if (starts.length > 0) {
    lines.push('--- Start Positions ---');
    for (const s of starts) {
      const typeName = BlockTypeName[s.blockType];
      lines.push(`  #${s.startOrder}: ${typeName} at (${s.x}, ${s.y}, ${s.z}) facing ${['North', 'East', 'South', 'West'][s.rotation]}`);
    }
    lines.push('');
  }

  // Track path description
  lines.push('--- Track Layout Description ---');
  lines.push(describeTrackPath(trackData));

  return lines.join('\n');
}

/** Describe the track path in plain English */
function describeTrackPath(trackData) {
  const allParts = trackData.getAllParts();

  // Find start piece
  const startParts = allParts.filter(p => START_BLOCKS.includes(p.blockType));
  const finishParts = allParts.filter(p =>
    p.blockType === BlockType.Finish || p.blockType === BlockType.FinishWide ||
    p.blockType === BlockType.PlaneFinish || p.blockType === BlockType.PlaneFinishWide
  );

  if (startParts.length === 0) return '  (No start position found)';

  const start = startParts[0];
  const lines = [];

  // Build spatial map
  const grid = new Map();
  for (const p of allParts) {
    const key = `${p.x},${p.y},${p.z}`;
    grid.set(key, p);
  }

  // Count elevation changes
  const yValues = [...new Set(allParts.map(p => p.y))].sort((a, b) => a - b);
  const heightLevels = yValues.length;

  // Count turns
  const turns = allParts.filter(p => getBlockCategory(p.blockType) === 'turn');
  const uphills = allParts.filter(p => getBlockCategory(p.blockType) === 'uphill');
  const downhills = allParts.filter(p => getBlockCategory(p.blockType) === 'downhill');
  const roads = allParts.filter(p => getBlockCategory(p.blockType) === 'road');
  const structures = allParts.filter(p => getBlockCategory(p.blockType) === 'structure');
  const scenery = allParts.filter(p => getBlockCategory(p.blockType) === 'scenery');

  lines.push(`  The track starts at position (${start.x}, ${start.y}, ${start.z}) facing ${['North', 'East', 'South', 'West'][start.rotation]}.`);

  if (roads.length > 0) lines.push(`  It has ${roads.length} straight road segments.`);
  if (turns.length > 0) lines.push(`  There are ${turns.length} turns/corners.`);
  if (uphills.length > 0) lines.push(`  ${uphills.length} uphill slope sections.`);
  if (downhills.length > 0) lines.push(`  ${downhills.length} downhill slope sections.`);
  if (structures.length > 0) lines.push(`  ${structures.length} structural elements (pillars, bridges).`);
  if (scenery.length > 0) lines.push(`  ${scenery.length} scenery/block pieces.`);

  if (heightLevels > 1) {
    lines.push(`  The track spans ${heightLevels} height levels (Y: ${yValues[0]} to ${yValues[yValues.length - 1]}).`);
  } else {
    lines.push(`  The track is flat (single height level).`);
  }

  if (finishParts.length > 0) {
    const finish = finishParts[0];
    const dist = Math.sqrt(
      (finish.x - start.x) ** 2 +
      (finish.y - start.y) ** 2 +
      (finish.z - start.z) ** 2
    );
    lines.push(`  The finish line is at (${finish.x}, ${finish.y}, ${finish.z}), ${dist.toFixed(1)} units from start.`);
  }

  return lines.join('\n');
}

// ============================================================
// TRACK GENERATOR
// ============================================================

/**
 * Grid and direction system (verified from real track analysis):
 *
 * Coordinate system:
 *   +X = East, -X = West, +Z = South, -Z = North, +Y = Up
 *   Grid spacing: 4 world units per cell
 *
 * Heading directions (rotation values):
 *   0 = North (-Z)    delta: (0, 0, -4)
 *   1 = West  (-X)    delta: (-4, 0, 0)
 *   2 = South (+Z)    delta: (0, 0, +4)
 *   3 = East  (+X)    delta: (+4, 0, 0)
 *
 * Rotation for pieces:
 *   Straight/Checkpoint/Start/Finish: rotation = heading
 *   TurnSharp RIGHT: rotation = heading, new heading = (heading + 3) % 4
 *   TurnSharp LEFT:  rotation = (heading + 3) % 4, new heading = (heading + 1) % 4
 *
 * Slopes:
 *   SlopeUp:   Y += 1 per piece (gentle ramp)
 *   SlopeDown: Y -= 1 per piece
 *   Slope:     Y += 2 per piece (steep ramp, always uphill)
 */

// Direction deltas indexed by heading (in world units, 4 per grid cell)
const HEADING_DELTA = [
  { dx: 0, dz: -4 },   // 0 = North (-Z)
  { dx: -4, dz: 0 },   // 1 = West (-X)
  { dx: 0, dz: 4 },    // 2 = South (+Z)
  { dx: 4, dz: 0 },    // 3 = East (+X)
];

const HEADING_NAME = ['North', 'West', 'South', 'East'];

/**
 * Generate a random track with controllable parameters.
 *
 * The generator builds a track piece-by-piece, walking along a path:
 * - Pieces connect end-to-end on a 4-unit grid
 * - Collision detection prevents overlapping pieces
 * - Checkpoints are placed in order along the path
 * - The track always starts with Start and ends with Finish
 * - Height (Y) is managed so the track doesn't go below 0
 *
 * @param {object} params
 * @param {string} params.name - Track name
 * @param {number} params.length - Number of road pieces (default: 30)
 * @param {number} params.elevation - Height variation knob (default: 1)
 * @param {number} params.curviness - Turn frequency knob (default: 1)
 * @param {number} params.numCheckpoints - Number of checkpoints (default: 2)
 * @param {string} params.environment - Summer/Winter/Desert/Default (default: Summer)
 * @param {boolean} params.includeScenery - Add scenery blocks around track
 * @param {number} params.seed - Random seed for reproducibility
 * @param {number} params.maxHeight - Clamp Y height (default: 24)
 * @param {number} params.maxAttemptsPerPiece - Placement attempts per step (default: 25)
 * @param {boolean} params.allowIntersections - Allow self-intersections by upgrading Straights to IntersectionCross (default: false)
 * @param {number} params.intersectionChance - Chance 0..1 to allow crossing into an occupied Straight (default: 0.15)
 * @param {number} params.templateChance - Chance 0..1 to enqueue a 3-5 piece template (default: 0.25)
 * @param {boolean} params.allowSteepSlopes - Allow Slope (+2Y) pieces (default: true)
 * @returns {{ shareCode: string, description: string, trackData: TrackData }}
 */
function generateTrack(params = {}) {
  const {
    name = 'Generated Track',
    length: trackLength = 30,
    elevation = 1,
    curviness = 1,
    numCheckpoints = 2,
    environment = 'Summer',
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
  const env = Environment[environment] || Environment.Summer;
  const placedByCell = new Map(); // cellKey -> plain TrackPart-like object

  const elevationProb = Math.max(0, Math.min(0.95, elevation * 0.1));
  const turnProb = Math.max(0, Math.min(0.95, curviness * 0.18));
  const intersectionProb = Math.max(0, Math.min(1, intersectionChance));
  const templateProb = Math.max(0, Math.min(1, templateChance));
  const maxHeightY = Math.max(0, Math.floor(maxHeight));
  const attemptsPerPiece = Math.max(1, Math.floor(maxAttemptsPerPiece));

  let x = 0, y = 0, z = 0;
  let heading = 0; // Start facing North

  // Track occupied grid cells to prevent overlaps
  const occupied = new Set();
  const cellKey = (px, py, pz) => `${px},${py},${pz}`;
  const markOccupied = (px, py, pz) => occupied.add(cellKey(px, py, pz));
  const isOccupied = (px, py, pz) => occupied.has(cellKey(px, py, pz));

  // Get the next position given current position and heading
  const nextPos = (cx, cy, cz, h) => ({
    x: cx + HEADING_DELTA[h].dx,
    y: cy,
    z: cz + HEADING_DELTA[h].dz,
  });

  // Check if a position is free (and within reasonable bounds)
  const isFree = (px, py, pz) => !isOccupied(px, py, pz) && py >= 0;

  // Place a piece and advance position
  let lastPlacedKey = null;
  const placePiece = (blockType, rotation, cpOrder, startOrder) => {
    if (isOccupied(x, y, z)) {
      throw new Error(`Generator attempted to place on occupied cell: ${cellKey(x, y, z)}`);
    }
    placedByCell.set(cellKey(x, y, z), {
      x, y, z,
      blockType,
      rotation,
      rotationAxis: RotationAxis.YPositive,
      color: ColorStyle.Default,
      checkpointOrder: cpOrder,
      startOrder,
    });
    lastPlacedKey = cellKey(x, y, z);
    markOccupied(x, y, z);
  };

  const axisForHeading = (h) => (h === 0 || h === 2) ? 'NS' : 'EW';

  const canExitIntoIntersection = (nx, ny, nz, travelHeading) => {
    if (!allowIntersections) return false;
    if (!isOccupied(nx, ny, nz)) return false;
    if (rng() >= intersectionProb) return false;

    const existing = placedByCell.get(cellKey(nx, ny, nz));
    if (!existing) return false;
    if (existing.blockType === BlockType.IntersectionCross) return true;
    if (existing.blockType !== BlockType.Straight) return false;

    const existingAxis = axisForHeading(existing.rotation);
    const incomingAxis = axisForHeading(travelHeading);
    return existingAxis !== incomingAxis;
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
  const next = nextPos(x, y, z, heading);
  x = next.x; y = next.y; z = next.z;

  // ---- Determine checkpoint placement positions ----
  let checkpointsPlaced = 0;
  const checkpointIntervalRaw = numCheckpoints > 0
    ? Math.floor(trackLength / (numCheckpoints + 1))
    : Infinity;
  const checkpointInterval = Number.isFinite(checkpointIntervalRaw) && checkpointIntervalRaw >= 1
    ? checkpointIntervalRaw
    : 1;

  const templates = [
    // Common patterns from real tracks (simplified to pieces this generator can reason about)
    ['straight', 'straight', 'straight'],
    ['turnR', 'straight', 'turnL'],
    ['turnL', 'straight', 'turnR'],
    ['up', 'down'],
    ['up', 'steepUp', 'down'],
    ['straight', 'straight', 'up', 'steepUp', 'down'],
  ];
  const actionQueue = [];

  // ---- Build the track ----
  for (let i = 0; i < trackLength; i++) {
    // If we land on an already-placed cell, only allow it when it can become an intersection.
    if (isOccupied(x, y, z)) {
      if (ensureIntersectionCrossAtCell(x, y, z, heading)) {
        const passthrough = nextPos(x, y, z, heading);
        x = passthrough.x; y = passthrough.y; z = passthrough.z;
        continue;
      }
      break;
    }

    const placeStraightLike = (blockType, cpOrder) => {
      const exit = nextPos(x, y, z, heading);
      if (!isFree(x, y, z)) return false;
      if (!isFree(exit.x, exit.y, exit.z) && !canExitIntoIntersection(exit.x, exit.y, exit.z, heading)) return false;
      placePiece(blockType, heading, cpOrder ?? null, null);
      x = exit.x; y = exit.y; z = exit.z;
      return true;
    };

    const placeSlopeUp = () => {
      const nextY = y + 1;
      if (nextY > maxHeightY) return false;
      const exit = nextPos(x, y, z, heading);
      if (!isFree(x, y, z)) return false;
      if (!isFree(exit.x, nextY, exit.z) && !canExitIntoIntersection(exit.x, nextY, exit.z, heading)) return false;
      placePiece(BlockType.SlopeUp, heading, null, null);
      x = exit.x; y = nextY; z = exit.z;
      return true;
    };

    const placeSlopeDown = () => {
      if (y <= 0) return false;
      const nextY = y - 1;
      const exit = nextPos(x, nextY, z, heading);
      // Be conservative: require both the entry cell (y) and the part anchor (y-1) to be clear.
      if (!isFree(x, y, z)) return false;
      if (!isFree(x, nextY, z)) return false;
      if (!isFree(exit.x, nextY, exit.z) && !canExitIntoIntersection(exit.x, nextY, exit.z, heading)) return false;
      y = nextY;
      placePiece(BlockType.SlopeDown, heading, null, null);
      x = exit.x; z = exit.z;
      return true;
    };

    const placeSlopeSteep = () => {
      const nextY = y + 2;
      if (nextY > maxHeightY) return false;
      const exit = nextPos(x, y, z, heading);
      if (!isFree(x, y, z)) return false;
      if (!isFree(exit.x, nextY, exit.z) && !canExitIntoIntersection(exit.x, nextY, exit.z, heading)) return false;
      placePiece(BlockType.Slope, heading, null, null);
      x = exit.x; y = nextY; z = exit.z;
      return true;
    };

    const placeTurnSharpDir = (turnRight) => {
      let newHeading, turnRotation;

      if (turnRight) {
        // Right turn: rotation = heading, new heading = (heading + 3) % 4
        turnRotation = heading;
        newHeading = (heading + 3) % 4;
      } else {
        // Left turn: rotation = (heading + 3) % 4, new heading = (heading + 1) % 4
        turnRotation = (heading + 3) % 4;
        newHeading = (heading + 1) % 4;
      }

      const exit = nextPos(x, y, z, newHeading);
      if (!isFree(x, y, z)) return false;
      if (!isFree(exit.x, exit.y, exit.z) && !canExitIntoIntersection(exit.x, exit.y, exit.z, newHeading)) return false;
      placePiece(BlockType.TurnSharp, turnRotation, null, null);
      heading = newHeading;
      x = exit.x; y = exit.y; z = exit.z;
      return true;
    };

    const placeTurnSharp = () => placeTurnSharpDir(rng() < 0.5);

    const shouldCheckpoint = checkpointsPlaced < numCheckpoints && (i + 1) % checkpointInterval === 0;
    let placed = false;

    for (let attempt = 0; attempt < attemptsPerPiece && !placed; attempt++) {
      // 1) Checkpoint placement (try first, then fall back if blocked)
      if (shouldCheckpoint && attempt === 0) {
        actionQueue.length = 0;
        placed = placeStraightLike(BlockType.Checkpoint, checkpointsPlaced);
        if (placed) checkpointsPlaced++;
        continue;
      }

      // 1b) Template queue (keeps 3-5 piece patterns consistent)
      if (attempt === 0 && !shouldCheckpoint) {
        if (actionQueue.length === 0 && templateProb > 0 && rng() < templateProb) {
          const t = templates[Math.floor(rng() * templates.length)];
          actionQueue.push(...t);
        }

        if (actionQueue.length > 0) {
          const nextAction = actionQueue[0];
          const ok = (
            (nextAction === 'straight' && placeStraightLike(BlockType.Straight, null)) ||
            (nextAction === 'turnR' && placeTurnSharpDir(true)) ||
            (nextAction === 'turnL' && placeTurnSharpDir(false)) ||
            (nextAction === 'up' && placeSlopeUp()) ||
            (nextAction === 'down' && placeSlopeDown()) ||
            (nextAction === 'steepUp' && allowSteepSlopes && placeSlopeSteep())
          );
          if (ok) {
            actionQueue.shift();
            placed = true;
            continue;
          }
          // Can't continue template from here; drop it and fall back to freeform.
          actionQueue.length = 0;
        }
      }

      // 2) Elevation changes
      if (!placed && elevationProb > 0 && rng() < elevationProb) {
        if (allowSteepSlopes && rng() < 0.35) {
          placed = placeSlopeSteep();
        } else {
          placed = (rng() < 0.55) ? placeSlopeUp() : placeSlopeDown();
        }
        if (placed) continue;
      }

      // 3) Turns
      if (!placed && turnProb > 0 && rng() < turnProb) {
        placed = placeTurnSharp();
        if (placed) continue;
      }

      // 4) Default: straight
      placed = placeStraightLike(BlockType.Straight, null);
    }

    if (!placed) break;
  }

  // ---- Place Finish ----
  // If we ended by crossing into an occupied straight (intersection), resolve that now.
  for (let n = 0; n < 8 && isOccupied(x, y, z); n++) {
    if (!ensureIntersectionCrossAtCell(x, y, z, heading)) break;
    const passthrough = nextPos(x, y, z, heading);
    x = passthrough.x; y = passthrough.y; z = passthrough.z;
  }

  // If the current position is occupied, try to find an adjacent free cell
  if (isOccupied(x, y, z)) {
    for (let h = 0; h < 4; h++) {
      const alt = nextPos(x - HEADING_DELTA[heading].dx, y, z - HEADING_DELTA[heading].dz, h);
      if (isFree(alt.x, alt.y, alt.z)) {
        x = alt.x; z = alt.z; heading = h;
        break;
      }
    }
  }

  if (isFree(x, y, z)) {
    placePiece(BlockType.Finish, heading, numCheckpoints, null);
  } else {
    // Last resort: upgrade the last placed straight into a finish.
    const last = lastPlacedKey ? placedByCell.get(lastPlacedKey) : null;
    if (last && last.blockType === BlockType.Straight) {
      last.blockType = BlockType.Finish;
      last.rotation = heading;
      last.checkpointOrder = numCheckpoints;
    } else {
      // If we can't place a finish, stop without throwing (still encodes/decodes for debugging).
    }
  }

  // ---- Build TrackData from placed parts ----
  const track = new TrackData(env, 0);
  const placedParts = Array.from(placedByCell.values()).sort((a, b) => {
    if (a.blockType !== b.blockType) return a.blockType - b.blockType;
    if (a.y !== b.y) return a.y - b.y;
    if (a.z !== b.z) return a.z - b.z;
    return a.x - b.x;
  });
  for (const p of placedParts) {
    track.addPart(p.x, p.y, p.z, p.blockType, p.rotation, p.rotationAxis, p.color, p.checkpointOrder, p.startOrder);
  }

  // ---- Add scenery if requested ----
  if (includeScenery) {
    addScenery(track, rng, occupied, markOccupied);
  }

  const shareCode = encodeV3ShareCode(name, track);
  const description = describeTrack(name, track);

  return { shareCode, description, trackData: track };
}

/** Add decorative scenery blocks around the track edges */
function addScenery(track, rng, occupied, markOccupied) {
  // Collect all road positions
  const roadPositions = [];
  for (const [, parts] of track.parts) {
    for (const p of parts) {
      roadPositions.push({ x: p.x, y: p.y, z: p.z });
    }
  }

  for (const pos of roadPositions) {
    if (rng() < 0.4) continue;

    // Try adjacent cells (8 units away = 2 grid cells for spacing)
    const offsets = [
      { dx: 8, dz: 0 }, { dx: -8, dz: 0 },
      { dx: 0, dz: 8 }, { dx: 0, dz: -8 },
    ];

    for (const off of offsets) {
      const sx = pos.x + off.dx;
      const sz = pos.z + off.dz;

      if (!occupied.has(`${sx},${pos.y},${sz}`) && rng() < 0.15) {
        const sceneryTypes = [BlockType.Block, BlockType.HalfBlock, BlockType.QuarterBlock];
        const sType = sceneryTypes[Math.floor(rng() * sceneryTypes.length)];
        const rot = Math.floor(rng() * 4);
        track.addPart(sx, pos.y, sz, sType, rot, RotationAxis.YPositive, ColorStyle.Default, null, null);
        markOccupied(sx, pos.y, sz);
      }
    }
  }
}

/** Simple seeded PRNG (mulberry32) */
function createRNG(seed) {
  let s = seed | 0;
  return function() {
    s |= 0;
    s = s + 0x6D2B79F5 | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  // Enums
  BlockType,
  BlockTypeName,
  Category,
  RotationAxis,
  RotationAxisName,
  Environment,
  EnvironmentName,
  ColorStyle,
  ColorStyleName,
  CHECKPOINT_BLOCKS,
  START_BLOCKS,
  PART_SIZE,

  // Classes
  TrackPart,
  TrackData,

  // Encoding
  customDecode,
  customEncode,

  // Decode
  decodeV3ShareCode,
  decodeV3TrackData,
  decodeExTrackData,
  parseTrackBytes,

  // Encode
  encodeV3ShareCode,
  serializeV3Format,
  encodePolyTrack1,

  // Description
  describeTrack,
  describeTrackPath,
  getBlockCategory,

  // Generator
  generateTrack,
  createRNG,
};
