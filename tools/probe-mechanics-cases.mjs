import { buildSmallSegmentCase, renderCaseAscii } from "./small-segment-lib.mjs";

const PROBE_CASES = [
  {
    id: "probe_straight_edge_blank_edge",
    label: "Probe Straight Edge-Blank-Edge",
    shouldLookLike: "Open straight strip using edge | blank | edge across width, repeated by length.",
    closed: false,
    widthTiles: 1,
    fixedShareCode:
      "PolyTrack14xZBBvtDCCCAAA9bKBK9RnIqJXWmlivZOulMZrlp1XfOH4ehWeyXZ4MMhUoIIWlDLCGysDrSqDyL0uRyBgOo0vxcK6ZOUjQHjAWpUv3p7bfr0Ch3Ys4V9CJMwj0i7DeirMaC4RGdqOS3KEl9G6mXeTLfaBwkgG3fGKmAeqqTqJVDqj5l5NK3mb2JdMX6ixecs9b6fgXXuGKB",
  },
  {
    id: "probe_straight_right_left_straight",
    label: "Probe Straight-Right-Left-Straight",
    shouldLookLike: "Open strip: straight, then right turn, then left turn back into straight (offset lane), user-fixed baseline.",
    closed: false,
    widthTiles: 1,
    fixedShareCode:
      "PolyTrack14pdDGHtdCCCAAA9XqpRUPOxQcKOEPdA2bxUP6WCaYq4Xft7TXFtmxWcIUc8VcSjimjO5sIuFFNmWzlHw182mRb5FUq9GEyGAh5ReSEpyTBr7jETCp5emDba5rPZ0uQCj12S5VRg9VjRLnZ6ystriu3UxB91KW4sfXifUoyD6uoQ5bpijuppcX42tHH9fOLZfzhJFIyMzK7JYP2MygvKOj7VfYYNzloXFuYIfTOy2jbn6RnefL0FtvfRFIdCKhfNe8Sge57LZp4fBDvFTZD",
  },
  {
    id: "probe_right_only_box",
    label: "Probe Right-Only Box",
    shouldLookLike: "Compact rectangle loop with all corners turning right (clockwise path).",
    closed: true,
    widthTiles: 1,
    microStyle: true,
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
    ],
  },
  {
    id: "probe_left_only_box",
    label: "Probe Left-Only Box",
    shouldLookLike: "Same box but all corners turning left (counter-clockwise path).",
    closed: true,
    widthTiles: 1,
    microStyle: true,
    cells: [
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 1 },
      { x: 3, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ],
  },
  {
    id: "probe_notch_left",
    label: "Probe Notch Left",
    shouldLookLike: "Rectangle loop with one inward notch from the left side.",
    closed: true,
    widthTiles: 1,
    microStyle: true,
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 2, y: 3 },
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 4, y: 4 },
      { x: 3, y: 4 },
      { x: 2, y: 4 },
      { x: 1, y: 4 },
      { x: 0, y: 4 },
      { x: 0, y: 3 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
    ],
  },
  {
    id: "probe_notch_right",
    label: "Probe Notch Right",
    shouldLookLike: "Mirror of notch-left: inward notch from the right side (user-fixed, no start/checkpoint/finish).",
    closed: true,
    widthTiles: 1,
    fixedShareCode:
      "PolyTrack14pdBBfaLGCGAAA6vURD1jRsOG1Jmh3yhEjSsHf879WG2EE5ujsQmmWwmiNX0JAXMjYtcFr64sr5evFX4jqd97hpJ5FgyDg9s0dovxJOREB5EqGX1ISWknOfJyQyAOSxr1SeZJcYWq9ayX6Ltfyn9lKpO8ViewYPOLFfp8WT1Pbke1FjfI3xNgc35hsqHA9i2A5Ob4fA04SbGC",
  },
  {
    id: "probe_hairpin_open",
    label: "Probe Hairpin Open",
    shouldLookLike: "Open U-turn/hairpin segment with two near-parallel straights (user-fixed baseline).",
    closed: false,
    widthTiles: 1,
    fixedShareCode:
      "PolyTrack14pdFHvkFCCCAAA8Klmm6SBfLNSNqwcHWSfAJFFG2pvXzu5A60qqMOEGFFnEGMnrXKbNyYxVn14KIMZXsq7FejMG0ylNcPZkjan45e6PR97HCYoSmpm9Yex07gybWmRhQE1V6qwy1QuIFDoEKIdc2njyeX6Uo8v4tEncdeWCdC68ez9SaDfG5fXZaHOTbS2Bq52ud2ThpFPZGk2SqLiVMSjjdwCLgmU5JrCyc98rfePKGvQjB",
  },
  {
    id: "probe_start_alt_93",
    label: "Probe Start Alt 93",
    shouldLookLike: "Tiny loop where start should be the 93 variant (north-facing low-degree start).",
    closed: true,
    widthTiles: 1,
    microStyle: true,
    cells: [
      { x: 0, y: 1 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 0, y: 2 },
    ],
  },
  {
    id: "probe_width3_inner_outer",
    label: "Probe Width3 InnerOuter",
    shouldLookLike: "Small width-3 loop to verify inside corner fill vs outside border containment.",
    closed: true,
    widthTiles: 3,
    microStyle: true,
    cells: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 1 },
      { x: 4, y: 2 },
      { x: 4, y: 3 },
      { x: 3, y: 3 },
      { x: 2, y: 3 },
      { x: 1, y: 3 },
      { x: 0, y: 3 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
    ],
  },
];

for (const def of PROBE_CASES) {
  const built = buildSmallSegmentCase(def);
  // eslint-disable-next-line no-console
  console.log(`\n=== ${built.id} :: ${built.label} ===`);
  // eslint-disable-next-line no-console
  console.log(`should: ${built.shouldLookLike}`);
  // eslint-disable-next-line no-console
  console.log(`closed=${built.closed} widthTiles=${built.widthTiles} parts=${built.parts} startType=${built.startType} bbox=${built.bbox.w}x${built.bbox.h}`);
  // eslint-disable-next-line no-console
  console.log(`counts=${JSON.stringify(built.counts)}`);
  // eslint-disable-next-line no-console
  console.log(built.shareCode);
  // eslint-disable-next-line no-console
  console.log(`\n${renderCaseAscii(built.decoded)}`);
}
