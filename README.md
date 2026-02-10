# PolyTrack Track Generator

Local random track generator that outputs PolyTrack `v3` share codes.

## Run locally (Node)

```bash
npm start
```

Open `http://localhost:3000`.

## Deploy to GitHub Pages (static)

GitHub Pages can only host static files, so the generator is also available as a fully client-side build in `docs/`.

1. Create a GitHub repo and push this project to `main`.
2. In GitHub: **Settings → Pages**
3. **Build and deployment**
   - **Source:** “Deploy from a branch”
   - **Branch:** `main`
   - **Folder:** `/docs`
4. Save, wait ~1–2 minutes, then open the Pages URL GitHub shows.

### Quick push commands

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

Notes:
- The Pages build uses `pako` from a CDN for compression when encoding share codes.
- The Node GUI (`npm start`) is separate and not used by GitHub Pages.
