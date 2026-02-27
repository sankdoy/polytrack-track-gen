import { generateTrackFromImageData, imageDataToBinaryMask, maskToPreviewRgba } from "./image-track-core.mjs?v=2026-02-28b";
import { summarizeTrackData } from "./track-web.mjs?v=2026-02-28b";

const hasDOM = typeof document !== "undefined" && typeof window !== "undefined";
const $ = (id) => document.getElementById(id);

const state = {
  imageData: null,
  imageWidth: 0,
  imageHeight: 0,
  sourceImage: null,
};

function setStatus(text, kind = "") {
  const el = $("status");
  if (!el) return;
  el.classList.remove("good", "bad");
  if (kind) el.classList.add(kind);
  el.textContent = text || "";
}

function setImageStatus(text, kind = "") {
  const el = $("imageStatus");
  if (!el) return;
  el.classList.remove("good", "bad");
  if (kind) el.classList.add(kind);
  el.textContent = text || "";
}

function esc(str) {
  const div = document.createElement("div");
  div.textContent = String(str ?? "");
  return div.innerHTML;
}

async function copyText(text) {
  await navigator.clipboard.writeText(text);
}

function bindRange(id, formatter) {
  const input = $(id);
  const out = $(`${id}Val`);
  if (!input || !out) return;
  const fmt = formatter || ((v) => v);

  const update = () => {
    out.textContent = fmt(input.value);
  };

  input.addEventListener("input", update);
  update();
}

function formatLengthMetrics(metrics) {
  return `${metrics.kilometers.toFixed(2)} km | ${metrics.miles.toFixed(2)} mi | ${metrics.centerlineTiles} tiles`;
}

function summarizeTopTypes(trackData) {
  const s = summarizeTrackData(trackData);
  return s.byType || "";
}

function drawImageToCanvas(image, canvas, maxDim = 1400) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas context unavailable");

  const scale = Math.min(1, maxDim / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(2, Math.round(image.naturalWidth * scale));
  const height = Math.max(2, Math.round(image.naturalHeight * scale));

  canvas.width = width;
  canvas.height = height;
  canvas.style.aspectRatio = `${width} / ${height}`;

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return ctx.getImageData(0, 0, width, height);
}

function drawMaskCanvas(canvas, rgba, width, height) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  canvas.width = width;
  canvas.height = height;
  canvas.style.aspectRatio = `${width} / ${height}`;
  const img = new ImageData(rgba, width, height);
  ctx.putImageData(img, 0, 0);
}

function toCanvasPoint(p) {
  return { x: p.x + 0.5, y: p.y + 0.5 };
}

function drawPathOverlay(canvas, path, color = "#d24b1f", lineWidth = 2) {
  if (!path || path.length < 2) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  const p0 = toCanvasPoint(path[0]);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < path.length; i++) {
    const p = toCanvasPoint(path[i]);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.restore();
}

function parseBoolean(id, defaultValue = false) {
  const el = $(id);
  if (!el) return defaultValue;
  return !!el.checked;
}

function parseNumber(id, fallback) {
  const el = $(id);
  const n = Number(el?.value);
  return Number.isFinite(n) ? n : fallback;
}

function readParams() {
  return {
    name: $("name")?.value?.trim() || "Image Trace Track",
    targetLength: parseNumber("targetLength", 60),
    lengthUnit: $("lengthUnit")?.value || "km",
    scaleMode: $("scaleMode")?.value || "best-fit",
    scaleRatio: parseNumber("scaleRatio", 1),
    widthTiles: Math.max(3, parseNumber("widthTiles", 3)),
    metersPerTile: 1,
    threshold: parseNumber("threshold", 140),
    invert: parseBoolean("invert", false),
    closeLoop: parseBoolean("closeLoop", true),
    trimPasses: parseNumber("trimPasses", 1),
    borderEnabled: parseBoolean("borderEnabled", true),
    environment: $("environment")?.value || "Summer",
  };
}

function renderResult(result) {
  const output = $("output");
  const cards = $("results");
  if (!output || !cards) return;

  const diag = result.diagnostics;
  const summary = summarizeTopTypes(result.trackData);
  const lenLine = formatLengthMetrics(result.metrics);

  cards.innerHTML = "";
  const card = document.createElement("div");
  card.className = "result-card";
  card.innerHTML = `
    <div class="result-head">
      <h3>${esc(result.name)}</h3>
      <div class="result-meta">Scale ${esc(diag.scaleMode)} | used ${esc(diag.scaleUsed.toFixed(4))}</div>
    </div>
    <p class="result-line">Track length: ${esc(lenLine)}</p>
    <p class="result-line">Pieces: ${esc(summary)}</p>
    <div class="code">${esc(result.shareCode)}</div>
    <div class="actions">
      <button type="button" class="btn btn-secondary" data-copy="1">Copy Share Code</button>
    </div>
    <details>
      <summary>Diagnostics</summary>
      <pre class="diag">${esc(JSON.stringify(diag, null, 2))}</pre>
    </details>
  `;

  card.querySelector("[data-copy='1']")?.addEventListener("click", async () => {
    try {
      await copyText(result.shareCode);
      setStatus("Share code copied", "good");
    } catch {
      setStatus("Copy failed", "bad");
    }
  });

  cards.appendChild(card);
  output.style.display = "block";
}

