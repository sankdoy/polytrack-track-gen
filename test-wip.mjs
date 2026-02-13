import * as zlib from "node:zlib";
globalThis.pako = {
  deflate: (data) => zlib.deflateSync(Buffer.from(data)),
  inflate: (data) => zlib.inflateSync(Buffer.from(data)),
};
import { generateWipTrack } from "./docs/track-wip.mjs";

let pass = 0, fail = 0;
const errors = [];

for (let seed = 1; seed <= 30; seed++) {
  try {
    const r = generateWipTrack({
      seed,
      length: 40 + seed * 5,
      name: `WIP Test ${seed}`,
      environment: "Summer",
      includeScenery: seed % 3 === 0,
      useExoticBlocks: seed % 2 === 0,
      complexity: 5 + (seed % 6),
      sceneryDensity: 3 + (seed % 8),
      jumpScale: 3 + (seed % 8),
      jumpChance: 0.15,
      elevation: 3,
      curviness: 3,
    });

    if (!r.shareCode || !r.shareCode.startsWith("PolyTrack1")) {
      throw new Error(`Bad share code for seed ${seed}`);
    }
    if (r.placedSequence.length < 5) {
      throw new Error(`Too few pieces (${r.placedSequence.length}) for seed ${seed}`);
    }
    pass++;
    const exoticCount = r.placedSequence.filter(p =>
      ![0,1,2,3,4,5,6,36,38,39,44,52,83].includes(p.blockType)
    ).length;
    if (seed <= 5 || exoticCount > 0) {
      console.log(`seed=${seed}: ${r.placedSequence.length} pieces, exotic=${exoticCount}, code=${r.shareCode.substring(0, 40)}...`);
    }
  } catch (e) {
    fail++;
    errors.push({ seed, error: e.message });
    console.error(`FAIL seed=${seed}: ${e.message}`);
  }
}

console.log(`\n${pass}/${pass + fail} passed`);
if (errors.length) {
  console.log("Errors:", JSON.stringify(errors, null, 2));
}
