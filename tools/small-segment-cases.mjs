import { SMALL_SEGMENT_CASES } from "./fixtures/small-segment-cases.mjs";
import { buildSmallSegmentCase, renderCaseAscii } from "./small-segment-lib.mjs";

const asJson = process.argv.includes("--json");

const out = SMALL_SEGMENT_CASES.map((def) => {
  const built = buildSmallSegmentCase(def);
  return {
    id: built.id,
    label: built.label,
    shouldLookLike: built.shouldLookLike,
    closed: built.closed,
    widthTiles: built.widthTiles,
    shareCode: built.shareCode,
    parts: built.parts,
    centerline: built.centerline,
    road: built.road,
    border: built.border,
    startType: built.startType,
    bbox: built.bbox,
    counts: built.counts,
    ascii: renderCaseAscii(built.decoded),
  };
});

if (asJson) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

for (const c of out) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${c.id} :: ${c.label} ===`);
  // eslint-disable-next-line no-console
  console.log(`should: ${c.shouldLookLike}`);
  // eslint-disable-next-line no-console
  const centerline = c.centerline == null ? "n/a" : c.centerline;
  const road = c.road == null ? "n/a" : c.road;
  const border = c.border == null ? "n/a" : c.border;
  console.log(`closed=${c.closed} widthTiles=${c.widthTiles} parts=${c.parts} centerline=${centerline} road=${road} border=${border} startType=${c.startType} bbox=${c.bbox.w}x${c.bbox.h}`);
  // eslint-disable-next-line no-console
  console.log(`counts=${JSON.stringify(c.counts)}`);
  // eslint-disable-next-line no-console
  console.log(c.shareCode);
  // eslint-disable-next-line no-console
  console.log("\n" + c.ascii);
}
