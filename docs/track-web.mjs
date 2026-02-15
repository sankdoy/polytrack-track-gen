/* eslint-disable */
// Browser-only track generator + PolyTrack1/v3 share code encoder.
// Requires `pako` on `globalThis` (loaded via <script> in index.html).

import { TUBE_REFERENCE_DATA } from "./tube-reference-data.mjs";

export const BlockType = {
  Straight: 0,
  TurnSharp: 1,
  SlopeUp: 2,
  SlopeDown: 3,
  Slope: 4,
  Start: 5,
  Finish: 6,
  LoopStart: 25,
  LoopEnd: 26,
  LoopMid: 27,
  Pipe: 28,
  PillarTop: 19,
  Pillar: 20,
  PillarBase: 21,
  TunnelEntry: 31,
  TunnelMid: 32,
  TunnelExit: 33,
  BankLeft: 34,
  BankRight: 35,
  TurnShort: 36,
  SlopeUpLong: 38,
  SlopeDownLong: 39,
  IntersectionT: 43,
  IntersectionCross: 44,
  CorkLeft: 45,
  CorkRight: 46,
  HalfPipe: 47,
  QuarterPipe: 48,
  WallRideLeft: 49,
  WallRideRight: 50,
  JumpRamp: 51,
  Checkpoint: 52,
  Block: 29,
  HalfBlock: 53,
  QuarterBlock: 54,
  LoopFull: 60,
  LoopHalf: 61,
  SpiralUp: 62,
  SpiralDown: 63,
  TubeOpen: 64,
  Booster: 66,
  WideRoad: 68,
  NarrowRoad: 69,
  CurveBank: 70,
  CurveBankWide: 71,
  StuntRamp: 72,
  StuntRampWide: 73,
  HalfPipeWide: 74,
  TurnLong3: 83,
  Helix: 88,
  Corkscrew: 90,
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

const REF_START_ID = 5;
const REF_FINISH_ID = 6;

function getRefTemplate(templateId) {
  const t = TUBE_REFERENCE_DATA[templateId];
  if (!t) throw new Error(`Unknown tube reference template: ${templateId}`);
  return t;
}

function tuplesToParts(tuples) {
  return tuples.map(([blockType, x, y, z, rotation, rotAxis, color, checkpointOrder, startOrder]) => ({
    blockType,
    x,
    y,
    z,
    rotation,
    rotAxis,
    color,
    checkpointOrder,
    startOrder,
  }));
}

function clonePart(p) {
  return {
    blockType: p.blockType,
    x: p.x,
    y: p.y,
    z: p.z,
    rotation: p.rotation,
    rotAxis: p.rotAxis,
    color: p.color,
    checkpointOrder: p.checkpointOrder ?? null,
    startOrder: p.startOrder ?? null,
  };
}

function partKey(p) {
  const co = p.checkpointOrder ?? "";
  const so = p.startOrder ?? "";
  return `${p.blockType}|${p.x}|${p.y}|${p.z}|${p.rotation}|${p.rotAxis}|${p.color}|${co}|${so}`;
}

function dedupeParts(parts) {
  const out = [];
  const seen = new Set();
  for (const p of parts) {
    const k = partKey(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function referenceSegmentRepeatParts(segments, includeEndpoints) {
  const n = Math.max(1, Math.floor(segments));
  const segment = tuplesToParts(getRefTemplate("tube_ref_segment_exact").parts);
  const out = [];
  for (let i = 0; i < n; i++) {
    const targetZ = -4 * (i + 1);
    const dz = targetZ - (-32);
    for (const p of segment) {
      out.push({ ...clonePart(p), z: p.z + dz });
    }
  }

  if (includeEndpoints) {
    const straight = tuplesToParts(getRefTemplate("tube_ref_straight_exact").parts);
    const start = straight.find((p) => p.blockType === REF_START_ID);
    const finish = straight.find((p) => p.blockType === REF_FINISH_ID);
    if (start) out.push(clonePart(start));
    if (finish) out.push({ ...clonePart(finish), z: -4 * (n + 1) });
  }

  return dedupeParts(out);
}

function buildPartsFromTubeReferenceRecipe(recipe) {
  const kind = recipe?.kind;
  if (kind === "exact") {
    const template = getRefTemplate(recipe.templateId);
    return tuplesToParts(template.parts).map(clonePart);
  }

  if (kind === "segment_repeat") {
    return referenceSegmentRepeatParts(recipe.segments ?? 8, recipe.includeEndpoints !== false);
  }

  if (kind === "composite") {
    const out = [];
    for (const mod of recipe.modules || []) {
      const template = getRefTemplate(mod.templateId);
      const dx = mod.dx || 0;
      const dy = mod.dy || 0;
      const dz = mod.dz || 0;
      const dropStart = !!mod.dropStart;
      const dropFinish = !!mod.dropFinish;

      for (const p0 of tuplesToParts(template.parts)) {
        if (dropStart && p0.blockType === REF_START_ID) continue;
        if (dropFinish && p0.blockType === REF_FINISH_ID) continue;
        out.push({ ...clonePart(p0), x: p0.x + dx, y: p0.y + dy, z: p0.z + dz });
      }
    }
    return dedupeParts(out);
  }

  throw new Error(`Unknown tube reference recipe kind: ${String(kind)}`);
}

function buildTubeReferenceScenarios() {
  const scenarios = [
    { id: "tube_ref_exact_straight", label: "Tube Ref Objective: exact straight from reference", tubeReferenceRecipe: { kind: "exact", templateId: "tube_ref_straight_exact" } },
    { id: "tube_ref_exact_segment", label: "Tube Ref Objective: exact single segment from reference", tubeReferenceRecipe: { kind: "exact", templateId: "tube_ref_segment_exact" } },
    { id: "tube_ref_exact_left_turn", label: "Tube Ref Objective: exact LEFT turn from reference", tubeReferenceRecipe: { kind: "exact", templateId: "tube_ref_left_exact" } },
    { id: "tube_ref_exact_right_turn", label: "Tube Ref Objective: exact RIGHT turn from reference", tubeReferenceRecipe: { kind: "exact", templateId: "tube_ref_right_exact" } },
    { id: "tube_ref_exact_up_turn", label: "Tube Ref Objective: exact UP turn from reference", tubeReferenceRecipe: { kind: "exact", templateId: "tube_ref_up_exact" } },
  ];

  for (const n of [1, 2, 3, 4, 6, 8, 10, 12, 16]) {
    scenarios.push({
      id: `tube_ref_segment_repeat_${String(n).padStart(2, "0")}`,
      label: `Tube Ref Objective: segment-repeat straight x${n} (derived from reference segment)`,
      tubeReferenceRecipe: { kind: "segment_repeat", segments: n, includeEndpoints: true },
    });
  }

  scenarios.push(
    {
      id: "tube_ref_left_then_right",
      label: "Tube Ref Objective: LEFT then RIGHT turn pair (derived composite)",
      tubeReferenceRecipe: {
        kind: "composite",
        modules: [
          { templateId: "tube_ref_left_exact", dropFinish: true },
          { templateId: "tube_ref_right_exact", dropStart: true },
        ],
      },
    },
    {
      id: "tube_ref_right_then_left",
      label: "Tube Ref Objective: RIGHT then LEFT turn pair (derived composite)",
      tubeReferenceRecipe: {
        kind: "composite",
        modules: [
          { templateId: "tube_ref_right_exact", dropFinish: true },
          { templateId: "tube_ref_left_exact", dropStart: true },
        ],
      },
    },
    {
      id: "tube_ref_up_turn_double_climb",
      label: "Tube Ref Objective: UP turn repeated twice (stacked climb)",
      tubeReferenceRecipe: {
        kind: "composite",
        modules: [
          { templateId: "tube_ref_up_exact", dropFinish: true },
          { templateId: "tube_ref_up_exact", dx: 0, dy: 18, dz: 22, dropStart: true },
        ],
      },
    },
    {
      id: "tube_ref_module_gallery",
      label: "Tube Ref Objective: gallery of exact modules in one map (straight + left + right + up)",
      tubeReferenceRecipe: {
        kind: "composite",
        modules: [
          { templateId: "tube_ref_straight_exact" },
          { templateId: "tube_ref_left_exact", dx: 40 },
          { templateId: "tube_ref_right_exact", dx: 80 },
          { templateId: "tube_ref_up_exact", dx: 120 },
        ],
      },
    },
  );

  return scenarios;
}

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

export class TrackPart {
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

export class TrackData {
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

const tubeReferenceScenariosById = new Map(buildTubeReferenceScenarios().map((s) => [s.id, s]));

function requireTubeReferenceScenario(id) {
  const s = tubeReferenceScenariosById.get(id);
  if (!s) throw new Error(`Unknown tube reference scenario: ${id}`);
  return s;
}

// Curated active batch (max 4 at a time) for focused manual fix workflow.
export const manualMiniTrackScenarios = [
  requireTubeReferenceScenario("tube_ref_exact_straight"),
  {
    id: "tube_ref_left_then_right_offset_connector",
    label: "Tube Ref Objective: LEFT then RIGHT pair with offset connector (derived from fixed logic)",
    tubeReferenceRecipe: {
      kind: "composite",
      modules: [
        { templateId: "tube_ref_left_exact", dropFinish: true },
        // Bridge into the second turn footprint so modules do not fully overlap.
        { templateId: "tube_ref_segment_exact", dx: 20, dz: 12 },
        { templateId: "tube_ref_segment_exact", dx: 20, dz: 16 },
        { templateId: "tube_ref_right_exact", dx: 20, dz: 16, dropStart: true },
      ],
    },
  },
  {
    id: "obj_wallride_left_hold_oriented",
    label: "Objective: sustain LEFT wall ride for 14 segments (orientation-corrected from prior RIGHT test)",
    steps: [{ kind: "pieceRun", blockType: "WallRideLeft", n: 14 }],
  },
  {
    id: "obj_wallride_left_to_right_mirror",
    label: "Objective: mirror wall ride behavior (LEFT hold then RIGHT hold transition)",
    steps: [
      { kind: "pieceRun", blockType: "WallRideLeft", n: 7 },
      { kind: "turn", dir: "R", variant: "sharp" },
      { kind: "pieceRun", blockType: "WallRideRight", n: 7 },
      { kind: "straight", n: 4 },
    ],
  },
];

function getScenario(id) {
  const s = manualMiniTrackScenarios.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown manual scenario: ${id}`);
  return s;
}

export function generateManualMiniTrack(params = {}) {
  const {
    scenarioId = "tube_ref_exact_straight",
    name = "Manual Mini Track",
    environment = "Summer",
    format = "polytrack1",
  } = params;

  const env = Environment[environment] ?? Environment.Summer;
  const trackData = new TrackData(env, 28);
  const placedSequence = [];
  const anchorTrace = [];

  const scenario = getScenario(scenarioId);

  if (scenario.tubeReferenceRecipe) {
    const recipe = scenario.tubeReferenceRecipe;
    const parts = buildPartsFromTubeReferenceRecipe(scenario.tubeReferenceRecipe);
    for (const p of parts) {
      trackData.addPart(
        p.x,
        p.y,
        p.z,
        p.blockType,
        p.rotation,
        p.rotAxis ?? RotationAxis.YPositive,
        p.color ?? ColorStyle.Default,
        p.checkpointOrder ?? null,
        p.startOrder ?? null,
      );
      placedSequence.push({
        x: p.x,
        y: p.y,
        z: p.z,
        blockType: p.blockType,
        rotation: p.rotation,
      });
    }

    const exactTemplate = recipe.kind === "exact" ? getRefTemplate(recipe.templateId) : null;
    const shareCode = exactTemplate
      ? exactTemplate.code
      : (
        format === "v3"
          ? encodeV3ShareCode(name, trackData)
          : encodePolyTrack1ShareCode(name, trackData, "")
      );
    return {
      shareCode,
      trackData,
      name,
      seed: null,
      placedSequence,
      anchorTrace,
      manualScenarioId: scenarioId,
      manualScenarioLabel: scenario.label,
    };
  }

  let x = 0, y = 0, z = 0;
  let heading = 0; // 0=N, 1=W, 2=S, 3=E (matches HEADING_DELTA)
  let checkpointIdx = 0;

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

  const resolveBlockType = (spec) => {
    if (Number.isFinite(spec)) return spec | 0;
    if (typeof spec === "string" && Object.prototype.hasOwnProperty.call(BlockType, spec)) {
      return BlockType[spec];
    }
    throw new Error(`Unknown block type: ${String(spec)}`);
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
      const n = Number.isFinite(step.n) ? Math.max(1, Math.floor(step.n)) : 1;
      for (let i = 0; i < n; i++) {
        const b = { x, y, z, heading };
        add(BlockType.Straight, heading);
        move(heading, 1);
        assertGrid();
        anchorTrace.push({ label: "Straight", ...b, rotation: heading, after: { x, y, z, heading } });
      }
      continue;
    }

    if (step.kind === "pieceRun") {
      const n = Number.isFinite(step.n) ? Math.max(1, Math.floor(step.n)) : 1;
      const blockType = resolveBlockType(step.blockType);
      const moveTiles = Number.isFinite(step.moveTiles) ? Math.max(0, Math.floor(step.moveTiles)) : 1;
      const dyPerPiece = Number.isFinite(step.dyPerPiece) ? (step.dyPerPiece | 0) : 0;
      const rotationOffset = Number.isFinite(step.rotationOffset) ? (step.rotationOffset | 0) : 0;
      for (let i = 0; i < n; i++) {
        if (y + dyPerPiece < 0) throw new Error(`pieceRun would go below ground for ${BlockTypeName[blockType] || blockType}`);
        const b = { x, y, z, heading };
        const rotation = (heading + rotationOffset + 16) % 4;
        add(blockType, rotation);
        if (moveTiles > 0) move(heading, moveTiles);
        y += dyPerPiece;
        assertGrid();
        anchorTrace.push({
          label: `pieceRun ${BlockTypeName[blockType] || blockType}`,
          ...b,
          rotation,
          after: { x, y, z, heading },
        });
      }
      continue;
    }

    if (step.kind === "checkpoint") {
      const order = Number.isFinite(step.order) ? (step.order | 0) : checkpointIdx;
      checkpointIdx = Math.max(checkpointIdx, order + 1);
      add(BlockType.Checkpoint, heading, order);
      move(heading, 1);
      assertGrid();
      anchorTrace.push({ label: `Checkpoint#${order}`, ...before, rotation: heading, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "gap") {
      const tiles = Number.isFinite(step.tiles) ? Math.max(1, Math.floor(step.tiles)) : 1;
      move(heading, tiles);
      assertGrid();
      anchorTrace.push({ label: `GAP×${tiles}`, ...before, rotation: heading, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "up") {
      const tiles = step.long ? 2 : 1;
      // PolyTrack14 semantics (calibrated via in-game fixes): Long slopes span 2 tiles and change height by 2.
      const dy = Number.isFinite(step.dy) ? step.dy : (step.long ? 2 : 1);
      add(step.long ? BlockType.SlopeUpLong : BlockType.SlopeUp, heading);
      move(heading, tiles);
      y += dy;
      assertGrid();
      anchorTrace.push({ label: step.long ? "SlopeUpLong" : "SlopeUp", ...before, rotation: heading, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "altUp") {
      // Smooth-seam variant for a +1 ramp segment: use SlopeDown with rotation flipped.
      add(BlockType.SlopeDown, (heading + 2) % 4);
      move(heading, 1);
      y += 1;
      assertGrid();
      anchorTrace.push({ label: "AltUp(SlopeDown rot+2)", ...before, rotation: (before.heading + 2) % 4, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "altUpLong") {
      // Alternative smooth +2 ramp used in some fixed tracks: place SlopeDownLong with rotation flipped.
      add(BlockType.SlopeDownLong, (heading + 2) % 4);
      move(heading, 2);
      y += 2;
      assertGrid();
      anchorTrace.push({ label: "AltUpLong(SlopeDownLong rot+2)", ...before, rotation: (before.heading + 2) % 4, after: { x, y, z, heading } });
      continue;
    }

    if (step.kind === "down") {
      const tiles = step.long ? 2 : 1;
      // PolyTrack14 semantics (calibrated via in-game fixes): Long slopes span 2 tiles and change height by 2.
      const dy = Number.isFinite(step.dy) ? step.dy : (step.long ? 2 : 1);

      const entranceX = before.x, entranceY = before.y, entranceZ = before.z;
      // Empirical: SlopeDownLong is stored 1 tile forward (in XZ) from the entrance.
      const anchorX = entranceX + (step.long ? HEADING_DELTA[before.heading].dx : 0);
      const anchorY = entranceY - dy; // slope-down pieces store at the lower (exit) height
      const anchorZ = entranceZ + (step.long ? HEADING_DELTA[before.heading].dz : 0);
      const storedRotation = before.heading; // store travel direction

      addAt(anchorX, anchorY, anchorZ, step.long ? BlockType.SlopeDownLong : BlockType.SlopeDown, storedRotation);

      // Cursor advances from the entrance; height decreases by dy.
      x = entranceX; y = entranceY; z = entranceZ;
      move(heading, tiles);
      y -= dy;
      assertGrid();
      anchorTrace.push({
        label: `${step.long ? "SlopeDownLong" : "SlopeDown"} storedAtLowerY`,
        ...before,
        rotation: storedRotation,
        anchor: { x: anchorX, y: anchorY, z: anchorZ },
        after: { x, y, z, heading },
      });
      continue;
    }

    if (step.kind === "altDown") {
      // Smooth-seam variant for a -1 ramp segment: use SlopeUp with rotation flipped, stored at the lower Y.
      const entranceX = before.x, entranceY = before.y, entranceZ = before.z;
      if (entranceY < 1) throw new Error("altDown would go below ground");
      const anchorX = entranceX;
      const anchorY = entranceY - 1;
      const anchorZ = entranceZ;
      const storedRotation = (before.heading + 2) % 4;

      addAt(anchorX, anchorY, anchorZ, BlockType.SlopeUp, storedRotation);

      // Cursor advances from the entrance; height decreases by 1.
      x = entranceX; y = entranceY; z = entranceZ;
      move(heading, 1);
      y -= 1;
      assertGrid();
      anchorTrace.push({
        label: "AltDown(SlopeUp rot+2) storedAtLowerY",
        ...before,
        rotation: storedRotation,
        anchor: { x: anchorX, y: anchorY, z: anchorZ },
        after: { x, y, z, heading },
      });
      continue;
    }

    if (step.kind === "altDownLong") {
      // Smooth-seam variant for a -2 ramp segment: use SlopeUpLong with rotation flipped, stored like a downLong.
      const entranceX = before.x, entranceY = before.y, entranceZ = before.z;
      if (entranceY < 2) throw new Error("altDownLong would go below ground");
      const anchorX = entranceX + HEADING_DELTA[before.heading].dx;
      const anchorY = entranceY - 2;
      const anchorZ = entranceZ + HEADING_DELTA[before.heading].dz;
      const storedRotation = (before.heading + 2) % 4;

      addAt(anchorX, anchorY, anchorZ, BlockType.SlopeUpLong, storedRotation);

      // Cursor advances from the entrance; height decreases by 2.
      x = entranceX; y = entranceY; z = entranceZ;
      move(heading, 2);
      y -= 2;
      assertGrid();
      anchorTrace.push({
        label: "AltDownLong(SlopeUpLong rot+2) storedAtLowerY+1tile",
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
      // Slope-down variants store at the lower (exit) height.
      addAt(before.x, before.y - dy, before.z, BlockType.Slope, before.heading);
      move(heading, 1);
      y -= dy;
      assertGrid();
      anchorTrace.push({ label: "Slope(steep down)", ...before, rotation: before.heading, after: { x, y, z, heading } });
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

      // Empirical (via in-game fixes): TurnShort(R) is also stored at the opposite corner of its 2x2 footprint.
      if (isShort && turnRight) {
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
    jumpChance = 0.15,
    format = "polytrack1",
  } = params;

  const rng = createRNG(seed);
  const env = Environment[environment] ?? Environment.Summer;

  const elevationProb = Math.max(0, Math.min(0.8, elevation * 0.08));
  const turnProb = Math.max(0, Math.min(0.8, curviness * 0.09));
  const intersectionProb = Math.max(0, Math.min(1, intersectionChance));
  const jumpProb = Math.max(0, Math.min(1, jumpChance));
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
    // Jumps (handled as compound actions)
    ["jump"],
  ];
  const actionQueue = [];

  // ---- Piece placement functions ----

  // Slope smoothing: alternate ramp mesh variants within a continuous climb/descent.
  // Empirically, alternating Up/Down variants (with rotation flipped) produces smoother seams.
  let slopeChainDir = null; // "up" | "down" | null
  let slopeChainIndex = -1;
  const resetSlopeChain = () => { slopeChainDir = null; slopeChainIndex = -1; };
  const nextSlopeAlt = (dir) => slopeChainDir === dir && (((slopeChainIndex + 1) % 2) === 1);
  const commitSlope = (dir) => {
    if (slopeChainDir === dir) slopeChainIndex++;
    else { slopeChainDir = dir; slopeChainIndex = 0; }
  };

  const exitFreeOrIntersect = (ex, ey, ez, h, allowIntersectionEntry) =>
    isFree(ex, ey, ez) || (allowIntersectionEntry && canExitIntoIntersection(ex, ey, ez, h));

  const placeStraightLike = (blockType, cpOrder) => {
    const fp = flatFootprint;
    const exit = nextPos(x, y, z, heading, 1);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, exit.y, exit.z, heading, true)) return false;
    placePiece(blockType, heading, cpOrder ?? null, null, fp);
    x = exit.x; y = exit.y; z = exit.z;
    resetSlopeChain();
    return true;
  };

  const placeSlopeUp = (longVariant) => {
    const footprintTiles = longVariant ? 2 : 1;
    // PolyTrack14 semantics (calibrated via in-game fixes): Long slopes span 2 tiles and change height by 2.
    const dy = longVariant ? 2 : 1;
    const nextY = y + dy;
    if (nextY > maxHeightY) return false;
    // Over-approx vertical span for collision: occupies [0..dy] across its footprint.
    const fp = forwardFootprint(heading, footprintTiles, 0, dy);
    const exitTiles = footprintTiles; // advance enough to clear the footprint
    const exit = nextPos(x, y, z, heading, exitTiles);
    if (!canFootprint(x, y, z, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    const alt = nextSlopeAlt("up");
    const blockType = longVariant
      ? (alt ? BlockType.SlopeDownLong : BlockType.SlopeUpLong)
      : (alt ? BlockType.SlopeDown : BlockType.SlopeUp);
    const storedRotation = alt ? ((heading + 2) % 4) : heading;
    placePiece(blockType, storedRotation, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    commitSlope("up");
    return true;
  };

  const placeSlopeDown = (longVariant) => {
    const footprintTiles = longVariant ? 2 : 1;
    // PolyTrack14 semantics (calibrated via in-game fixes): Long slopes span 2 tiles and change height by 2.
    const dy = longVariant ? 2 : 1;
    if (y < dy) return false;
    const nextY = y - dy;
    const alt = nextSlopeAlt("down");
    // Empirical: slope-down blocks store their Y at the lower (exit) height.
    // (x,z) reference:
    // - SlopeDown: entrance cell
    // - SlopeDownLong: 1 tile forward from the entrance
    // Reserve vertical span [0..dy] from the stored Y.
    const anchorX = x + (longVariant ? HEADING_DELTA[heading].dx : 0);
    const anchorY = nextY;
    const anchorZ = z + (longVariant ? HEADING_DELTA[heading].dz : 0);
    const storedRotation = alt ? ((heading + 2) % 4) : heading; // store travel direction (or alt seam variant)
    // Over-approx vertical span for collision: occupies [0..dy] across its forward footprint.
    const fp = forwardFootprint(heading, footprintTiles, 0, dy);
    const exit = nextPos(x, nextY, z, heading, footprintTiles);
    if (!canFootprint(anchorX, anchorY, anchorZ, fp)) return false;
    if (!exitFreeOrIntersect(exit.x, nextY, exit.z, heading, false)) return false;
    const blockType = longVariant
      ? (alt ? BlockType.SlopeUpLong : BlockType.SlopeDownLong)
      : (alt ? BlockType.SlopeUp : BlockType.SlopeDown);
    placePieceAt(anchorX, anchorY, anchorZ, blockType, storedRotation, null, null, fp);
    x = exit.x; y = nextY; z = exit.z;
    commitSlope("down");
    return true;
  };

  const placeSlopeSteep = () => {
    // Avoid the diagonal ramp piece (BlockType.Slope). Treat "+2Y steep" as a long smooth ramp.
    // This matches the in-game "smooth" ramp behavior used in your fixed ramp tracks.
    if (!allowSteepSlopes) return false;
    return placeSlopeUp(true);
  };

  const placeSteepDown = () => {
    // Avoid the diagonal ramp piece (BlockType.Slope). Treat "-2Y steep" as a long smooth ramp.
    if (!allowSteepSlopes) return false;
    return placeSlopeDown(true);
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

	    // Empirical: TurnShort(R) is also stored at the opposite corner of its 2x2 footprint.
	    if (isShort && turnRight) {
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
    resetSlopeChain();
    return true;
  };

  // ---- Proactive intersection placement ----
  // Scan perpendicular directions for existing Straight pieces to route through.
  const tryIntersectionDetour = () => {
    if (!allowIntersections) return 0;
    // Only attempt occasionally
    if (rng() >= intersectionProb * 2) return 0;

    // Look left and right (perpendicular to current heading)
    const leftH = (heading + 1) % 4;
    const rightH = (heading + 3) % 4;

    for (const sideH of rng() < 0.5 ? [leftH, rightH] : [rightH, leftH]) {
      // Scan 1-4 tiles to the side for a perpendicular Straight
      for (let dist = 1; dist <= 4; dist++) {
        const scanX = x + HEADING_DELTA[sideH].dx * dist;
        const scanZ = z + HEADING_DELTA[sideH].dz * dist;
        const existing = placedByCell.get(anchorKey(scanX, y, scanZ));
        if (!existing) continue;
        if (existing.blockType !== BlockType.Straight && existing.blockType !== BlockType.IntersectionCross) continue;
        // Must be perpendicular (the existing piece runs along our forward axis)
        if (existing.blockType === BlockType.Straight && axisForHeading(existing.rotation) === axisForHeading(sideH)) continue;

        // Found a perpendicular target! Try to route: turn toward it, straights, cross through, turn back.
        const turnRight1 = sideH === rightH;
        const turnBack = !turnRight1;

        // Step 1: Turn toward the target
        if (!placeTurn90(turnRight1, "sharp")) return 0;
        let placed = 1;

        // Step 2: Place straights to reach the intersection (dist-1 straights needed since turn moves 1 tile)
        let reachedTarget = false;
        for (let s = 0; s < dist - 1; s++) {
          if (!placeStraightLike(BlockType.Straight, null)) {
            // Can't reach - abort (pieces already placed are kept, just stop the detour)
            return placed;
          }
          placed++;
        }

        // Step 3: We should now be at or adjacent to the target cell
        // Check if current position overlaps the target (means we crossed it)
        if (x === scanX && z === scanZ && y === existing.y) {
          // We're on the intersection cell - ensureIntersectionCross already handled by escape logic
          reachedTarget = true;
        } else {
          // Try to place a straight that crosses through (the exit will land on the target)
          const nextExit = nextPos(x, y, z, heading, 1);
          if (nextExit.x === scanX && nextExit.z === scanZ) {
            // Next cell is the target - convert it to intersection
            if (ensureIntersectionCrossAtCell(scanX, y, scanZ, heading)) {
              // Place straight here, exit will advance through the intersection
              if (canFootprint(x, y, z, flatFootprint)) {
                placePiece(BlockType.Straight, heading, null, null, flatFootprint);
                x = nextExit.x; y = nextExit.y; z = nextExit.z;
                resetSlopeChain();
                placed++;
                reachedTarget = true;
              }
            }
          }
        }

        if (!reachedTarget) return placed;

        // Step 4: Continue through intersection (place a straight on the other side)
        const throughExit = nextPos(x, y, z, heading, 1);
        if (isFree(throughExit.x, throughExit.y, throughExit.z)) {
          if (canFootprint(x, y, z, flatFootprint)) {
            placePiece(BlockType.Straight, heading, null, null, flatFootprint);
            x = throughExit.x; y = throughExit.y; z = throughExit.z;
            resetSlopeChain();
            placed++;
          }
        }

        // Step 5: Turn back to original heading
        if (placeTurn90(turnBack, "sharp")) {
          placed++;
        }

        return placed;
      }
    }
    return 0;
  };

  // ---- Jump placement ----
  // Jump sequence: runup straights → SlopeUpLong (takeoff) → gap → SlopeDown + AltDown (landing)
  // Gap calibrated via sqrt model from 8 in-game data points (sub-tile world-unit precision):
  //   gap_wu = round(13.81 * sqrt(totalFlat) - 2.51)
  // where totalFlat = effective flat tiles of acceleration (including Start).
  const estimatePreSpeed = () => {
    // Walk backward through placed pieces to estimate equivalent flat tiles of speed.
    let effectiveTiles = 0;
    for (let j = placedSequence.length - 1; j >= 0; j--) {
      const bt = placedSequence[j].blockType;
      if (bt === BlockType.Straight || bt === BlockType.Checkpoint) {
        effectiveTiles++;
      } else if (bt === BlockType.SlopeDown || bt === BlockType.SlopeDownLong) {
        effectiveTiles += 2; // downhill boosts speed
      } else if (bt === BlockType.SlopeUp || bt === BlockType.SlopeUpLong) {
        effectiveTiles = Math.max(0, effectiveTiles - 2);
        break;
      } else if (bt === BlockType.TurnSharp || bt === BlockType.TurnShort || bt === BlockType.TurnLong3) {
        effectiveTiles = Math.max(effectiveTiles, 3); // turns retain some speed
        break;
      } else if (bt === BlockType.Start) {
        effectiveTiles++; // Start counts as a flat tile
        break;
      } else {
        break;
      }
    }
    return effectiveTiles;
  };

  // Unit direction vector for heading (±1 per world unit, not per tile)
  const headingSign = (h) => ({
    dx: HEADING_DELTA[h].dx / TILE,
    dz: HEADING_DELTA[h].dz / TILE,
  });

  const placeJump = () => {
    const runup = 3 + Math.floor(rng() * 4); // 3-6 straight tiles (own runup)
    const preSpeed = estimatePreSpeed();
    const totalFlat = preSpeed + runup;
    if (totalFlat < 4) return 0; // not enough speed for any jump
    // Sqrt gap model: gap in world units, sub-tile precision
    const gapWU = Math.max(16, Math.round(13.81 * Math.sqrt(totalFlat) - 2.51));
    const gapCells = Math.ceil(gapWU / TILE); // grid cells to reserve for flight corridor
    const baseY = y;
    const flightY = baseY + 2;
    if (flightY > maxHeightY) return 0;

    const hs = headingSign(heading);

    // Pre-check all positions along the jump path
    let cx = x, cz = z;

    // 1. Runup straights (grid-aligned)
    for (let i = 0; i < runup; i++) {
      if (!canReserveAt(cx, cz, baseY, baseY)) return 0;
      cx += HEADING_DELTA[heading].dx;
      cz += HEADING_DELTA[heading].dz;
    }

    // 2. SlopeUpLong takeoff (2 tiles, occupies baseY to flightY)
    for (let t = 0; t < 2; t++) {
      const tx = cx + HEADING_DELTA[heading].dx * t;
      const tz = cz + HEADING_DELTA[heading].dz * t;
      if (!canReserveAt(tx, tz, baseY, flightY)) return 0;
    }
    const rampExitX = cx + HEADING_DELTA[heading].dx * 2;
    const rampExitZ = cz + HEADING_DELTA[heading].dz * 2;
    cx = rampExitX;
    cz = rampExitZ;

    // 3. Gap corridor (grid-aligned cells covering the flight path)
    for (let i = 0; i < gapCells; i++) {
      if (!canReserveAt(cx, cz, baseY + 1, flightY)) return 0;
      cx += HEADING_DELTA[heading].dx;
      cz += HEADING_DELTA[heading].dz;
    }

    // 4. SlopeDown landing at exact world-unit position
    const landX = rampExitX + hs.dx * gapWU;
    const landZ = rampExitZ + hs.dz * gapWU;
    if (!canReserveAt(landX, landZ, baseY + 1, flightY)) return 0;

    // 5. AltDown (1 tile after landing)
    const altX = landX + HEADING_DELTA[heading].dx;
    const altZ = landZ + HEADING_DELTA[heading].dz;
    if (!canReserveAt(altX, altZ, baseY, baseY + 1)) return 0;

    // 6. Exit cell must be free
    const exitX = altX + HEADING_DELTA[heading].dx;
    const exitZ = altZ + HEADING_DELTA[heading].dz;
    if (!isFree(exitX, baseY, exitZ)) return 0;

    // --- All clear, place the jump ---

    // Runup straights
    for (let i = 0; i < runup; i++) {
      placePiece(BlockType.Straight, heading, null, null, flatFootprint);
      x += HEADING_DELTA[heading].dx;
      z += HEADING_DELTA[heading].dz;
    }

    // SlopeUpLong takeoff
    const rampFp = forwardFootprint(heading, 2, 0, 2);
    placePiece(BlockType.SlopeUpLong, heading, null, null, rampFp);
    x += HEADING_DELTA[heading].dx * 2;
    z += HEADING_DELTA[heading].dz * 2;
    y = flightY;

    // Gap: reserve flight corridor at grid-aligned cells
    for (let i = 0; i < gapCells; i++) {
      reserveAt(x + HEADING_DELTA[heading].dx * i, z + HEADING_DELTA[heading].dz * i, baseY + 1, flightY, null);
    }

    // SlopeDown landing at exact world-unit position
    const downFp = [{ dx: 0, dz: 0, yMin: 0, yMax: 1 }];
    placePieceAt(landX, flightY - 1, landZ, BlockType.SlopeDown, heading, null, null, downFp);

    // AltDown: SlopeUp with rotation+2, stored at lower Y
    const altDownFp = [{ dx: 0, dz: 0, yMin: 0, yMax: 1 }];
    placePieceAt(altX, baseY, altZ, BlockType.SlopeUp, (heading + 2) % 4, null, null, altDownFp);

    // Cursor ends 1 tile after AltDown at ground level
    x = exitX;
    z = exitZ;
    y = baseY;

    resetSlopeChain();
    // Return number of placed pieces: runup + SlopeUpLong(1) + SlopeDown(1) + AltDown(1) = runup + 3
    return runup + 3;
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
          else if (a === "up") ok = placeSlopeUp(allowSteepSlopes && rng() < 0.3);
          else if (a === "upLong") ok = allowSteepSlopes && placeSlopeUp(true);
          else if (a === "down") ok = placeSlopeDown(allowSteepSlopes && rng() < 0.3);
          else if (a === "downLong") ok = allowSteepSlopes && placeSlopeDown(true);
          else if (a === "steepUp") ok = allowSteepSlopes && placeSlopeSteep();
          else if (a === "jump") {
            const jumpPieces = placeJump();
            if (jumpPieces > 0) {
              actionQueue.shift();
              placed = true;
              piecesPlaced += jumpPieces;
              i += jumpPieces - 1;
              consecutiveStraight = 0;
              justPlacedPiece = true;
              continue;
            }
          }
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
          placed = placeSlopeDown(allowSteepSlopes && rng() < 0.3);
          if (!placed && allowSteepSlopes && y >= 2) placed = placeSteepDown();
        } else if (allowSteepSlopes && r < descentBias + 0.15) {
          placed = placeSlopeSteep();
        } else {
          placed = placeSlopeUp(allowSteepSlopes && rng() < 0.3);
        }
        if (placed) { piecesPlaced++; consecutiveStraight = 0; continue; }
      }

      // Jumps - only when flat, enough track budget remaining, and not descending
      if (!placed && jumpProb > 0 && !shouldDescend && slopeChainDir === null) {
        const piecesLeft = trackLength - i;
        if (piecesLeft > 18 && y + 2 <= maxHeightY && piecesPlaced > 3 && rng() < jumpProb) {
          const jumpPieces = placeJump();
          if (jumpPieces > 0) {
            placed = true;
            piecesPlaced += jumpPieces;
            i += jumpPieces - 1;
            consecutiveStraight = 0;
            justPlacedPiece = true;
            continue;
          }
        }
      }

      // Intersections - proactive detour toward existing perpendicular track
      if (!placed && allowIntersections && !shouldDescend && slopeChainDir === null) {
        const piecesLeft = trackLength - i;
        if (piecesLeft > 10 && piecesPlaced > 8) {
          const detourPieces = tryIntersectionDetour();
          if (detourPieces > 0) {
            placed = true;
            piecesPlaced += detourPieces;
            i += detourPieces - 1;
            consecutiveStraight = 0;
            justPlacedPiece = true;
            continue;
          }
        }
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
      if (placeSteepDown()) continue;
    }
    if (y >= 1) {
      if (placeSlopeDown(false)) continue;
    }
    // Try turning to find a descent path (must place a turn piece; never change heading "for free").
    const preferRight = rng() < 0.5;
    const turnDirs = preferRight ? [true, false] : [false, true];
    let turned = false;
    for (const turnRight of turnDirs) {
      if (placeTurn90(turnRight, "sharp")) { turned = true; break; }
    }
    if (turned) continue;
    break;
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
  // Structured decorations: trees, buildings, and roadside barriers.
  // Color values are byte indices into the game's palette (user-tested in-game).
  if (includeScenery) {
    const SCENERY_COLORS = {
      trunk: 8,    // brown-ish (to be verified in-game)
      leaves: 3,   // green-ish
      stone: 1,    // gray
      brick: 6,    // red/brown
      roof: 2,     // darker
      barrier: 5,  // yellow/orange
    };

    const roadPositions = [];
    for (const [t, parts] of trackData.parts) {
      if (
        t === BlockType.Block || t === BlockType.HalfBlock || t === BlockType.QuarterBlock ||
        t === BlockType.PillarTop || t === BlockType.Pillar || t === BlockType.PillarBase
      ) continue;
      for (const p of parts) roadPositions.push({ x: p.x, y: p.y, z: p.z });
    }

    const addScenery = (sx, sy, sz, blockType, color) => {
      if (!canReserveAt(sx, sz, sy, sy)) return false;
      const rot = Math.floor(rng() * 4);
      trackData.addPart(sx, sy, sz, blockType, rot, RotationAxis.YPositive, color, null, null);
      reserveAt(sx, sz, sy, sy, blockType);
      return true;
    };

    const placeTree = (bx, by, bz) => {
      // Trunk: 1-2 Block pieces stacked
      const trunkHeight = 1 + Math.floor(rng() * 2);
      for (let ty = 0; ty < trunkHeight; ty++) {
        if (!addScenery(bx, by + ty, bz, BlockType.Block, SCENERY_COLORS.trunk)) return;
      }
      // Canopy: 1-2 HalfBlock or QuarterBlock on top
      const canopyTop = by + trunkHeight;
      addScenery(bx, canopyTop, bz, BlockType.Block, SCENERY_COLORS.leaves);
      // Side leaves (randomly 1-2 directions)
      const dirs = [{ dx: TILE, dz: 0 }, { dx: -TILE, dz: 0 }, { dx: 0, dz: TILE }, { dx: 0, dz: -TILE }];
      for (const d of dirs) {
        if (rng() < 0.5) {
          const leafType = rng() < 0.5 ? BlockType.HalfBlock : BlockType.QuarterBlock;
          addScenery(bx + d.dx, canopyTop, bz + d.dz, leafType, SCENERY_COLORS.leaves);
        }
      }
    };

    const placeBuilding = (bx, by, bz) => {
      const height = 2 + Math.floor(rng() * 3); // 2-4 stories
      const wallColor = rng() < 0.5 ? SCENERY_COLORS.stone : SCENERY_COLORS.brick;
      for (let ty = 0; ty < height; ty++) {
        if (!addScenery(bx, by + ty, bz, BlockType.Block, wallColor)) return;
      }
      // Roof
      addScenery(bx, by + height, bz, BlockType.HalfBlock, SCENERY_COLORS.roof);
    };

    const placeBarrier = (bx, by, bz) => {
      addScenery(bx, by, bz, BlockType.QuarterBlock, SCENERY_COLORS.barrier);
    };

    // Offsets: 2 tiles away from track on each side
    const sideOffsets = [
      { dx: TILE * 2, dz: 0 }, { dx: -TILE * 2, dz: 0 },
      { dx: 0, dz: TILE * 2 }, { dx: 0, dz: -TILE * 2 },
    ];

    for (const pos of roadPositions) {
      if (pos.y > 0) continue; // Only place scenery at ground level

      for (const off of sideOffsets) {
        const sx = pos.x + off.dx;
        const sz = pos.z + off.dz;
        if (!canReserveAt(sx, sz, pos.y, pos.y)) continue;

        const r = rng();
        if (r < 0.04) {
          // Tree (~4% chance per side)
          placeTree(sx, pos.y, sz);
        } else if (r < 0.06) {
          // Building (~2% chance per side)
          placeBuilding(sx, pos.y, sz);
        } else if (r < 0.10) {
          // Barrier (~4% chance per side, closer to track)
          const bx = pos.x + off.dx / 2; // 1 tile offset instead of 2
          const bz = pos.z + off.dz / 2;
          placeBarrier(bx, pos.y, bz);
        }
        // ~90% nothing - keeps it clean
      }
    }
  }

  const shareCode =
    format === "v3"
      ? encodeV3ShareCode(name, trackData)
      : encodePolyTrack1ShareCode(name, trackData, "");
  return { shareCode, trackData, name, seed, placedSequence };
}
