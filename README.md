# PolyTrack Image Trace Generator

Generate a PolyTrack share code from a track image.

## What it does

- Converts an uploaded image into a binary mask.
- Traces the main line and converts it to a flat-piece track.
- Lets you set target length (`km`/`miles`), scaling mode, and track width.
- Adds border containment pieces only outside the road area.
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
