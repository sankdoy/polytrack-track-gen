import test from "node:test";
import assert from "node:assert/strict";

import { decodePolyTrack1 } from "./polytrack1/lib.mjs";
import { FIXED_CALIBRATION_TRACKS } from "./fixtures/fixed-calibration-tracks.mjs";
import {
  REFERENCE_PALETTE,
  pickBorderPieceForMask,
  checkpointBlockTypeForOrder,
} from "../docs/image-track-core.mjs";

const EXPECTED_IDS = new Set([
  REFERENCE_PALETTE.BORDER,
  REFERENCE_PALETTE.TURN_LEFT,
  REFERENCE_PALETTE.TURN_RIGHT,
  REFERENCE_PALETTE.ROAD,
  REFERENCE_PALETTE.CHECKPOINT_ALT,
  REFERENCE_PALETTE.FINISH_MARKER_ALT,
  REFERENCE_PALETTE.FINISH,
  REFERENCE_PALETTE.FINISH_MARKER,
  REFERENCE_PALETTE.START,
  REFERENCE_PALETTE.START_ALT,
]);

const BORDER_FAMILY = new Set([
  REFERENCE_PALETTE.BORDER,
  REFERENCE_PALETTE.TURN_LEFT,
  REFERENCE_PALETTE.TURN_RIGHT,
]);

const DIRS = [
  { n: "N", dx: 0, dz: -1 },
  { n: "E", dx: 1, dz: 0 },
  { n: "S", dx: 0, dz: 1 },
  { n: "W", dx: -1, dz: 0 },
];

function decodeTrackOrThrow(code) {
  const decoded = decodePolyTrack1(code);
  assert.ok(decoded, "decode returned null");
  assert.ok(!decoded.error, `decode failed: ${decoded?.error || "unknown"}`);
  return decoded;
}

function trackIds(decoded) {
  return Array.from(new Set(decoded.parts.map((p) => p.blockType))).sort((a, b) => a - b);
}

function contiguous(values) {
  if (!values.length) return true;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== i) return false;
  }
  return true;
}

function borderMaskStats(decoded) {
  const borderParts = decoded.parts
    .filter((p) => BORDER_FAMILY.has(p.blockType))
    .map((p) => ({
      id: p.blockType,
      rot: p.rotation,
      x: Math.round(p.x / 4),
      z: Math.round(p.z / 4),
    }));

  const pos = new Map(borderParts.map((p) => [`${p.x},${p.z}`, p]));
  const stats = new Map();

  for (const p of borderParts) {
    let mask = "";
    for (const d of DIRS) {
      if (pos.has(`${p.x + d.dx},${p.z + d.dz}`)) mask += d.n;
    }
    if (!mask) mask = "-";

    if (!stats.has(mask)) stats.set(mask, new Map());
    const bucket = stats.get(mask);
    const key = `${p.id}|${p.rot}`;
    bucket.set(key, (bucket.get(key) || 0) + 1);
  }

  return stats;
}

function trackBBox(decoded) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of decoded.parts) {
    const x = Math.round(p.x / 4);
    const z = Math.round(p.z / 4);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return { w: maxX - minX + 1, h: maxZ - minZ + 1 };
}

test("all fixed calibration tracks decode and stay within reference palette", () => {
  for (const t of FIXED_CALIBRATION_TRACKS) {
    const decoded = decodeTrackOrThrow(t.code);
    const ids = trackIds(decoded);

    for (const id of ids) {
      assert.ok(EXPECTED_IDS.has(id), `${t.id} has unexpected id ${id}`);
    }

    if (t.perimeterOnly) {
      for (const id of ids) {
        assert.ok(BORDER_FAMILY.has(id), `${t.id} perimeter-only case should only use edge ids`);
      }
      continue;
    }

    const starts = decoded.parts.filter((p) => p.blockType === REFERENCE_PALETTE.START || p.blockType === REFERENCE_PALETTE.START_ALT);
    const markers = decoded.parts.filter((p) => p.blockType === REFERENCE_PALETTE.FINISH_MARKER || p.blockType === REFERENCE_PALETTE.FINISH_MARKER_ALT);
    assert.equal(starts.length, 1, `${t.id} should have exactly one start`);
    assert.equal(markers.length, 1, `${t.id} should have exactly one marker`);

    const checkpoints = decoded.parts
      .filter((p) => p.blockType === REFERENCE_PALETTE.CHECKPOINT_ALT || p.blockType === REFERENCE_PALETTE.FINISH)
      .filter((p) => p.checkpointOrder != null)
      .sort((a, b) => a.checkpointOrder - b.checkpointOrder);

    assert.ok(checkpoints.length >= 1, `${t.id} should include at least one checkpoint piece`);

    const uniqOrders = Array.from(new Set(checkpoints.map((p) => p.checkpointOrder))).sort((a, b) => a - b);
    assert.ok(contiguous(uniqOrders), `${t.id} checkpoint orders must be contiguous from 0`);
  }
});

