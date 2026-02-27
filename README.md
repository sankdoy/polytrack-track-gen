# PolyTrack Image Trace Generator

Generate a PolyTrack share code from a track image.

## What it does

- Converts an uploaded image into a binary mask.
- Traces the main line and converts it to a flat-piece track.
- Lets you set target length (`km`/`miles`), scaling mode, and track width.
- Adds border containment pieces only outside the road area.
- For closed tracks with width `>= 3`, can synthesize an inner border pass (hole-facing border) using orthogonal bridge rules.
- Outputs a `PolyTrack1...` share code.

## Run

1. Open `index.html` (redirects to `docs/`).
2. Upload a track outline image.
3. Set length, unit, width, and scaling options.
4. Click **Generate Track**.
5. Copy the generated share code.

## Tests

Run all tests:

```bash
node --test
```

New rule-focused tests are in:

- `tools/image-track-core.test.mjs`
- `tools/reference-calibration.test.mjs`
- `tools/small-segment-cases.test.mjs`
- `tools/outline-stage-calibration.test.mjs`

Generate tiny manual validation cases (with "should look like" notes + share codes):

```bash
node tools/small-segment-cases.mjs
```

Generate extra mechanic-focused probe tracks (right-only/left-only/notches/hairpin/width checks):

```bash
node tools/probe-mechanics-cases.mjs
```

Run command-driven mapping cases (paste fixed outputs into fixture to calibrate logic):

```bash
node tools/command-cases.mjs
```

List case ids:

```bash
node tools/command-cases.mjs --list
```

Run one case:

```bash
node tools/command-cases.mjs --id cmd_micro_right_90
```

Fixture file:

- `tools/fixtures/command-cases.mjs`
