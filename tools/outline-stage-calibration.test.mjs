import test from "node:test";
import assert from "node:assert/strict";

import { buildInnerBorderFromRoad } from "../docs/image-track-core.mjs";
import { STAGED_CIRCLE_CALIBRATION } from "./fixtures/staged-circle-calibration.mjs";
import { decodePolyTrack1 } from "./polytrack1/lib.mjs";

function decodeOrThrow(code, label) {
  const decoded = decodePolyTrack1(code);
  assert.ok(decoded && !decoded.error && Array.isArray(decoded.parts), `${label} decode failed: ${decoded?.error || "invalid"}`);
  return decoded;
}

function partsCoordSet(parts) {
  return new Set(parts.map((p) => `${Math.round(p.x / 4)},${Math.round(p.z / 4)}`));
}

function roadMapFromDecoded(decoded) {
  const map = new Map();
  for (const p of decoded.parts) {
    if (p.blockType !== 25) continue;
    const x = Math.round(p.x / 4);
    const y = Math.round(p.z / 4);
    map.set(`${x},${y}`, { x, y, votes: {} });
  }
  return map;
}

test("staged circle calibration: inner border is hole border + orthogonal bridges", () => {
  const orthogonal = decodeOrThrow(STAGED_CIRCLE_CALIBRATION.orthogonalInsideCode, "orthogonalInsideCode");
  const withInnerBorder = decodeOrThrow(STAGED_CIRCLE_CALIBRATION.insideBorderCode, "insideBorderCode");

  const roadMap = roadMapFromDecoded(orthogonal);
  const predictedBase = buildInnerBorderFromRoad(roadMap, { orthogonalBridges: false });
  const predictedExpanded = buildInnerBorderFromRoad(roadMap, { orthogonalBridges: true });

  const stage2Coords = partsCoordSet(orthogonal.parts);
  const stage3Coords = partsCoordSet(withInnerBorder.parts);
  const diff = new Set([...stage3Coords].filter((k) => !stage2Coords.has(k)));
  const predictedCoords = new Set(predictedExpanded.keys());

  assert.equal(predictedBase.size, 40, "base inner-hole border should be 40 cells");
  assert.equal(predictedExpanded.size, 60, "orthogonal bridge pass should expand inner border to 60 cells");
  assert.equal(diff.size, 60, "stage-3 adds 60 cells over stage-2");
  assert.equal(predictedCoords.size, diff.size, "predicted and calibrated added-cell counts should match");

  for (const k of predictedCoords) {
    assert.ok(diff.has(k), `predicted inner-border coord missing from calibration diff: ${k}`);
  }
});
