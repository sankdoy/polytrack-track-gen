#!/usr/bin/env node
/**
 * PolyTrack Track Generator - Local GUI
 *
 * Run:  node gui.js
 * Opens a browser GUI on http://localhost:3000
 */

const http = require('http');
const { execSync } = require('child_process');
const { generateTrack } = require('./track');

const PORT = Number.parseInt(process.env.PORT || '3000', 10) || 3000;
// Default to localhost for local dev; set HOST=0.0.0.0 when deploying.
const HOST = process.env.HOST || '127.0.0.1';

// ── API ──────────────────────────────────────────────────────

function handleGenerate(body) {
  let params;
  try {
    params = JSON.parse(body);
  } catch (e) {
    const err = new Error('Invalid JSON body');
    err.cause = e;
    throw err;
  }
  const results = [];

  const batch = Math.max(1, Math.min(100, params.batch || 1));

  for (let i = 0; i < batch; i++) {
    const trackName = batch > 1 ? `${params.name || 'Track'} #${i + 1}` : (params.name || 'Track');
    const seed = (params.seed || Date.now()) + i;

    const result = generateTrack({
      name: trackName,
      length: params.length ?? 30,
      elevation: params.elevation ?? 1,
      curviness: params.curviness ?? 1,
      numCheckpoints: params.checkpoints ?? 2,
      environment: params.environment || 'Summer',
      includeScenery: !!params.scenery,
      maxHeight: params.maxHeight ?? 24,
      maxAttemptsPerPiece: params.maxAttemptsPerPiece ?? 25,
      allowIntersections: !!params.allowIntersections,
      intersectionChance: params.intersectionChance ?? 0.15,
      templateChance: params.templateChance ?? 0.25,
      allowSteepSlopes: params.allowSteepSlopes ?? true,
      seed,
    });

    results.push({
      name: trackName,
      shareCode: result.shareCode,
      description: result.description,
      seed,
    });
  }

  return JSON.stringify(results);
}

// ── Server ───────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML);
  } else if (req.method === 'POST' && req.url === '/generate') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const json = handleGenerate(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(json);
      } catch (e) {
        console.error('[generate] error:', e && e.stack ? e.stack : e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          error: e?.message || String(e),
          stack: process.env.NODE_ENV === 'production' ? undefined : (e?.stack || String(e)),
        }));
      }
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, HOST, () => {
  const localUrl = `http://localhost:${PORT}`;
  const url = (HOST === '0.0.0.0' || HOST === '::') ? localUrl : `http://${HOST}:${PORT}`;
  console.log(`PolyTrack Generator GUI running at ${url}`);

  // Auto-open browser
  try {
    if (process.env.NO_OPEN === '1' || !process.stdout.isTTY) return;
    const platform = process.platform;
    if (platform === 'darwin') execSync(`open ${localUrl}`);
    else if (platform === 'win32') execSync(`start ${localUrl}`);
    else execSync(`xdg-open ${localUrl}`);
  } catch (_) {
    console.log('Open the URL above in your browser.');
  }
});

