const TILE = 4;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rgba(hex, a) {
  const s = String(hex).replace("#", "");
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name);
    const s = String(v || "").trim();
    return s || fallback;
  } catch {
    return fallback;
  }
}

function colorForBlockType(blockType) {
  // Pastel palette (keep the preview fun, not game-accurate).
  if (blockType === 5) return { top: "#B5EAD7", side: "#98D9C8" }; // Start
  if (blockType === 6) return { top: "#FF70A6", side: "#F25A93" }; // Finish
  if (blockType === 52) return { top: "#FFF2CC", side: "#F2E6B7" }; // Checkpoint
  if (blockType === 2 || blockType === 3 || blockType === 38 || blockType === 39 || blockType === 4) return { top: "#FFD6A5", side: "#F2C38E" }; // ramps
  if (blockType === 1 || blockType === 36 || blockType === 83) return { top: "#E8B4F0", side: "#D79DE3" }; // turns
  if (blockType === 19 || blockType === 20 || blockType === 21) return { top: "#A8D5E2", side: "#8BBECE" }; // pillars
  return { top: "#A8D5E2", side: "#8BBECE" }; // straight-ish
}

function applyYawPitch(p, yaw, pitch) {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const x1 = cy * p.x - sy * p.z;
  const z1 = sy * p.x + cy * p.z;
  const y2 = cp * p.y - sp * z1;
  const z2 = sp * p.y + cp * z1;
  return { x: x1, y: y2, z: z2 };
}

function projectToScreen(p, w, h, dist, scale) {
  const denom = Math.max(0.1, p.z + dist);
  const k = scale / denom;
  return {
    x: w * 0.5 + p.x * k,
    y: h * 0.5 - p.y * k,
    k,
    z: p.z,
  };
}

