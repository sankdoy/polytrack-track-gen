import pako from "pako";

import { BlockTypeName, generateManualMiniTrack, manualMiniTrackScenarios } from "../../docs/track-web.mjs";

globalThis.pako = pako;

for (const s of manualMiniTrackScenarios) {
  const r = generateManualMiniTrack({ scenarioId: s.id, name: s.label, environment: "Summer" });
  // eslint-disable-next-line no-console
  console.log(`\n=== ${s.id} ===`);
  // eslint-disable-next-line no-console
  console.log(s.label);
  // eslint-disable-next-line no-console
  console.log(r.shareCode);

  const seq = r.placedSequence || [];
  const lines = seq.map((p, i) => `${i}: ${BlockTypeName[p.blockType] || p.blockType}  (${p.x},${p.y},${p.z}) rot=${p.rotation}`);
  // eslint-disable-next-line no-console
  console.log(lines.join("\n"));
}

