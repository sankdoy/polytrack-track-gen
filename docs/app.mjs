import { generateTrack, generateManualMiniTrack, manualMiniTrackScenarios, BlockTypeName } from "./track-web.mjs?v=2026-02-11.26";

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

function setStatus(text, kind) {
  const s = $("status");
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
  bindRange("intersectionChance", (v) => Number(v).toFixed(2));
  bindRange("templateChance", (v) => Number(v).toFixed(2));

  const manualScenarioEl = $("manualScenario");
  if (manualScenarioEl) {
    for (const s of manualMiniTrackScenarios) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = s.label;
      manualScenarioEl.appendChild(opt);
    }
  }

  const updatedEl = $("updated");
  if (updatedEl) {
    const d = new Date(document.lastModified);
    updatedEl.textContent = Number.isFinite(d.valueOf()) ? ` Updated ${d.toLocaleDateString()}` : "";
  }

  $("rollSeed").addEventListener("click", () => {
    $("seed").value = String(Math.floor(Math.random() * 1_000_000));
  });

function readParams() {
  const seedRaw = $("seed").value.trim();
  const seed = seedRaw ? Number(seedRaw) : Date.now();
  return {
    name: $("name").value || "Generated Track",
    manualScenarioId: $("manualScenario")?.value || "",
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
    intersectionChance: Number($("intersectionChance").value),
    templateChance: Number($("templateChance").value),
    format: "polytrack1",
    seed,
  };
}

function renderResults(items) {
  const out = $("output");
  const container = $("results");
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
        setStatus("Copied share code", "good");
        setTimeout(() => setStatus(""), 1200);
      } catch (e) {
        setStatus("Clipboard copy failed", "bad");
      }
    });

    container.appendChild(card);
  }

  out.style.display = "block";
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

async function generateBatch() {
  const btn = $("generateBtn");
  btn.disabled = true;
  setStatus("Generating…");

  try {
    const base = readParams();

    if (base.manualScenarioId) {
      const r = generateManualMiniTrack({
        scenarioId: base.manualScenarioId,
        name: base.name,
        environment: base.environment,
      });
      renderResults([
        {
          name: `${base.name} — ${r.manualScenarioLabel}`,
          seed: "manual",
          shareCode: r.shareCode,
          details: summarizeResult(r),
        },
      ]);
      setStatus("Manual mini-track generated", "good");
      return;
    }

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

    renderResults(results);
    const suffix = batch !== requestedBatch ? ` (batch capped at ${batchMax} for performance)` : "";
    setStatus(`${results.length} track(s) generated${suffix}`, "good");
  } catch (e) {
    setStatus(e?.message || String(e), "bad");
  } finally {
    btn.disabled = false;
  }
}

  $("generateBtn").addEventListener("click", generateBatch);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("generateBtn").disabled) generateBatch();
  });
}
