import { generateTrack, generateManualMiniTrack, manualMiniTrackScenarios, BlockTypeName } from "./track-web.mjs?v=2026-02-13";
import { generateWipTrack } from "./track-wip.mjs?v=2026-02-13";

const $ = (id) => document.getElementById(id);
const hasDOM = typeof document !== "undefined" && typeof window !== "undefined";

function bindRange(id, formatter) {
  const el = $(id);
  const val = $(id + "Val");
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

if (hasDOM) {
  bindRange("length");
  bindRange("elevation");
  bindRange("curviness");
  bindRange("checkpoints");
  bindRange("maxHeight");
  bindRange("maxAttemptsPerPiece");
  bindRange("templateChance", (v) => Number(v).toFixed(2));
  bindRange("jumpChance", (v) => Number(v).toFixed(2));

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
  return {
    name: $("name").value || "Generated Track",
    length: Math.min(750, Math.max(10, Number($("length").value))),
    elevation: Number($("elevation").value),
    curviness: Number($("curviness").value),
    numCheckpoints: Number($("checkpoints").value),
    environment: $("environment").value,
    includeScenery: $("scenery").checked,
    includePillars: $("pillars")?.checked || false,
    maxHeight: Number($("maxHeight").value),
    maxAttemptsPerPiece: Number($("maxAttemptsPerPiece").value),
    allowSteepSlopes: $("allowSteepSlopes").checked,
    allowIntersections: $("allowIntersections").checked,
    intersectionChance: 0.3, // fixed internal value when intersections enabled
    templateChance: Number($("templateChance").value),
    jumpChance: Number($("jumpChance").value),
    format: "polytrack1",
    seed,
  };
}

function renderResults(container, items) {
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
        setStatus("status", "Copied share code", "good");
        setTimeout(() => setStatus("status", ""), 1200);
      } catch (e) {
        setStatus("status", "Clipboard copy failed", "bad");
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
    }]);

    setStatus("testStatus", "Test track generated", "good");
  } catch (e) {
    setStatus("testStatus", e?.message || String(e), "bad");
  }
}

  $("generateBtn").addEventListener("click", generateBatch);
  $("testGenerateBtn")?.addEventListener("click", generateTestTrack);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("generateBtn").disabled) generateBatch();
  });
}