function updateScaleRatioVisibility() {
  const mode = $("scaleMode")?.value;
  const wrap = $("scaleRatioWrap");
  if (!wrap) return;
  wrap.style.display = mode === "manual" ? "block" : "none";
}

async function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to decode image"));
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
  });
}

let liveMaskTimer = null;
function scheduleLiveMask() {
  clearTimeout(liveMaskTimer);
  liveMaskTimer = setTimeout(drawLiveMask, 80);
}

function drawLiveMask() {
  if (!state.imageData) return;
  const maskCanvas = $("previewMask");
  if (!maskCanvas) return;
  const threshold = parseNumber("threshold", 140);
  const invert = parseBoolean("invert", false);
  const { mask, width, height } = imageDataToBinaryMask(state.imageData, { threshold, invert });
  const rgba = maskToPreviewRgba(mask, width, height, {
    on: [30, 30, 30, 255],
    off: [245, 242, 235, 255],
  });
  drawMaskCanvas(maskCanvas, rgba, width, height);
}

async function handleImageSelection() {
  const input = $("imageInput");
  const file = input?.files?.[0];
  if (!file) return;

  try {
    const image = await readImageFile(file);
    state.sourceImage = image;

    const originalCanvas = $("previewOriginal");
    if (!originalCanvas) throw new Error("Original preview canvas missing");

    const imageData = drawImageToCanvas(image, originalCanvas, 1400);
    state.imageData = imageData;
    state.imageWidth = imageData.width;
    state.imageHeight = imageData.height;

    setImageStatus(`Loaded ${file.name} (${imageData.width} × ${imageData.height})`, "good");
    setStatus("Image ready. Adjust threshold then generate.");
    drawLiveMask();
  } catch (err) {
    setImageStatus(String(err?.message || err), "bad");
  }
}

function drawDebugViews(result) {
  const maskCanvas = $("previewMask");
  const traceCanvas = $("previewTrace");
  if (!maskCanvas || !traceCanvas) return;

  const w = result.diagnostics.image.width;
  const h = result.diagnostics.image.height;

  const rgba = maskToPreviewRgba(result.debug.trimmedMask, w, h, {
    on: [34, 34, 34, 255],
    off: [247, 244, 238, 255],
  });

  drawMaskCanvas(maskCanvas, rgba, w, h);

  const traceRgba = maskToPreviewRgba(result.debug.trimmedMask, w, h, {
    on: [236, 233, 228, 255],
    off: [236, 233, 228, 255],
  });
  drawMaskCanvas(traceCanvas, traceRgba, w, h);

  drawPathOverlay(traceCanvas, result.debug.tracedPath, "#1f6db6", 1.8);
  drawPathOverlay(traceCanvas, result.debug.sampledPath, "#d24b1f", 1.1);
}

async function runGeneration() {
  if (!state.imageData) {
    setStatus("Select an image first", "bad");
    return;
  }

  const btn = $("generateBtn");
  if (btn) btn.disabled = true;
  setStatus("Generating...");

  try {
    const params = readParams();

    const result = generateTrackFromImageData({
      imageData: state.imageData,
      ...params,
    });

    renderResult(result);
    drawDebugViews(result);
    setStatus("Track generated", "good");
  } catch (err) {
    setStatus(String(err?.message || err), "bad");
  } finally {
    if (btn) btn.disabled = false;
  }
}

if (hasDOM) {
  bindRange("threshold");
  updateScaleRatioVisibility();

  $("scaleMode")?.addEventListener("change", updateScaleRatioVisibility);
  $("imageInput")?.addEventListener("change", () => {
    handleImageSelection();
  });

  $("threshold")?.addEventListener("input", scheduleLiveMask);
  $("invert")?.addEventListener("change", drawLiveMask);

  $("generateBtn")?.addEventListener("click", () => {
    runGeneration();
  });

  const updated = $("updated");
  if (updated) {
    const d = new Date(document.lastModified);
    if (Number.isFinite(d.valueOf())) {
      updated.textContent = `Updated ${d.toLocaleDateString()}`;
    }
  }
}