test("border mask selector matches calibration family behavior", () => {
  const aggregate = new Map();

  for (const t of FIXED_CALIBRATION_TRACKS) {
    const decoded = decodeTrackOrThrow(t.code);
    const stats = borderMaskStats(decoded);
    for (const [mask, bucket] of stats.entries()) {
      if (!aggregate.has(mask)) aggregate.set(mask, new Map());
      const out = aggregate.get(mask);
      for (const [k, c] of bucket.entries()) out.set(k, (out.get(k) || 0) + c);
    }
  }

  const requiredMasks = ["NE", "ES", "NW", "SW", "NES", "NEW", "NSW", "ESW", "NESW", "NS", "EW"];

  for (const mask of requiredMasks) {
    const picked = pickBorderPieceForMask(mask, 0);
    assert.ok(picked, `selector returned null for mask ${mask}`);

    if (["NE", "ES", "NW", "SW"].includes(mask)) {
      assert.equal(picked.blockType, REFERENCE_PALETTE.TURN_RIGHT, `mask ${mask} should map to corner piece`);
    } else if (mask === "NESW") {
      assert.equal(picked.blockType, REFERENCE_PALETTE.TURN_LEFT, "NESW should map to 4-way border piece");
    } else {
      assert.equal(picked.blockType, REFERENCE_PALETTE.BORDER, `mask ${mask} should map to straight/T border piece`);
    }

    if (mask === "NS") {
      assert.equal(picked.rotation % 2, 0, "NS should keep NS axis rotation");
    }
    if (mask === "EW") {
      assert.equal(picked.rotation % 2, 1, "EW should keep EW axis rotation");
    }

    const bucket = aggregate.get(mask);
    assert.ok(bucket && bucket.size > 0, `missing calibration bucket for mask ${mask}`);
  }
});

test("tiny edge-case mask -> piece/rotation mapping is stable", () => {
  const cases = [
    { mask: "ES", id: REFERENCE_PALETTE.TURN_RIGHT, rot: 0 },
    { mask: "NE", id: REFERENCE_PALETTE.TURN_RIGHT, rot: 1 },
    { mask: "NW", id: REFERENCE_PALETTE.TURN_RIGHT, rot: 2 },
    { mask: "SW", id: REFERENCE_PALETTE.TURN_RIGHT, rot: 3 },
    { mask: "NES", id: REFERENCE_PALETTE.BORDER, rot: 2 },
    { mask: "NEW", id: REFERENCE_PALETTE.BORDER, rot: 3 },
    { mask: "NSW", id: REFERENCE_PALETTE.BORDER, rot: 0 },
    { mask: "ESW", id: REFERENCE_PALETTE.BORDER, rot: 1 },
    { mask: "NESW", id: REFERENCE_PALETTE.TURN_LEFT, rot: 0 },
  ];

  for (const c of cases) {
    const got = pickBorderPieceForMask(c.mask, 0);
    assert.equal(got.blockType, c.id, `mask ${c.mask} block type mismatch`);
    assert.equal(got.rotation, c.rot, `mask ${c.mask} rotation mismatch`);
  }
});

test("context-aware corner mapping emits TURN_LEFT for concave borders", () => {
  const concaveRoad = new Map([
    ["-1,-1", { x: -1, y: -1, votes: {} }],
  ]);
  const concave = pickBorderPieceForMask("ES", 0, { x: 0, y: 0, roadMap: concaveRoad });
  assert.equal(concave.blockType, REFERENCE_PALETTE.TURN_LEFT);
  assert.equal(concave.rotation, 0);

  const convex = pickBorderPieceForMask("ES", 0, { x: 0, y: 0, roadMap: new Map() });
  assert.equal(convex.blockType, REFERENCE_PALETTE.TURN_RIGHT);
  assert.equal(convex.rotation, 0);
});

test("checkpoint piece selector follows calibrated pattern", () => {
  const three = [0, 1, 2].map((order) => checkpointBlockTypeForOrder(order, 3));
  assert.deepEqual(three, [77, 77, 77]);

  const four = [0, 1, 2, 3].map((order) => checkpointBlockTypeForOrder(order, 4));
  assert.deepEqual(four, [77, 77, 77, 77]);

  const five = [0, 1, 2, 3, 4].map((order) => checkpointBlockTypeForOrder(order, 5));
  assert.deepEqual(five, [75, 75, 77, 75, 77]);

  const six = [0, 1, 2, 3, 4, 5].map((order) => checkpointBlockTypeForOrder(order, 6));
  assert.deepEqual(six, [75, 75, 77, 75, 77, 75]);
});

test("fixed perimeter-only circle keeps 44-cell 12x12 edge loop with all edge piece families", () => {
  const item = FIXED_CALIBRATION_TRACKS.find((t) => t.id === "fixed_circle_44_edge_only");
  assert.ok(item, "missing fixed_circle_44_edge_only calibration");

  const decoded = decodeTrackOrThrow(item.code);
  assert.equal(decoded.parts.length, 44, "perimeter-only circle should have 44 pieces");

  const counts = {};
  for (const p of decoded.parts) {
    counts[p.blockType] = (counts[p.blockType] || 0) + 1;
  }
  assert.deepEqual(counts, { 10: 16, 11: 12, 12: 16 }, "edge family distribution should match fixed calibration");

  const bbox = trackBBox(decoded);
  assert.deepEqual(bbox, { w: 12, h: 12 }, "fixed circle bbox should be 12x12");
});