function computeBounds(seq) {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of seq) {
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    minZ = Math.min(minZ, p.z);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
    maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function boxVertices(center, halfSize, height) {
  const hx = halfSize.x, hz = halfSize.z, hy = height;
  const cx = center.x, cy = center.y, cz = center.z;
  return [
    { x: cx - hx, y: cy, z: cz - hz },
    { x: cx + hx, y: cy, z: cz - hz },
    { x: cx + hx, y: cy, z: cz + hz },
    { x: cx - hx, y: cy, z: cz + hz },
    { x: cx - hx, y: cy + hy, z: cz - hz },
    { x: cx + hx, y: cy + hy, z: cz - hz },
    { x: cx + hx, y: cy + hy, z: cz + hz },
    { x: cx - hx, y: cy + hy, z: cz + hz },
  ];
}

function drawPoly(ctx, pts, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

export function createPreview(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas not supported");

  const autoBtn = opts.autoButton || document.getElementById("previewAuto");
  const resetBtn = opts.resetButton || document.getElementById("previewReset");

  const state = {
    yaw: Math.PI * 0.85,
    pitch: Math.PI * 0.22,
    dist: 16,
    scale: 720,
    dragging: false,
    lastX: 0,
    lastY: 0,
    auto: true,
    targetYaw: null,
    targetPitch: null,
    targetDist: null,
    center: { x: 0, y: 0, z: 0 },
    seq: [],
    bounds: null,
    title: "",
  };

  const resize = () => {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  };

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const resetCamera = () => {
    state.yaw = Math.PI * 0.85;
    state.pitch = Math.PI * 0.22;
    state.dist = 16;
    state.targetYaw = null;
    state.targetPitch = null;
    state.targetDist = null;
    if (autoBtn) autoBtn.textContent = state.auto ? "Auto" : "Manual";
  };

  if (autoBtn) {
    autoBtn.textContent = "Auto";
    autoBtn.addEventListener("click", () => {
      state.auto = !state.auto;
      autoBtn.textContent = state.auto ? "Auto" : "Manual";
    });
  }

  if (resetBtn) resetBtn.addEventListener("click", () => resetCamera());

  canvas.addEventListener("pointerdown", (e) => {
    state.dragging = true;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    state.auto = false;
    if (autoBtn) autoBtn.textContent = "Manual";
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;

    state.yaw += dx * 0.008;
    state.pitch = clamp(state.pitch + dy * 0.006, 0.08, 1.35);
  });

  canvas.addEventListener("pointerup", () => { state.dragging = false; });
  canvas.addEventListener("pointercancel", () => { state.dragging = false; });

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    state.dist = clamp(state.dist + delta * 1.2, 6, 60);
    state.auto = false;
    if (autoBtn) autoBtn.textContent = "Manual";
  }, { passive: false });

  const setSequence = (seq, title = "") => {
    state.seq = Array.isArray(seq) ? seq.slice() : [];
    state.title = String(title || "");
    state.bounds = computeBounds(state.seq);
    if (state.bounds) {
      const b = state.bounds;
      state.center = {
        x: ((b.minX + b.maxX) / 2) / TILE,
        y: ((b.minY + b.maxY) / 2),
        z: ((b.minZ + b.maxZ) / 2) / TILE,
      };

      const spanX = Math.max(1, (b.maxX - b.minX) / TILE);
      const spanZ = Math.max(1, (b.maxZ - b.minZ) / TILE);
      const span = Math.max(spanX, spanZ);
      state.dist = clamp(10 + span * 1.15, 10, 60);
      state.scale = clamp(620 + span * 18, 620, 1200);
    } else {
      state.center = { x: 0, y: 0, z: 0 };
    }
  };

  const draw = () => {
    const w = canvas.width;
    const h = canvas.height;

    const bgTop = cssVar("--previewBgTop", "rgba(112, 214, 255, 0.22)");
    const bgBottom = cssVar("--previewBgBottom", "rgba(181, 234, 215, 0.22)");
    const gridCol = cssVar("--previewGrid", "rgba(27, 36, 51, 0.18)");
    const ink = cssVar("--previewInk", "rgba(27, 36, 51, 0.24)");
    const inkSoft = cssVar("--previewInkSoft", "rgba(27, 36, 51, 0.14)");

    // background
    ctx.clearRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, bgTop);
    bg.addColorStop(1, bgBottom);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // soft "hills"
    const hills = ctx.createRadialGradient(w * 0.5, h * 1.1, 10, w * 0.5, h * 1.05, w * 0.75);
    hills.addColorStop(0, bgBottom);
    hills.addColorStop(1, rgba("B5EAD7", 0));
    ctx.fillStyle = hills;
    ctx.fillRect(0, 0, w, h);

    // auto-rotate
    if (state.auto && state.seq.length) state.yaw += 0.003;

    if (state.targetYaw != null) state.yaw = lerp(state.yaw, state.targetYaw, 0.08);
    if (state.targetPitch != null) state.pitch = lerp(state.pitch, state.targetPitch, 0.08);
    if (state.targetDist != null) state.dist = lerp(state.dist, state.targetDist, 0.08);

    const center = state.center;
    const objects = [];

    // Build render objects from placed pieces
    const half = { x: 0.48, z: 0.48 };
    const height = 0.22;

    for (let i = 0; i < state.seq.length; i++) {
      const p = state.seq[i];
      if (!p) continue;
      // convert to "tile coords"
      const cx = (p.x / TILE) - center.x;
      const cz = (p.z / TILE) - center.z;
      const cy = p.y - center.y;

      // Lift slightly so we can see ground separation.
      const c = { x: cx, y: cy * 0.9, z: cz };
      const verts = boxVertices(c, half, height);
      const rotated = verts.map((v) => applyYawPitch(v, state.yaw, state.pitch));
      const depth = rotated.reduce((acc, v) => acc + v.z, 0) / rotated.length;
      objects.push({ p, rotated, depth, c });
    }

    objects.sort((a, b) => a.depth - b.depth);

    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 520));

    // Draw a subtle ground grid
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = gridCol;
    ctx.beginPath();
    for (let t = -20; t <= 20; t++) {
      const a0 = applyYawPitch({ x: t, y: -center.y * 0.9 - 0.2, z: -20 }, state.yaw, state.pitch);
      const a1 = applyYawPitch({ x: t, y: -center.y * 0.9 - 0.2, z: 20 }, state.yaw, state.pitch);
      const b0 = applyYawPitch({ x: -20, y: -center.y * 0.9 - 0.2, z: t }, state.yaw, state.pitch);
      const b1 = applyYawPitch({ x: 20, y: -center.y * 0.9 - 0.2, z: t }, state.yaw, state.pitch);

      const pa0 = projectToScreen(a0, w, h, state.dist, state.scale);
      const pa1 = projectToScreen(a1, w, h, state.dist, state.scale);
      const pb0 = projectToScreen(b0, w, h, state.dist, state.scale);
      const pb1 = projectToScreen(b1, w, h, state.dist, state.scale);
      ctx.moveTo(pa0.x, pa0.y); ctx.lineTo(pa1.x, pa1.y);
      ctx.moveTo(pb0.x, pb0.y); ctx.lineTo(pb1.x, pb1.y);
    }
    ctx.stroke();
    ctx.restore();

    // Draw pieces
    for (const o of objects) {
      const col = colorForBlockType(o.p.blockType);
      const pts = o.rotated.map((v) => projectToScreen(v, w, h, state.dist, state.scale));

      // Top face (4..7)
      drawPoly(ctx, [pts[4], pts[5], pts[6], pts[7]], rgba(col.top, 0.92), inkSoft);
      // Right-ish face (1,2,6,5)
      drawPoly(ctx, [pts[1], pts[2], pts[6], pts[5]], rgba(col.side, 0.52), inkSoft);
      // Front-ish face (2,3,7,6)
      drawPoly(ctx, [pts[2], pts[3], pts[7], pts[6]], rgba(col.side, 0.42), inkSoft);

      // Direction hint
      const rot = Number.isFinite(o.p.rotation) ? (o.p.rotation | 0) : 0;
      const dir = rot === 0 ? { x: 0, z: -0.35 } : rot === 1 ? { x: -0.35, z: 0 } : rot === 2 ? { x: 0, z: 0.35 } : { x: 0.35, z: 0 };
      const tip3 = applyYawPitch({ x: o.c.x + dir.x, y: o.c.y + height + 0.02, z: o.c.z + dir.z }, state.yaw, state.pitch);
      const c3 = applyYawPitch({ x: o.c.x, y: o.c.y + height + 0.02, z: o.c.z }, state.yaw, state.pitch);
      const tip = projectToScreen(tip3, w, h, state.dist, state.scale);
      const cc = projectToScreen(c3, w, h, state.dist, state.scale);
      ctx.strokeStyle = ink;
      ctx.beginPath();
      ctx.moveTo(cc.x, cc.y);
      ctx.lineTo(tip.x, tip.y);
      ctx.stroke();
    }

    // Path line
    if (state.seq.length >= 2) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(w, h) / 280));
      ctx.beginPath();
      for (let i = 0; i < state.seq.length; i++) {
        const p = state.seq[i];
        const pt3 = applyYawPitch(
          {
            x: (p.x / TILE) - center.x,
            y: (p.y - center.y) * 0.9 + 0.34,
            z: (p.z / TILE) - center.z,
          },
          state.yaw,
          state.pitch
        );
        const s = projectToScreen(pt3, w, h, state.dist, state.scale);
        if (i === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Empty hint
    if (!state.seq.length) {
      ctx.save();
      ctx.fillStyle = ink;
      ctx.font = `${Math.max(12, Math.floor(Math.min(w, h) / 26))}px ui-rounded, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Generate a track to preview it", w / 2, h / 2);
      ctx.restore();
    }

    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);

  return {
    setSequence,
    resetCamera,
    dispose() { ro.disconnect(); },
  };
}
