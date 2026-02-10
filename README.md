# PolyTrack Track Generator

Web Version (weird link i know thats just github pages): https://sankdoy.github.io/polytrack-track-gen/

random track generator that outputs PolyTrack `v3` share codes.

## Run locally (Node)

```bash
npm start
```

Open `http://localhost:3000`.



Notes:
- The Pages build uses `pako` from a CDN for compression when encoding share codes.
- The Node GUI (`npm start`) is separate and not used by GitHub Pages.
- This is intended to be used not as a standalone track generator but a more basline starting point for *good* map creators to save time.
- It is not at a stage yet where it can create complex and diverse maps, hopefully some updates will come.
