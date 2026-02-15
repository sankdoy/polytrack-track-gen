import { generateTrack, generateManualMiniTrack, manualMiniTrackScenarios, BlockTypeName } from "./track-web.mjs?v=2026-02-15-simple-settings-v3";

const $ = (id) => document.getElementById(id);
const hasDOM = typeof document !== "undefined" && typeof window !== "undefined";

function bindRange(id, formatter) {
  const el = $(id);
  const val = $(id + "Val");
  if (!el || !val) return;
  const fmt = formatter || ((v) => v);
  const update = () => { if (val) val.textContent = fmt(el.value); };
  el.addEventListener("input", update);
  update();
}

function setStatus(elId, text, kind) {
  const s = $(elId);
  s.classList.remove("bad", "good");
  if (kind) s.classList.add(kind);
  s.textContent = text || "";
}

function esc(s) {
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function copyText(text) {
  return navigator.clipboard.writeText(text);
}

function checkpointCountFromDensity(length, densityPercent) {
  const safeLength = Math.max(10, Math.floor(Number(length) || 10));
  const safeDensity = Math.max(0, Math.min(100, Number(densityPercent) || 0));
  const maxCheckpoints = Math.max(0, Math.floor(safeLength / 8));
  return Math.round((maxCheckpoints * safeDensity) / 100);
}

function updateCheckpointDensityDisplay() {
  const densityEl = $("checkpointDensity");
  const densityValEl = $("checkpointDensityVal");
  const lengthEl = $("length");
  if (!densityEl || !densityValEl || !lengthEl) return;
  const density = Number(densityEl.value) || 0;
  const cpCount = checkpointCountFromDensity(lengthEl.value, density);
  densityValEl.textContent = `${density}% (~${cpCount})`;
}

function mapElevationProfile(profile) {
  switch (profile) {
    case "grounded": return 0;
    case "rolling": return 3;
    case "mountain": return 6;
    case "skyline": return 10;
    default: return 3;
  }
}

function mapCurvinessProfile(profile) {
  switch (profile) {
    case "laser": return { curviness: 0, turnStyle: "none" };
    case "sweeping": return { curviness: 3, turnStyle: "long_only" };
    case "curvy": return { curviness: 6, turnStyle: "mixed" };
    case "roundabout": return { curviness: 9, turnStyle: "tight" };
    default: return { curviness: 4, turnStyle: "mixed" };
  }
}

if (hasDOM) {
  bindRange("length");
  bindRange("checkpointDensity");
  bindRange("maxHeight");
  bindRange("maxAttemptsPerPiece");
  updateCheckpointDensityDisplay();
  $("length")?.addEventListener("input", updateCheckpointDensityDisplay);
  $("checkpointDensity")?.addEventListener("input", updateCheckpointDensityDisplay);

  // Populate test scenario dropdown
  const testScenarioEl = $("testScenario");
  if (testScenarioEl) {
    for (const s of manualMiniTrackScenarios) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      testScenarioEl.appendChild(opt);
    }
  }

  const updatedEl = $("updated");
  if (updatedEl) {
    const d = new Date(document.lastModified);
    updatedEl.textContent = Number.isFinite(d.valueOf()) ? `Updated ${d.toLocaleDateString()}` : "";
  }

  $("rollSeed").addEventListener("click", () => {
    $("seed").value = String(Math.floor(Math.random() * 1_000_000));
  });

function readParams() {
  const seedRaw = $("seed").value.trim();
  const seed = seedRaw ? Number(seedRaw) : Date.now();
  const length = Math.min(750, Math.max(10, Number($("length").value)));
  const checkpointDensity = Number($("checkpointDensity").value);
  const numCheckpoints = checkpointCountFromDensity(length, checkpointDensity);
  const { curviness, turnStyle } = mapCurvinessProfile($("curvinessProfile").value);
  const includeJumps = !!$("includeJumps")?.checked;
  const includeIntersections = !!$("includeIntersections")?.checked;
  return {
    name: $("name").value || "Generated Track",
    length,
    elevation: mapElevationProfile($("elevationProfile").value),
    curviness,
    turnStyle,
    numCheckpoints,
    environment: $("environment").value,
    includePillars: $("pillars")?.checked || false,
    maxHeight: Number($("maxHeight").value),
    maxAttemptsPerPiece: Number($("maxAttemptsPerPiece").value),
    allowSteepSlopes: $("allowSteepSlopes").checked,
    allowIntersections: includeIntersections,
    intersectionChance: includeIntersections ? 0.3 : 0,
    jumpChance: includeJumps ? 0.2 : 0,
    format: "polytrack1",
    seed,
  };
}

function renderResults(container, items, statusElId = "status") {
  container.innerHTML = "";

  for (const r of items) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <div class="card-title">${esc(r.name)}</div>
        <div class="card-meta">seed: ${esc(r.seed)}</div>
      </div>
      <div class="code">${esc(r.shareCode)}</div>
      <div class="actions">
        <button class="btn btn-secondary" data-action="copy" type="button">Copy</button>
      </div>
      <details>
        <summary>Show details</summary>
        <div class="desc">${esc(r.details)}</div>
      </details>
    `;

    card.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      try {
        await copyText(r.shareCode);
        setStatus(statusElId, "Copied share code", "good");
        setTimeout(() => setStatus(statusElId, ""), 1200);
      } catch (e) {
        setStatus(statusElId, "Clipboard copy failed", "bad");
      }
    });

    container.appendChild(card);
  }
}

function summarizeResult(result) {
  const trackData = result.trackData;
  let total = 0;
  const counts = new Map();
  for (const [blockType, parts] of trackData.parts) {
    total += parts.length;
    counts.set(blockType, parts.length);
  }
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t, c]) => `${BlockTypeName[t] || t}:${c}`)
    .join(", ");

  const seq = Array.isArray(result.placedSequence) ? result.placedSequence : [];
  const seqLines = seq
    .slice(0, 40)
    .map((p, i) => `${i}: ${BlockTypeName[p.blockType] || p.blockType}  (${p.x},${p.y},${p.z}) rot=${p.rotation}`)
    .join("\n");

  const trace = Array.isArray(result.anchorTrace) ? result.anchorTrace : null;
  const traceLines = trace
    ? trace
        .filter((t) => t && t.after && Number.isFinite(t.x) && Number.isFinite(t.after?.x))
        .map((t, i) => {
          const from = `(${t.x},${t.y},${t.z}) h=${t.heading}`;
          const to = `(${t.after.x},${t.after.y},${t.after.z}) h=${t.after.heading}`;
          const rot = `rot=${t.rotation ?? "?"}`;
          return `${i}: ${t.label}  ${rot}  ${from} -> ${to}`;
        })
        .join("\n")
    : "";

  const manualLine = result.manualScenarioLabel
    ? `\n\nmanualScenario: ${result.manualScenarioLabel} (${result.manualScenarioId || "unknown"})`
    : "";

  const traceBlock = traceLines ? `\n\nanchorTrace:\n${traceLines}` : "";

  return `pieces: ${total}\nbyType(top): ${top}\n\nsequence(first 40):\n${seqLines || "(not available)"}${manualLine}${traceBlock}`;
}

// Main generate button
async function generateBatch() {
  const btn = $("generateBtn");
  btn.disabled = true;
  setStatus("status", "Generating...");

  try {
    const base = readParams();

    const requestedBatch = Number($("batch").value) || 1;
    let batchMax = 50;
    if (base.length >= 3000) batchMax = 3;
    else if (base.length >= 1500) batchMax = 8;
    else if (base.length >= 800) batchMax = 15;
    const batch = Math.max(1, Math.min(batchMax, requestedBatch));

    const results = [];
    for (let i = 0; i < batch; i++) {
      const seed = (base.seed || Date.now()) + i;
      const name = batch > 1 ? `${base.name} #${i + 1}` : base.name;
      const r = generateTrack({ ...base, name, seed });
      results.push({
        name,
        seed,
        shareCode: r.shareCode,
        details: summarizeResult(r),
      });
    }

    const out = $("output");
    renderResults($("results"), results);
    out.style.display = "block";
    const suffix = batch !== requestedBatch ? ` (batch capped at ${batchMax} for performance)` : "";
    setStatus("status", `${results.length} track(s) generated${suffix}`, "good");
  } catch (e) {
    setStatus("status", e?.message || String(e), "bad");
  } finally {
    btn.disabled = false;
  }
}

// Test track generate button
function generateTestTrack() {
  const scenarioId = $("testScenario")?.value;
  if (!scenarioId) return;

  try {
    const r = generateManualMiniTrack({
      scenarioId,
      name: $("name").value || "Test Track",
      environment: $("environment").value || "Summer",
    });

    const container = $("testResults");
    renderResults(container, [{
      name: `Test: ${r.manualScenarioLabel}`,
      seed: "manual",
      shareCode: r.shareCode,
      details: summarizeResult(r),
    }], "testStatus");

    setStatus("testStatus", "Test track generated", "good");
  } catch (e) {
    setStatus("testStatus", e?.message || String(e), "bad");
  }
}

  $("generateBtn").addEventListener("click", generateBatch);
  $("testGenerateBtn")?.addEventListener("click", generateTestTrack);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    if (!$("generateBtn").disabled) generateBatch();
  });
}