// ── HTML ─────────────────────────────────────────────────────

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PolyTrack Generator</title>
	<style>
	  :root {
	    --bg: #0b0f17;
	    --surface: #121a26;
	    --card: #0f1621;
	    --accent: #4f8cff;
	    --accent2: #8b5cf6;
	    --text: #e6edf3;
	    --muted: #9fb0c0;
	    --input-bg: rgba(15, 22, 33, 0.8);
	    --border: rgba(255, 255, 255, 0.10);
	    --success: #22c55e;
	    --radius: 10px;
	  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

	  body {
	    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
	    background:
	      radial-gradient(1200px 800px at 30% -20%, rgba(79,140,255,0.22), transparent 55%),
	      radial-gradient(900px 700px at 100% 0%, rgba(139,92,246,0.18), transparent 55%),
	      var(--bg);
	    color: var(--text);
	    min-height: 100vh;
	    padding: 0;
	  }

	  header {
	    background: var(--surface);
	    border-bottom: 1px solid var(--border);
	    padding: 16px 24px;
	    display: flex;
	    align-items: center;
	    gap: 12px;
	  }

	  header .spacer { flex: 1; }

	  header a.support {
	    display: inline-flex;
	    align-items: center;
	    gap: 8px;
	    padding: 6px 10px;
	    border-radius: 999px;
	    border: 1px solid rgba(255, 255, 255, 0.12);
	    color: var(--text);
	    text-decoration: none;
	    background: rgba(15, 22, 33, 0.65);
	    font-size: 0.8rem;
	    font-weight: 600;
	  }
	  header a.support:hover { filter: brightness(1.05); }

  header h1 {
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: 1px;
  }

	  header .badge {
	    background: rgba(79,140,255,0.16);
	    border: 1px solid rgba(79,140,255,0.35);
	    color: #fff;
	    font-size: 0.7rem;
	    padding: 2px 8px;
	    border-radius: 10px;
	    font-weight: 600;
	    text-transform: uppercase;
	  }

  .container {
    max-width: 900px;
    margin: 24px auto;
    padding: 0 16px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  @media (max-width: 700px) {
    .container { grid-template-columns: 1fr; }
  }

	  .panel {
	    background: var(--surface);
	    border: 1px solid var(--border);
	    border-radius: var(--radius);
	    padding: 20px;
	  }

	  .panel h2 {
	    font-size: 1rem;
	    font-weight: 600;
	    color: var(--accent2);
	    margin-bottom: 16px;
	    letter-spacing: 1px;
	    font-size: 0.85rem;
	  }

  .field {
    margin-bottom: 14px;
  }

  .field label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: 4px;
  }

  .field label .val {
    color: var(--text);
    font-weight: 600;
    font-size: 0.9rem;
    min-width: 2ch;
    text-align: right;
  }

	  input[type="text"],
	  input[type="number"],
	  select {
	    width: 100%;
	    background: var(--input-bg);
	    border: 1px solid var(--border);
	    color: var(--text);
	    padding: 8px 12px;
	    border-radius: var(--radius);
	    font-size: 0.9rem;
	    outline: none;
	    transition: border-color 0.15s;
	  }

  input:focus, select:focus {
    border-color: var(--accent);
  }

  input[type="range"] {
    width: 100%;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .row {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .row input[type="number"] { flex: 1; }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: var(--radius);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:active { transform: scale(0.97); }

	  .btn-primary {
	    background: var(--accent);
	    color: #fff;
	    width: 100%;
	    padding: 12px;
	    font-size: 1rem;
	    margin-top: 8px;
	  }

	  .btn-primary:hover { filter: brightness(0.95); }

	  .btn-small {
	    background: var(--card);
	    color: var(--text);
	    padding: 4px 10px;
	    font-size: 0.75rem;
	  }

	  .btn-small:hover { filter: brightness(1.05); }

	  .btn-copy {
	    background: var(--card);
	    color: var(--accent2);
	    padding: 6px 12px;
	    font-size: 0.8rem;
	  }

	  .btn-copy:hover { filter: brightness(1.05); }
	  .btn-copy.copied { background: rgba(34,197,94,0.2); color: var(--success); border-color: rgba(34,197,94,0.35); }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 14px;
  }

  .checkbox-row input[type="checkbox"] {
    accent-color: var(--accent);
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .checkbox-row label {
    font-size: 0.85rem;
    color: var(--muted);
    cursor: pointer;
  }

  .output-panel {
    grid-column: 1 / -1;
  }

  #output {
    display: none;
  }

  #output.visible {
    display: block;
  }

  .track-result {
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 14px;
    margin-bottom: 12px;
  }

  .track-result .track-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .track-result .track-name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .track-result .track-seed {
    font-size: 0.75rem;
    color: var(--muted);
  }

  .code-box {
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 10px;
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 0.75rem;
    word-break: break-all;
    line-height: 1.4;
    max-height: 100px;
    overflow-y: auto;
    margin-bottom: 8px;
    user-select: all;
    color: var(--success);
  }

  .track-actions {
    display: flex;
    gap: 8px;
  }

  details {
    margin-top: 8px;
  }

  details summary {
    cursor: pointer;
    font-size: 0.8rem;
    color: var(--muted);
    user-select: none;
  }

  details summary:hover { color: var(--text); }

  .description-box {
    background: #111;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 10px;
    font-family: monospace;
    font-size: 0.7rem;
    white-space: pre-wrap;
    line-height: 1.5;
    max-height: 300px;
    overflow-y: auto;
    margin-top: 6px;
    color: var(--muted);
  }

  .spinner {
    display: none;
    width: 20px;
    height: 20px;
    border: 3px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .generating .spinner { display: inline-block; }
  .generating .btn-text { display: none; }

  .status {
    text-align: center;
    font-size: 0.8rem;
    color: var(--muted);
    padding: 8px;
  }
</style>
</head>
<body>

<header>
  <h1>PolyTrack Generator</h1>
  <span class="badge">GUI</span>
  <span class="spacer"></span>
  <a class="support" href="https://buymeacoffee.com/sankdoy" target="_blank" rel="noopener noreferrer">Buy me a coffee</a>
</header>

<div class="container">

  <!-- Left: Parameters -->
  <div class="panel">
    <h2>Track Parameters</h2>

    <div class="field">
      <label>Track Name</label>
      <input type="text" id="name" value="Generated Track" placeholder="Track name...">
    </div>

    <div class="field">
      <label>Length <span class="val" id="lengthVal">30</span></label>
      <input type="range" id="length" min="10" max="2000" value="30" step="10">
    </div>

    <div class="field">
      <label>Elevation <span class="val" id="elevationVal">1</span></label>
      <input type="range" id="elevation" min="0" max="10" value="1">
    </div>

    <div class="field">
      <label>Curviness <span class="val" id="curvinessVal">1</span></label>
      <input type="range" id="curviness" min="0" max="10" value="1">
    </div>

    <div class="field">
      <label>Checkpoints <span class="val" id="checkpointsVal">2</span></label>
      <input type="range" id="checkpoints" min="0" max="200" value="2">
    </div>

    <div class="field">
      <label>Environment</label>
      <select id="environment">
        <option value="Summer" selected>Summer</option>
        <option value="Winter">Winter</option>
        <option value="Desert">Desert</option>
        <option value="Default">Default</option>
      </select>
    </div>

    <div class="checkbox-row">
      <input type="checkbox" id="scenery">
      <label for="scenery">Include Scenery</label>
    </div>

    <details>
      <summary>Advanced</summary>

      <div class="field" style="margin-top: 10px;">
        <label>Max Height <span class="val" id="maxHeightVal">24</span></label>
        <input type="range" id="maxHeight" min="0" max="200" value="24" step="1">
      </div>

      <div class="field">
        <label>Max Attempts / Piece <span class="val" id="maxAttemptsPerPieceVal">25</span></label>
        <input type="range" id="maxAttemptsPerPiece" min="1" max="200" value="25" step="1">
      </div>

      <div class="checkbox-row">
        <input type="checkbox" id="allowSteepSlopes" checked>
        <label for="allowSteepSlopes">Allow Steep Slopes (+2Y)</label>
      </div>

      <div class="checkbox-row">
        <input type="checkbox" id="allowIntersections">
        <label for="allowIntersections">Allow Self-Intersections</label>
      </div>

      <div class="field">
        <label>Intersection Chance <span class="val" id="intersectionChanceVal">0.15</span></label>
        <input type="range" id="intersectionChance" min="0" max="1" value="0.15" step="0.01">
      </div>

      <div class="field">
        <label>Template Chance <span class="val" id="templateChanceVal">0.25</span></label>
        <input type="range" id="templateChance" min="0" max="1" value="0.25" step="0.01">
      </div>
    </details>
  </div>

  <!-- Right: Generation -->
  <div class="panel">
    <h2>Generation</h2>

    <div class="field">
      <label>Seed</label>
      <div class="row">
        <input type="number" id="seed" placeholder="Random">
        <button class="btn btn-small" onclick="document.getElementById('seed').value=''; document.getElementById('seed').placeholder='Random';">Random</button>
        <button class="btn btn-small" onclick="document.getElementById('seed').value=Math.floor(Math.random()*999999);">Roll</button>
      </div>
    </div>

    <div class="field">
      <label>Batch Count</label>
      <input type="number" id="batch" value="1" min="1" max="100">
    </div>

    <button class="btn btn-primary" id="generateBtn" onclick="generate()">
      <span class="btn-text">Generate Track</span>
      <span class="spinner"></span>
    </button>

    <div class="status" id="status"></div>
  </div>

  <!-- Output -->
  <div class="panel output-panel" id="output">
    <h2>Results</h2>
    <div id="results"></div>
  </div>

</div>

<script>
  // Slider value displays
  document.querySelectorAll('input[type="range"]').forEach(el => {
    const display = document.getElementById(el.id + 'Val');
    if (display) {
      el.addEventListener('input', () => display.textContent = el.value);
    }
  });

  async function generate() {
    const btn = document.getElementById('generateBtn');
    btn.classList.add('generating');
    btn.disabled = true;
    document.getElementById('status').textContent = 'Generating...';

    const seedVal = document.getElementById('seed').value;

    const params = {
      name: document.getElementById('name').value,
      length: +document.getElementById('length').value,
      elevation: +document.getElementById('elevation').value,
      curviness: +document.getElementById('curviness').value,
      checkpoints: +document.getElementById('checkpoints').value,
      environment: document.getElementById('environment').value,
      scenery: document.getElementById('scenery').checked,
      maxHeight: +document.getElementById('maxHeight').value,
      maxAttemptsPerPiece: +document.getElementById('maxAttemptsPerPiece').value,
      allowSteepSlopes: document.getElementById('allowSteepSlopes').checked,
      allowIntersections: document.getElementById('allowIntersections').checked,
      intersectionChance: +document.getElementById('intersectionChance').value,
      templateChance: +document.getElementById('templateChance').value,
      seed: seedVal ? +seedVal : Date.now(),
      batch: +document.getElementById('batch').value || 1,
    };

    try {
      const res = await fetch('/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (!res.ok) {
        let msg = 'Server error';
        try {
          const text = await res.text();
          if (text) msg += ': ' + text;
        } catch (_) {}
        throw new Error(msg);
      }
      const results = await res.json();

      const container = document.getElementById('results');
      container.innerHTML = '';

      for (const r of results) {
        const div = document.createElement('div');
        div.className = 'track-result';
        div.innerHTML =
          '<div class="track-header">' +
            '<span class="track-name">' + esc(r.name) + '</span>' +
            '<span class="track-seed">seed: ' + r.seed + '</span>' +
          '</div>' +
          '<div class="code-box" id="code-' + r.seed + '">' + esc(r.shareCode) + '</div>' +
          '<div class="track-actions">' +
            '<button class="btn btn-copy" onclick="copyCode(this, ' + JSON.stringify(r.shareCode).replace(/"/g, '&quot;') + ')">Copy Share Code</button>' +
          '</div>' +
          '<details>' +
            '<summary>Show track details</summary>' +
            '<div class="description-box">' + esc(r.description) + '</div>' +
          '</details>';
        container.appendChild(div);
      }

      document.getElementById('output').classList.add('visible');
      document.getElementById('status').textContent = results.length + ' track(s) generated';
    } catch (e) {
      document.getElementById('status').textContent = 'Error: ' + e.message;
    }

    btn.classList.remove('generating');
    btn.disabled = false;
  }

  function copyCode(btn, code) {
    navigator.clipboard.writeText(code).then(() => {
      btn.classList.add('copied');
      btn.textContent = 'Copied!';
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.textContent = 'Copy Share Code';
      }, 1500);
    });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Enter key generates
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !document.getElementById('generateBtn').disabled) generate();
  });
</script>

</body>
</html>
`;
