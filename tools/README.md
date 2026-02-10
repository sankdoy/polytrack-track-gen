# Tools

These scripts are for working with large dumps of PolyTrack tracks and for extracting placement/connection statistics.

## NDJSON utilities

- Convert a single-line JSON array → NDJSON:
  - `node tools/ndjson/array-to-ndjson.mjs in.json out.ndjson`
- Remove duplicate track names (keeps first occurrence):
  - `node tools/ndjson/dedupe-by-name.mjs --input in.ndjson --output out.ndjson`
- Drop one specific NDJSON line (1-based, safe for huge lines):
  - `node tools/ndjson/drop-line.mjs --input in.ndjson --output out.ndjson --drop-line 5050`
- Quick adjacency counts directly from NDJSON:
  - `node tools/ndjson/analyze-piece-interactions.mjs --input tracks.ndjson --limit 400`

## v3 share codes

- Convert an NDJSON dump → `v3` share codes:
  - `node tools/v3/ndjson-to-sharecodes.mjs --input tracks.ndjson --output sharecodes.txt`
- Filter a sharecode list to only tracks with both Start and Finish:
  - `node tools/v3/filter-sharecodes.mjs --input sharecodes.txt --in-place`
- Print a set of tiny manual tracks (for alignment debugging):
  - `node tools/v3/print-manual-mini-tracks.mjs`
- Analyze piece adjacency using `v3` share codes:
  - `node tools/v3/analyze-sharecodes.mjs --input sharecodes.txt --limit 1000`
- Extract a compact “connector rules” JSON (top adjacency hints per piece/rotation):
  - `node tools/v3/extract-connector-rules.mjs --input sharecodes.txt --limit 2000 --out rules.json`

## PolyTrack1

- Decode a `PolyTrack1...` reference track and list its piece IDs:
  - `node tools/polytrack1/decode.mjs "PolyTrack1...."`
