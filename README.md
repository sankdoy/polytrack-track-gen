# PolyTrack Track Generator

Web version: https://sankdoy.github.io/polytrack-track-gen/

Random track generator that outputs PolyTrack `v3` share codes.

## GitHub Pages

This repo is set up for GitHub Pages to serve the web UI from `docs/`.
If your Pages settings are pointing at the repo root, `index.html` redirects to `./docs/`.

Notes:
- The Pages build uses `pako` from a CDN for compression when encoding share codes.
- This project is a baseline starting point for track creators to iterate faster.

## Working with large track dumps

If you have a huge single-line JSON array (VS Code may show `RangeError: Invalid string length`), convert it to NDJSON (one JSON object per line):

`node tools/json-array-to-ndjson.mjs out_0.5.json out_0.5.ndjson`

Then you can split it into smaller chunks:

`split -b 100m out_0.5.ndjson out_0.5.ndjson.part.`

To convert an NDJSON dump into `v3` share codes:

`node tools/ndjson-to-v3-sharecodes.mjs --input out_0.5.ndjson --output sharecodes.txt`
