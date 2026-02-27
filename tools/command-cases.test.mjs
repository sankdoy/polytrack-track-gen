import test from "node:test";
import assert from "node:assert/strict";

import { REFERENCE_PALETTE } from "../docs/image-track-core.mjs";
import { COMMAND_CASES } from "./fixtures/command-cases.mjs";
import { buildCommandCase, parseCommandSpec } from "./command-cases-lib.mjs";

const SHAPE_ONLY_ALLOWED = new Set([
  REFERENCE_PALETTE.BORDER,
  REFERENCE_PALETTE.TURN_LEFT,
  REFERENCE_PALETTE.TURN_RIGHT,
  REFERENCE_PALETTE.ROAD,
]);

const RACE_READY_ALLOWED = new Set([
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

test("command parser accepts F/L/R tokens and rejects invalid tokens", () => {
  const ok = parseCommandSpec("F3 L F10 R F5");
  assert.equal(ok.length, 5);
  assert.deepEqual(ok[0], { op: "F", n: 3 });
  assert.deepEqual(ok[1], { op: "L" });
  assert.deepEqual(ok[2], { op: "F", n: 10 });

  assert.throws(() => parseCommandSpec(""), /No commands/);
  assert.throws(() => parseCommandSpec("F0"), /Invalid forward/);
  assert.throws(() => parseCommandSpec("X9"), /Invalid token/);
});

test("command cases build decodable tracks and validate optional fixed references", () => {
  const seenBorderTurns = new Set();

  for (const def of COMMAND_CASES) {
    const built = buildCommandCase(def);
    assert.ok(built.shareCode.startsWith("PolyTrack1"), `${def.id} should encode as PolyTrack1`);
    assert.ok(built.parts > 0, `${def.id} should have parts`);

    const allowed = built.style === "race-ready" ? RACE_READY_ALLOWED : SHAPE_ONLY_ALLOWED;
    for (const p of built.decoded.parts) {
      assert.ok(allowed.has(p.blockType), `${def.id} contains unexpected block id ${p.blockType}`);
      if (p.blockType === REFERENCE_PALETTE.TURN_LEFT || p.blockType === REFERENCE_PALETTE.TURN_RIGHT) {
        seenBorderTurns.add(p.blockType);
      }
    }

    const hasExpected = String(def.expectedShareCode || "").trim().length > 0;
    if (hasExpected) {
      assert.equal(built.status, "match", `${def.id} should match expected fixed share code`);
    } else {
      assert.equal(built.status, "missing_expected", `${def.id} should report missing expected`);
    }
  }

  assert.ok(seenBorderTurns.has(REFERENCE_PALETTE.TURN_LEFT), "expected at least one case to emit TURN_LEFT (11)");
  assert.ok(seenBorderTurns.has(REFERENCE_PALETTE.TURN_RIGHT), "expected at least one case to emit TURN_RIGHT (12)");
});
