import test from "node:test";
import assert from "node:assert/strict";

import { REFERENCE_PALETTE } from "../docs/image-track-core.mjs";
import { SMALL_SEGMENT_CASES } from "./fixtures/small-segment-cases.mjs";
import { buildSmallSegmentCase } from "./small-segment-lib.mjs";

const ALLOWED_IDS = new Set([
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

function normalizeCountObject(obj) {
  const out = {};
  const keys = Object.keys(obj)
    .map((k) => Number(k))
    .sort((a, b) => a - b);

  for (const k of keys) out[k] = obj[k];
  return out;
}

test("small segment fixtures generate stable shapes and share codes", () => {
  for (const def of SMALL_SEGMENT_CASES) {
    const built = buildSmallSegmentCase(def);
    const expected = def.expected;

    if (expected.parts != null) assert.equal(built.parts, expected.parts, `${def.id} parts mismatch`);
    if (expected.centerline != null) assert.equal(built.centerline, expected.centerline, `${def.id} centerline mismatch`);
    if (expected.road != null) assert.equal(built.road, expected.road, `${def.id} road footprint mismatch`);
    if (expected.border != null) assert.equal(built.border, expected.border, `${def.id} border footprint mismatch`);
    if (expected.startType != null) assert.equal(built.startType, expected.startType, `${def.id} start type mismatch`);
    if (expected.bbox != null) assert.deepEqual(built.bbox, expected.bbox, `${def.id} bbox mismatch`);

    if (expected.counts != null) {
      const gotCounts = normalizeCountObject(built.counts);
      const expectedCounts = normalizeCountObject(expected.counts);
      assert.deepEqual(gotCounts, expectedCounts, `${def.id} piece count mismatch`);
    }

    if (expected.shareCode) assert.equal(built.shareCode, expected.shareCode, `${def.id} share code changed`);

    for (const p of built.decoded.parts) {
      assert.ok(ALLOWED_IDS.has(p.blockType), `${def.id} contains disallowed block id ${p.blockType}`);
    }
  }
});
