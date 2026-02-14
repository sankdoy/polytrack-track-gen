import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { analyzeTubeLogic, readShareCodeFromTrackCodes } from "./tube-logic-lib.mjs";

const EXPECTED_PATH = new URL("./tube-logic.expected.json", import.meta.url);

function loadExpected() {
  return JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8"));
}

function getCodeFromExpectedSource(expectedSource) {
  if (!expectedSource || expectedSource.type !== "track_codes_only") {
    throw new Error("Expected source must be track_codes_only for default test mode");
  }
  return readShareCodeFromTrackCodes({ line: expectedSource.line, path: expectedSource.path });
}

test("tube logic baseline snapshot matches expected profile", () => {
  // If a custom map is supplied, run diagnostic invariants instead of snapshot compare.
  const customCode = process.env.TUBE_SHARE_CODE?.trim();
  const expected = loadExpected();

  if (customCode) {
    const profile = analyzeTubeLogic(customCode);
    assert.ok(profile, "custom TUBE_SHARE_CODE should decode");
    assert.ok(profile.tubePartCount > 0, "custom map should contain tube-like parts");
    assert.ok(Object.keys(profile.tubePieceCounts).length > 0, "custom map should expose tube piece counts");
    assert.ok(Object.keys(profile.topOffsets).length > 0, "custom map should produce offset stats");

    const interestingIds = ["31", "32", "33", "45", "46", "49", "50", "62", "63", "64"];
    const present = interestingIds.filter((id) => Number(profile.tubePieceCounts[id] || 0) > 0);
    assert.ok(present.length > 0, "custom map should include at least one known tube family id");
    return;
  }

  const code = getCodeFromExpectedSource(expected.source);
  const profile = analyzeTubeLogic(code);
  assert.ok(profile, "expected source code should decode");
  assert.deepEqual(profile, expected.profile);
});
