/* eslint-disable */

import {
  BlockType,
  Environment,
  RotationAxis,
  ColorStyle,
  TrackData,
  encodePolyTrack1ShareCode,
} from "./track-web.mjs";

const TILE = 4;
// Exact piece palette from user-supplied fixed reference track.
const REFERENCE_BLOCK = {
  ROAD: 25,
  TURN_LEFT: 11,
  TURN_RIGHT: 12,
  BORDER: 10,
  CHECKPOINT_ALT: 75,
  FINISH_MARKER_ALT: 76,
  FINISH: 77,
  FINISH_MARKER: 78,
  START: 92,
  START_ALT: 93,
};

export const REFERENCE_PALETTE = Object.freeze({ ...REFERENCE_BLOCK });

const DIR4 = [
  { x: 0, y: -1 }, // 0 north
  { x: -1, y: 0 }, // 1 west
  { x: 0, y: 1 },  // 2 south
  { x: 1, y: 0 },  // 3 east
];

const DIR8 = [
  { x: -1, y: -1 },
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 0 },
  { x: 1, y: 0 },
  { x: -1, y: 1 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function idxOf(x, y, width) {
  return y * width + x;
}

function keyOf(x, y) {
  return `${x},${y}`;
}

function parseKey(key) {
  const i = key.indexOf(",");
  return { x: Number(key.slice(0, i)), y: Number(key.slice(i + 1)) };
}

function sqr(v) {
  return v * v;
}

function dist(a, b) {
  return Math.sqrt(sqr(a.x - b.x) + sqr(a.y - b.y));
}

function samePoint(a, b) {
  return !!a && !!b && a.x === b.x && a.y === b.y;
}

function ensureImageDataLike(imageData) {
  if (!imageData || typeof imageData.width !== "number" || typeof imageData.height !== "number" || !imageData.data) {
    throw new Error("imageData must contain width, height, and data");
  }
  const width = imageData.width | 0;
  const height = imageData.height | 0;
  if (width < 2 || height < 2) throw new Error("image is too small");
  const expected = width * height * 4;
  if (imageData.data.length < expected) {
    throw new Error("imageData.data length is invalid");
  }
}

export function imageDataToBinaryMask(imageData, {
  threshold = 140,
  invert = false,
  alphaCutoff = 16,
} = {}) {
  ensureImageDataLike(imageData);

  const width = imageData.width | 0;
  const height = imageData.height | 0;
  const data = imageData.data;
  const out = new Uint8Array(width * height);

  const t = clamp(Number(threshold) || 0, 0, 255);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < alphaCutoff) continue;

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const isTrack = invert ? luma > t : luma < t;
      out[y * width + x] = isTrack ? 1 : 0;
    }
  }

  return { mask: out, width, height };
}

/**
 * Extract the outer perimeter ring of a binary mask.
 * Returns a new mask where only cells adjacent to the exterior (background reachable
 * from the image border) are set. This converts a filled road-surface image into a
 * 1-cell-wide boundary ring — the correct input for skeleton tracing.
 */
export function extractOuterBoundary(mask, width, height) {
  const len = width * height;
  const exterior = new Uint8Array(len);
  const queue = [];

  // Seed flood fill from every image-edge pixel that is background
  for (let x = 0; x < width; x++) {
    const top = x;
    const bot = (height - 1) * width + x;
    if (!mask[top] && !exterior[top]) { exterior[top] = 1; queue.push(top); }
    if (!mask[bot] && !exterior[bot]) { exterior[bot] = 1; queue.push(bot); }
  }
  for (let y = 1; y < height - 1; y++) {
    const left = y * width;
    const right = y * width + width - 1;
    if (!mask[left] && !exterior[left]) { exterior[left] = 1; queue.push(left); }
    if (!mask[right] && !exterior[right]) { exterior[right] = 1; queue.push(right); }
  }

  // BFS: flood all exterior background cells (4-connected)
  let head = 0;
  while (head < queue.length) {
    const i = queue[head++];
    const x = i % width;
    const y = (i / width) | 0;
    for (let k = 0; k < DIR4.length; k++) {
      const nx = x + DIR4[k].x;
      const ny = y + DIR4[k].y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const ni = ny * width + nx;
      if (exterior[ni] || mask[ni]) continue;
      exterior[ni] = 1;
      queue.push(ni);
    }
  }

  // Boundary: "on" cells with at least one exterior-facing (4-connected) neighbour
  const boundary = new Uint8Array(len);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!mask[i]) continue;
      let isBoundary = false;
      for (let k = 0; k < DIR4.length; k++) {
        const nx = x + DIR4[k].x;
        const ny = y + DIR4[k].y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height || exterior[ny * width + nx]) {
          isBoundary = true;
          break;
        }
      }
      if (isBoundary) boundary[i] = 1;
    }
  }

  return boundary;
}

export function keepLargestComponent(mask, width, height) {
  const len = width * height;
  const seen = new Uint8Array(len);
  let best = [];

  for (let i = 0; i < len; i++) {
    if (!mask[i] || seen[i]) continue;

    const stack = [i];
    const component = [];
    seen[i] = 1;

    while (stack.length) {
      const cur = stack.pop();
      component.push(cur);
      const x = cur % width;
      const y = Math.floor(cur / width);

      for (let k = 0; k < DIR8.length; k++) {
        const nx = x + DIR8[k].x;
        const ny = y + DIR8[k].y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = idxOf(nx, ny, width);
        if (!mask[ni] || seen[ni]) continue;
        seen[ni] = 1;
        stack.push(ni);
      }
    }

    if (component.length > best.length) best = component;
  }

  const out = new Uint8Array(len);
  for (let i = 0; i < best.length; i++) {
    out[best[i]] = 1;
  }
  return out;
}

function neighborCount(mask, width, x, y) {
  let n = 0;
  for (let k = 0; k < DIR8.length; k++) {
    const nx = x + DIR8[k].x;
    const ny = y + DIR8[k].y;
    if (nx < 0 || ny < 0) continue;
    if (nx >= width) continue;
    if (ny >= Math.floor(mask.length / width)) continue;
    if (mask[idxOf(nx, ny, width)]) n++;
  }
  return n;
}

function transitionCount(p2, p3, p4, p5, p6, p7, p8, p9) {
  const arr = [p2, p3, p4, p5, p6, p7, p8, p9, p2];
  let transitions = 0;
  for (let i = 0; i < 8; i++) {
    if (arr[i] === 0 && arr[i + 1] === 1) transitions++;
  }
  return transitions;
}

export function thinMaskZhangSuen(maskIn, width, height, { maxIterations = 80 } = {}) {
  const mask = Uint8Array.from(maskIn);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    const removeA = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idxOf(x, y, width);
        if (!mask[i]) continue;

        const p2 = mask[idxOf(x, y - 1, width)];
        const p3 = mask[idxOf(x + 1, y - 1, width)];
        const p4 = mask[idxOf(x + 1, y, width)];
        const p5 = mask[idxOf(x + 1, y + 1, width)];
        const p6 = mask[idxOf(x, y + 1, width)];
        const p7 = mask[idxOf(x - 1, y + 1, width)];
        const p8 = mask[idxOf(x - 1, y, width)];
        const p9 = mask[idxOf(x - 1, y - 1, width)];

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;

        const a = transitionCount(p2, p3, p4, p5, p6, p7, p8, p9);
        if (a !== 1) continue;

        if (p2 * p4 * p6 !== 0) continue;
        if (p4 * p6 * p8 !== 0) continue;

        removeA.push(i);
      }
    }

    if (removeA.length) {
      changed = true;
      for (let i = 0; i < removeA.length; i++) mask[removeA[i]] = 0;
    }

    const removeB = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idxOf(x, y, width);
        if (!mask[i]) continue;

        const p2 = mask[idxOf(x, y - 1, width)];
        const p3 = mask[idxOf(x + 1, y - 1, width)];
        const p4 = mask[idxOf(x + 1, y, width)];
        const p5 = mask[idxOf(x + 1, y + 1, width)];
        const p6 = mask[idxOf(x, y + 1, width)];
        const p7 = mask[idxOf(x - 1, y + 1, width)];
        const p8 = mask[idxOf(x - 1, y, width)];
        const p9 = mask[idxOf(x - 1, y - 1, width)];

        const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
        if (b < 2 || b > 6) continue;

        const a = transitionCount(p2, p3, p4, p5, p6, p7, p8, p9);
        if (a !== 1) continue;

        if (p2 * p4 * p8 !== 0) continue;
        if (p2 * p6 * p8 !== 0) continue;

        removeB.push(i);
      }
    }

    if (removeB.length) {
      changed = true;
      for (let i = 0; i < removeB.length; i++) mask[removeB[i]] = 0;
    }

    if (!changed) break;
  }

  return mask;
}

export function trimEndpoints(maskIn, width, height, { passes = 0 } = {}) {
  const mask = Uint8Array.from(maskIn);
  const passCount = Math.max(0, Math.floor(passes));

  for (let pass = 0; pass < passCount; pass++) {
    const remove = [];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = idxOf(x, y, width);
        if (!mask[i]) continue;
        const n = neighborCount(mask, width, x, y);
        if (n <= 1) remove.push(i);
      }
    }

    if (!remove.length) break;
    for (let i = 0; i < remove.length; i++) mask[remove[i]] = 0;
  }

  return mask;
}

function buildAdjacency(mask, width, height) {
  const adj = new Map();
  const points = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idxOf(x, y, width);
      if (!mask[i]) continue;
      points.push(i);
      const nbs = [];
      for (let k = 0; k < DIR8.length; k++) {
        const nx = x + DIR8[k].x;
        const ny = y + DIR8[k].y;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = idxOf(nx, ny, width);
        if (mask[ni]) nbs.push(ni);
      }
      adj.set(i, nbs);
    }
  }

  return { adj, points };
}

function edgeKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function chooseBestNext(prev, cur, candidates, width, usedEdges) {
  if (candidates.length <= 1) return candidates[0] ?? null;

  let vx = 0;
  let vy = 0;
  if (prev != null && prev >= 0) {
    const px = prev % width;
    const py = Math.floor(prev / width);
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    vx = cx - px;
    vy = cy - py;
  }

  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < candidates.length; i++) {
    const next = candidates[i];
    const k = edgeKey(cur, next);
    const nx = next % width;
    const ny = Math.floor(next / width);
    const cx = cur % width;
    const cy = Math.floor(cur / width);
    const ux = nx - cx;
    const uy = ny - cy;

    let score = ux * vx + uy * vy;
    if (!usedEdges.has(k)) score += 100;

    if (score > bestScore) {
      bestScore = score;
      best = next;
    }
  }

  return best;
}

function walkPath(start, firstNext, adj, width, maxSteps) {
  const path = [];
  const usedEdges = new Set();

  let prev = start;
  let cur = firstNext;

  path.push(start);
  path.push(cur);
  usedEdges.add(edgeKey(start, cur));

  for (let step = 0; step < maxSteps; step++) {
    if (cur === start) break;

    const nbs = adj.get(cur) || [];
    const forward = [];
    for (let i = 0; i < nbs.length; i++) {
      if (nbs[i] === prev) continue;
      forward.push(nbs[i]);
    }

    if (!forward.length) break;

    const next = chooseBestNext(prev, cur, forward, width, usedEdges);
    if (next == null) break;

    const e = edgeKey(cur, next);
    if (usedEdges.has(e) && next !== start) {
      break;
    }

    prev = cur;
    cur = next;
    path.push(cur);
    usedEdges.add(e);
  }

  return path;
}

function pathIndexesToPoints(path, width) {
  const out = [];
  for (let i = 0; i < path.length; i++) {
    const n = path[i];
    out.push({ x: n % width, y: Math.floor(n / width) });
  }
  return out;
}

export function traceMainPathFromMask(mask, width, height) {
  const { adj, points } = buildAdjacency(mask, width, height);
  if (!points.length) return [];

  const endpoints = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const degree = (adj.get(p) || []).length;
    if (degree === 1) endpoints.push(p);
  }

  let bestPath = [];

  if (endpoints.length) {
    const start = endpoints[0];
    const nbs = adj.get(start) || [];
    if (nbs.length) {
      bestPath = walkPath(start, nbs[0], adj, width, points.length * 8);
    }
  } else {
    const sorted = points
      .slice()
      .sort((a, b) => {
        const ay = Math.floor(a / width);
        const by = Math.floor(b / width);
        if (ay !== by) return ay - by;
        return (a % width) - (b % width);
      });

    const start = sorted[0];
    const nbs = adj.get(start) || [];

    for (let i = 0; i < nbs.length; i++) {
      const trial = walkPath(start, nbs[i], adj, width, points.length * 8);
      if (trial.length > bestPath.length) bestPath = trial;
    }

    if (!bestPath.length) bestPath = [start];
  }

  const pointsPath = pathIndexesToPoints(bestPath, width);
  if (pointsPath.length > 2) {
    const first = pointsPath[0];
    const last = pointsPath[pointsPath.length - 1];
    if (!samePoint(first, last) && dist(first, last) <= 1.8) {
      pointsPath.push({ x: first.x, y: first.y });
    }
  }

  return pointsPath;
}

function pointLineDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return dist(p, a);

  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy), 0, 1);
  const proj = { x: a.x + t * dx, y: a.y + t * dy };
  return dist(p, proj);
}

function rdp(points, epsilon) {
  if (points.length <= 2) return points.slice();

  let maxDist = -1;
  let index = -1;
  const a = points[0];
  const b = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = pointLineDistance(points[i], a, b);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon && index >= 0) {
    const left = rdp(points.slice(0, index + 1), epsilon);
    const right = rdp(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }

  return [a, b];
}

export function simplifyPath(pointsIn, { epsilon = 1.0, closed = true } = {}) {
  if (!Array.isArray(pointsIn) || pointsIn.length < 3) return pointsIn ? pointsIn.slice() : [];
  const points = pointsIn.slice();

  const loop = closed && dist(points[0], points[points.length - 1]) <= 1.8;
  if (!loop) {
    return rdp(points, Math.max(0, Number(epsilon) || 0));
  }

  const base = points.slice(0, -1);
  if (base.length < 3) return points;

  let split = 0;
  for (let i = 1; i < base.length; i++) {
    if (base[i].x < base[split].x || (base[i].x === base[split].x && base[i].y < base[split].y)) {
      split = i;
    }
  }

  const rotated = base.slice(split).concat(base.slice(0, split));
  const simplified = rdp(rotated.concat(rotated[0]), Math.max(0, Number(epsilon) || 0));

  if (!samePoint(simplified[0], simplified[simplified.length - 1])) {
    simplified.push({ ...simplified[0] });
  }
  return simplified;
}

function polylineLength(points, closed) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let total = 0;
  const end = closed ? points.length : points.length - 1;
  for (let i = 0; i < end - 1; i++) total += dist(points[i], points[i + 1]);
  if (closed) {
    const last = points[points.length - 1];
    const first = points[0];
    if (!samePoint(last, first)) total += dist(last, first);
  }
  return total;
}

export function resamplePath(pointsIn, {
  spacing = 2.5,
  closed = true,
  minPoints = 64,
} = {}) {
  if (!Array.isArray(pointsIn) || pointsIn.length < 2) return pointsIn ? pointsIn.slice() : [];

  const points = pointsIn.slice();
  const loop = closed;

  const clean = [];
  for (let i = 0; i < points.length; i++) {
    if (!clean.length || !samePoint(clean[clean.length - 1], points[i])) clean.push(points[i]);
  }
  if (clean.length < 2) return clean;

  if (loop && !samePoint(clean[0], clean[clean.length - 1])) {
    clean.push({ ...clean[0] });
  }

  const cumulative = [0];
  for (let i = 1; i < clean.length; i++) {
    cumulative.push(cumulative[i - 1] + dist(clean[i - 1], clean[i]));
  }

  const total = cumulative[cumulative.length - 1];
  if (!(total > 0)) return clean;

  const desiredBySpacing = Math.max(4, Math.floor(total / Math.max(0.2, Number(spacing) || 0.2)));
  const count = Math.max(minPoints, desiredBySpacing);
  const step = total / count;

  const out = [];
  for (let s = 0; s < count; s++) {
    const d = s * step;

    let seg = 0;
    while (seg + 1 < cumulative.length && cumulative[seg + 1] < d) seg++;

    const a = clean[seg];
    const b = clean[Math.min(seg + 1, clean.length - 1)];
    const segLen = Math.max(1e-9, cumulative[Math.min(seg + 1, cumulative.length - 1)] - cumulative[seg]);
    const t = clamp((d - cumulative[seg]) / segLen, 0, 1);

    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    });
  }

  if (loop) out.push({ ...out[0] });
  return out;
}

function centerPath(points) {
  if (!points.length) return [];
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < points.length; i++) {
    sx += points[i].x;
    sy += points[i].y;
  }
  const cx = sx / points.length;
  const cy = sy / points.length;
  return points.map((p) => ({ x: p.x - cx, y: p.y - cy }));
}

function cardinalLine(a, b) {
  const out = [{ x: a.x, y: a.y }];
  let x = a.x;
  let y = a.y;

  while (x !== b.x || y !== b.y) {
    const dx = b.x - x;
    const dy = b.y - y;

    if (dx !== 0 && dy !== 0) {
      if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx);
      else y += Math.sign(dy);
    } else if (dx !== 0) {
      x += Math.sign(dx);
    } else {
      y += Math.sign(dy);
    }

    out.push({ x, y });
  }

  return out;
}

function collapseBacktracks(points) {
  const out = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];

    if (out.length >= 2 && samePoint(out[out.length - 2], p)) {
      out.pop();
      continue;
    }

    if (!out.length || !samePoint(out[out.length - 1], p)) {
      out.push(p);
    }
  }

  return out;
}

function ensureClosedGrid(points) {
  if (points.length < 2) return points;
  if (!samePoint(points[0], points[points.length - 1])) {
    return points.concat([{ ...points[0] }]);
  }
  return points;
}

export function pathToGrid(pointsIn, {
  scale = 1,
  closed = true,
} = {}) {
  if (!Array.isArray(pointsIn) || pointsIn.length < 2) return [];

  const centered = centerPath(pointsIn);
  const scaled = centered.map((p) => ({
    x: Math.round(p.x * scale),
    y: Math.round(p.y * scale),
  }));

  const base = [];
  for (let i = 0; i < scaled.length; i++) {
    if (!base.length || !samePoint(base[base.length - 1], scaled[i])) base.push(scaled[i]);
  }

  if (base.length < 2) return base;

  const path = [];
  const end = closed ? base.length : base.length - 1;
  for (let i = 0; i < end - 1; i++) {
    const a = base[i];
    const b = base[i + 1];
    const seg = cardinalLine(a, b);
    if (!path.length) path.push(...seg);
    else path.push(...seg.slice(1));
  }

  if (closed) {
    const seg = cardinalLine(base[base.length - 1], base[0]);
    if (seg.length > 1) path.push(...seg.slice(1));
  }

  let out = collapseBacktracks(path);

  if (closed) {
    out = ensureClosedGrid(out);
    if (out.length > 1 && samePoint(out[0], out[out.length - 1])) {
      out = out.slice(0, -1);
    }
  }

  return out;
}

function headingFromStep(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const manhattan = Math.abs(dx) + Math.abs(dy);
  if (manhattan !== 1) return null;
  if (dx === 1) return 3;
  if (dx === -1) return 1;
  if (dy === 1) return 2;
  return 0;
}

function turnRotation(inHeading, outHeading) {
  const delta = (outHeading - inHeading + 4) % 4;
  if (delta === 3) return inHeading; // right turn
  if (delta === 1) return (inHeading + 3) % 4; // left turn
  return inHeading;
}

function chooseStraightPiece(widthTiles) {
  return REFERENCE_BLOCK.ROAD;
}

export function checkpointBlockTypeForOrder(order, total) {
  if (total <= 4) return REFERENCE_BLOCK.FINISH;
  if (order === 0) return REFERENCE_BLOCK.CHECKPOINT_ALT;
  return order % 2 === 1 ? REFERENCE_BLOCK.CHECKPOINT_ALT : REFERENCE_BLOCK.FINISH;
}

function chooseStartBlockType(rotation, roadMap, x, y) {
  let roadNeighborCount = 0;
  const key = (px, py) => `${px},${py}`;
  if (roadMap?.has(key(x + 1, y))) roadNeighborCount++;
  if (roadMap?.has(key(x - 1, y))) roadNeighborCount++;
  if (roadMap?.has(key(x, y + 1))) roadNeighborCount++;
  if (roadMap?.has(key(x, y - 1))) roadNeighborCount++;

  // Calibrated from fixed box track: low-degree start with rot=0 prefers StartAlt(93).
  if (rotation === 0 && roadNeighborCount <= 2) return REFERENCE_BLOCK.START_ALT;
  return REFERENCE_BLOCK.START;
}

const BORDER_MASK_TO_PIECE = Object.freeze({
  ES: { blockType: REFERENCE_BLOCK.TURN_RIGHT, rotation: 0 },
  NE: { blockType: REFERENCE_BLOCK.TURN_RIGHT, rotation: 1 },
  NW: { blockType: REFERENCE_BLOCK.TURN_RIGHT, rotation: 2 },
  SW: { blockType: REFERENCE_BLOCK.TURN_RIGHT, rotation: 3 },
  NES: { blockType: REFERENCE_BLOCK.BORDER, rotation: 2 },
  NEW: { blockType: REFERENCE_BLOCK.BORDER, rotation: 3 },
  NSW: { blockType: REFERENCE_BLOCK.BORDER, rotation: 0 },
  ESW: { blockType: REFERENCE_BLOCK.BORDER, rotation: 1 },
  NESW: { blockType: REFERENCE_BLOCK.TURN_LEFT, rotation: 0 },
});

function roadHasCell(roadMap, x, y) {
  return !!roadMap && roadMap.has(keyOf(x, y));
}

function shouldUseTurnLeftCorner(mask, x, y, roadMap) {
  if (!roadMap) return false;

  if (mask === "ES") {
    return roadHasCell(roadMap, x - 1, y - 1);
  }
  if (mask === "NE") {
    return roadHasCell(roadMap, x - 1, y + 1);
  }
  if (mask === "NW") {
    return roadHasCell(roadMap, x + 1, y + 1);
  }
  if (mask === "SW") {
    return roadHasCell(roadMap, x + 1, y - 1);
  }

  return false;
}

export function pickBorderPieceForMask(mask, fallbackRotation = 0, context = null) {
  const fb = ((Number(fallbackRotation) || 0) % 4 + 4) % 4;
  const x = context?.x;
  const y = context?.y;
  const roadMap = context?.roadMap;
  const preferRoadAxis = !!context?.preferRoadAxis;

  const roadN = roadHasCell(roadMap, x, y - 1);
  const roadE = roadHasCell(roadMap, x + 1, y);
  const roadS = roadHasCell(roadMap, x, y + 1);
  const roadW = roadHasCell(roadMap, x - 1, y);

  // If a border cell touches road only on one axis, treat it as a straight side wall.
  // This prevents open-end mouths from collapsing into corner pieces.
  if (preferRoadAxis && (roadE !== roadW) && !roadN && !roadS) {
    return { blockType: REFERENCE_BLOCK.BORDER, rotation: roadE ? 2 : 0 };
  }
  if (preferRoadAxis && (roadN !== roadS) && !roadE && !roadW) {
    return { blockType: REFERENCE_BLOCK.BORDER, rotation: roadS ? 1 : 3 };
  }

  const entry = BORDER_MASK_TO_PIECE[mask];
  if (entry) {
    if (
      entry.blockType === REFERENCE_BLOCK.TURN_RIGHT
      && shouldUseTurnLeftCorner(mask, context?.x, context?.y, context?.roadMap)
    ) {
      return { blockType: REFERENCE_BLOCK.TURN_LEFT, rotation: entry.rotation };
    }
    return entry;
  }
  if (mask === "NS") {
    if (preferRoadAxis && roadE && !roadW) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 2 };
    if (preferRoadAxis && roadW && !roadE) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 0 };
    return { blockType: REFERENCE_BLOCK.BORDER, rotation: fb % 2 === 0 ? fb : 0 };
  }
  if (mask === "EW") {
    if (preferRoadAxis && roadS && !roadN) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 1 };
    if (preferRoadAxis && roadN && !roadS) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 3 };
    return { blockType: REFERENCE_BLOCK.BORDER, rotation: fb % 2 === 1 ? fb : 1 };
  }
  if (mask === "N" || mask === "S") {
    if (preferRoadAxis && roadE && !roadW) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 2 };
    if (preferRoadAxis && roadW && !roadE) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 0 };
    return { blockType: REFERENCE_BLOCK.BORDER, rotation: 0 };
  }
  if (mask === "E" || mask === "W") {
    if (preferRoadAxis && roadS && !roadN) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 1 };
    if (preferRoadAxis && roadN && !roadS) return { blockType: REFERENCE_BLOCK.BORDER, rotation: 3 };
    return { blockType: REFERENCE_BLOCK.BORDER, rotation: 1 };
  }
  return { blockType: REFERENCE_BLOCK.BORDER, rotation: fb };
}

export function centerlineToPieces(cells, {
  closed = true,
  widthTiles = 1,
} = {}) {
  if (!Array.isArray(cells) || cells.length < 2) {
    throw new Error("Not enough path points after tracing");
  }

  const n = cells.length;
  const out = [];

  for (let i = 0; i < n; i++) {
    const curr = cells[i];

    let prev;
    let next;

    if (closed) {
      prev = cells[(i - 1 + n) % n];
      next = cells[(i + 1) % n];
    } else {
      prev = i > 0 ? cells[i - 1] : null;
      next = i + 1 < n ? cells[i + 1] : null;
    }

    let inHeading = null;
    let outHeading = null;

    if (prev) inHeading = headingFromStep(prev, curr);
    if (next) outHeading = headingFromStep(curr, next);

    if (inHeading == null && outHeading == null) {
      continue;
    }
    if (inHeading == null) inHeading = outHeading;
    if (outHeading == null) outHeading = inHeading;

    let blockType;
    let rotation;
    let startOrder = null;

    if (i === 0) {
      blockType = REFERENCE_BLOCK.START;
      rotation = outHeading;
      startOrder = 0;
    } else if (inHeading === outHeading) {
      blockType = chooseStraightPiece(widthTiles);
      rotation = outHeading;
    } else {
      const delta = (outHeading - inHeading + 4) % 4;
      if (delta === 1) {
        blockType = REFERENCE_BLOCK.TURN_LEFT;
      } else if (delta === 3) {
        blockType = REFERENCE_BLOCK.TURN_RIGHT;
      } else {
        blockType = chooseStraightPiece(widthTiles);
      }
      rotation = turnRotation(inHeading, outHeading);
    }

    out.push({
      x: curr.x,
      y: curr.y,
      inHeading,
      outHeading,
      blockType,
      rotation,
      startOrder,
    });
  }

  return out;
}

function addHeadingVote(bucket, heading) {
  const key = String(heading);
  bucket[key] = (bucket[key] || 0) + 1;
}

function dominantHeading(votes, fallback = 0) {
  const entries = Object.entries(votes || {});
  if (!entries.length) return fallback;
  entries.sort((a, b) => b[1] - a[1]);
  return Number(entries[0][0]) || fallback;
}

function addRoadCell(roadMap, x, y, heading) {
  const key = keyOf(x, y);
  let cell = roadMap.get(key);
  if (!cell) {
    cell = { x, y, votes: {} };
    roadMap.set(key, cell);
  }
  addHeadingVote(cell.votes, heading);
}

function perpendicularOffsetsForHeading(heading) {
  const left = DIR4[(heading + 1) % 4];
  const right = DIR4[(heading + 3) % 4];
  return { left, right };
}

export function expandRoadWidth(centerlinePieces, { widthTiles = 1 } = {}) {
  const roadMap = new Map();
  const radius = Math.max(0, Math.round((Math.max(1, Number(widthTiles) || 1) - 1) / 2));

  for (let i = 0; i < centerlinePieces.length; i++) {
    const p = centerlinePieces[i];
    const heading = p.outHeading ?? p.inHeading ?? p.rotation ?? 0;

    addRoadCell(roadMap, p.x, p.y, heading);

    if (radius <= 0) continue;

    const { left, right } = perpendicularOffsetsForHeading(heading);
    for (let d = 1; d <= radius; d++) {
      addRoadCell(roadMap, p.x + left.x * d, p.y + left.y * d, heading);
      addRoadCell(roadMap, p.x + right.x * d, p.y + right.y * d, heading);
    }

    // At turn cells, also expand along the incoming heading's perpendicular to
    // fill the corner notch that the outHeading-only expansion leaves open.
    // Without this, the flood fill can squeeze through the notch and misclassify
    // interior-side border cells as outer, producing pieces inside the track.
    if (p.inHeading != null && p.inHeading !== heading) {
      const { left: li, right: ri } = perpendicularOffsetsForHeading(p.inHeading);
      for (let d = 1; d <= radius; d++) {
        addRoadCell(roadMap, p.x + li.x * d, p.y + li.y * d, p.inHeading);
        addRoadCell(roadMap, p.x + ri.x * d, p.y + ri.y * d, p.inHeading);
      }
    }
  }

  return roadMap;
}

function countRoadNeighbors4(roadMap, x, y) {
  let n = 0;
  if (roadMap.has(keyOf(x, y - 1))) n++;
  if (roadMap.has(keyOf(x + 1, y))) n++;
  if (roadMap.has(keyOf(x, y + 1))) n++;
  if (roadMap.has(keyOf(x - 1, y))) n++;
  return n;
}

export function buildBorderFromRoad(roadMap) {
  const borderMap = new Map();

  for (const cell of roadMap.values()) {
    for (let h = 0; h < 4; h++) {
      const nx = cell.x + DIR4[h].x;
      const ny = cell.y + DIR4[h].y;
      const nKey = keyOf(nx, ny);
      if (roadMap.has(nKey)) continue;

      let border = borderMap.get(nKey);
      if (!border) {
        border = { x: nx, y: ny, votes: {} };
        borderMap.set(nKey, border);
      }

      // Orient barrier/fence to run along road edge.
      const tangentHeading = (h + 1) % 4;
      addHeadingVote(border.votes, tangentHeading);
    }
  }

  return borderMap;
}

function boundsForRoadMap(roadMap) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const cell of roadMap.values()) {
    minX = Math.min(minX, cell.x);
    maxX = Math.max(maxX, cell.x);
    minY = Math.min(minY, cell.y);
    maxY = Math.max(maxY, cell.y);
  }

  if (!Number.isFinite(minX)) return null;
  return { minX, maxX, minY, maxY };
}


function floodOutsideEmpty(roadMap, bounds, padding = 2, extraBarrier = null) {
  const x0 = bounds.minX - padding;
  const x1 = bounds.maxX + padding;
  const y0 = bounds.minY - padding;
  const y1 = bounds.maxY + padding;
  const outside = new Set();
  const queue = [];

  const enqueue = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return;
    const k = keyOf(x, y);
    if (outside.has(k)) return;
    if (roadMap.has(k)) return;
    if (extraBarrier && extraBarrier.has(k)) return;
    outside.add(k);
    queue.push([x, y]);
  };

  enqueue(x0, y0);

  let qi = 0;
  while (qi < queue.length) {
    const [x, y] = queue[qi++];
    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  return { outside, x0, x1, y0, y1 };
}

export function splitBorderMapByOutsideReachability(roadMap, borderMap, { padding = 2 } = {}) {
  const bounds = boundsForRoadMap(roadMap);
  if (!bounds) {
    return {
      outerBorderMap: new Map(),
      innerBorderMap: new Map(),
      outsideEmpty: new Set(),
      bounds: null,
    };
  }

  const pad = Math.max(1, Number(padding) || 1);

  // Flood 1 (road-only barrier): used for outsideEmpty return value and outer bridge pass.
  const flooded = floodOutsideEmpty(roadMap, bounds, pad);

  // Flood 2 (road + border barrier): used for inner/outer classification.
  // Border cells act as an additional sealing layer, preventing the flood from
  // entering the loop interior through road gaps at hairpin turns or diagonal
  // corners.  A border cell is outer iff it is ADJACENT to the exterior flood;
  // inner otherwise.  This handles degenerate centerline polygons (e.g. straight
  // diagonal lines) and disconnected road components at tight turns.
  const classifyFlood = floodOutsideEmpty(roadMap, bounds, pad, borderMap);

  const outerBorderMap = new Map();
  const innerBorderMap = new Map();

  for (const cell of borderMap.values()) {
    const k = keyOf(cell.x, cell.y);
    const x = cell.x, y = cell.y;
    const adjacentToExterior = (
      classifyFlood.outside.has(keyOf(x + 1, y)) ||
      classifyFlood.outside.has(keyOf(x - 1, y)) ||
      classifyFlood.outside.has(keyOf(x, y + 1)) ||
      classifyFlood.outside.has(keyOf(x, y - 1))
    );
    if (adjacentToExterior) {
      outerBorderMap.set(k, cell);
    } else {
      innerBorderMap.set(k, cell);
    }
  }

  return {
    outerBorderMap,
    innerBorderMap,
    outsideEmpty: flooded.outside,
    bounds: { ...bounds, x0: flooded.x0, x1: flooded.x1, y0: flooded.y0, y1: flooded.y1 },
  };
}

export function buildInnerBorderFromRoad(roadMap, {
  padding = 2,
  orthogonalBridges = true,
} = {}) {
  const borderMap = buildBorderFromRoad(roadMap);
  const split = splitBorderMapByOutsideReachability(roadMap, borderMap, { padding });
  const innerBorderMap = new Map(split.innerBorderMap);

  if (!orthogonalBridges || !split.bounds) return innerBorderMap;
  const baseInner = new Set(innerBorderMap.keys());
  const toAdd = [];

  const hasBaseInner = (x, y) => baseInner.has(keyOf(x, y));

  for (let y = split.bounds.y0; y <= split.bounds.y1; y++) {
    for (let x = split.bounds.x0; x <= split.bounds.x1; x++) {
      const k = keyOf(x, y);
      if (roadMap.has(k)) continue;
      if (split.outsideEmpty.has(k)) continue;
      if (innerBorderMap.has(k)) continue;
      const n = hasBaseInner(x, y - 1);
      const e = hasBaseInner(x + 1, y);
      const s = hasBaseInner(x, y + 1);
      const w = hasBaseInner(x - 1, y);
      if (!((n && e) || (e && s) || (s && w) || (w && n))) continue;
      toAdd.push({ x, y });
    }
  }

  for (const cell of toAdd) {
    innerBorderMap.set(keyOf(cell.x, cell.y), { x: cell.x, y: cell.y, votes: { 0: 1 } });
  }

  return innerBorderMap;
}

function endpointHeadingForOpening(piece, isStart) {
  if (isStart) {
    const out = piece?.outHeading ?? piece?.inHeading ?? piece?.rotation ?? 0;
    return (out + 2) % 4;
  }
  return piece?.inHeading ?? piece?.outHeading ?? piece?.rotation ?? 0;
}

export function pruneOpenEndCaps(borderMap, centerlinePieces, widthTiles = 1) {
  if (!(borderMap instanceof Map)) return borderMap;
  if (!Array.isArray(centerlinePieces) || centerlinePieces.length < 2) return borderMap;

  const radius = Math.max(0, Math.round((Math.max(1, Number(widthTiles) || 1) - 1) / 2));
  const out = new Map(borderMap);

  const endpoints = [
    { piece: centerlinePieces[0], isStart: true },
    { piece: centerlinePieces[centerlinePieces.length - 1], isStart: false },
  ];

  for (const ep of endpoints) {
    const p = ep.piece;
    if (!p) continue;
    const heading = endpointHeadingForOpening(p, ep.isStart);
    const dir = DIR4[heading] || DIR4[0];
    const left = DIR4[(heading + 1) % 4];
    const right = DIR4[(heading + 3) % 4];

    const cx = p.x + dir.x;
    const cy = p.y + dir.y;
    out.delete(keyOf(cx, cy));

    for (let d = 1; d <= radius; d++) {
      out.delete(keyOf(cx + left.x * d, cy + left.y * d));
      out.delete(keyOf(cx + right.x * d, cy + right.y * d));
    }
  }

  return out;
}

function mapEnvironment(env) {
  if (typeof env === "number") {
    if (env === 0 || env === 1 || env === 2 || env === 3) return env;
    return Environment.Summer;
  }

  const key = String(env || "Summer").trim().toLowerCase();
  if (key === "winter") return Environment.Winter;
  if (key === "desert") return Environment.Desert;
  if (key === "default") return Environment.Default;
  return Environment.Summer;
}

function lengthToMeters(value, unit) {
  const n = Math.max(0, Number(value) || 0);
  const u = String(unit || "km").toLowerCase();
  if (u === "mi" || u === "mile" || u === "miles") return n * 1609.344;
  if (u === "m" || u === "meter" || u === "meters") return n;
  return n * 1000;
}

function normalizeScaleMode(mode) {
  const m = String(mode || "best-fit").toLowerCase();
  if (m === "one-to-one" || m === "1:1") return "one-to-one";
  if (m === "manual") return "manual";
  return "best-fit";
}

function buildMetrics(centerlineCount, closed, metersPerTile) {
  const segments = closed ? centerlineCount : Math.max(0, centerlineCount - 1);
  const meters = segments * metersPerTile;
  return {
    centerlineTiles: segments,
    meters,
    kilometers: meters / 1000,
    miles: meters / 1609.344,
  };
}

export function planToTrackData(plan, {
  environment = Environment.Summer,
  borderPiece = REFERENCE_BLOCK.BORDER,
  borderEnabled = true,
  innerBorderEnabled = false,
  fillPiece = null,
  emitCheckpoints = true,
} = {}) {
  const env = mapEnvironment(environment);
  const trackData = new TrackData(env, 28);
  const seen = new Set();

  const add = (x, y, blockType, rotation, checkpointOrder = null, startOrder = null) => {
    const key = `${blockType}|${x}|${y}|${rotation}|${checkpointOrder ?? ""}|${startOrder ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    trackData.addPart(
      x * TILE,
      0,
      y * TILE,
      blockType,
      rotation,
      RotationAxis.YPositive,
      ColorStyle.Default,
      checkpointOrder,
      startOrder,
    );
  };

  const centerlineSet = new Set();
  const checkpointIndices = new Map();

  if (emitCheckpoints) {
    const cpCount = Math.max(1, Math.min(8, Math.round(plan.centerlinePieces.length / 28)));
    for (let i = 0; i < cpCount; i++) {
      const idx = Math.max(1, Math.min(plan.centerlinePieces.length - 1, Math.floor(((i + 1) * plan.centerlinePieces.length) / (cpCount + 1))));
      if (!checkpointIndices.has(idx)) checkpointIndices.set(idx, checkpointIndices.size);
    }
  }

  for (let i = 0; i < plan.centerlinePieces.length; i++) {
    const p = plan.centerlinePieces[i];
    centerlineSet.add(keyOf(p.x, p.y));
    let blockType = p.blockType;
    let checkpointOrder = null;
    if (blockType === REFERENCE_BLOCK.START) {
      blockType = chooseStartBlockType(p.rotation, plan.roadMap, p.x, p.y);
    }
    if (emitCheckpoints && checkpointIndices.has(i) && blockType !== REFERENCE_BLOCK.START && blockType !== REFERENCE_BLOCK.START_ALT) {
      checkpointOrder = checkpointIndices.get(i);
      blockType = checkpointBlockTypeForOrder(checkpointOrder, checkpointIndices.size);
    }
    add(p.x, p.y, blockType, p.rotation, checkpointOrder, emitCheckpoints ? p.startOrder : null);
  }

  const filler = fillPiece ?? chooseStraightPiece(plan.widthTiles);
  for (const cell of plan.roadMap.values()) {
    const k = keyOf(cell.x, cell.y);
    if (centerlineSet.has(k)) continue;
    add(cell.x, cell.y, filler, dominantHeading(cell.votes, 0));
  }

  if (borderEnabled) {
    let borderMap = plan.borderMap;
    let innerBorderMap = new Map();

    if (!plan.closeLoop) {
      borderMap = pruneOpenEndCaps(plan.borderMap, plan.centerlinePieces, plan.widthTiles);
    } else {
      const split = splitBorderMapByOutsideReachability(plan.roadMap, plan.borderMap, { padding: 2 });
      borderMap = split.outerBorderMap;

      // Outer bridge pass: fill convex corner gaps (diagonal check prevents spurious bridges)
      if (split.bounds) {
        const ob = new Set(borderMap.keys());
        const toAdd = [];
        const { x0, x1, y0, y1 } = split.bounds;
        for (let by = y0; by <= y1; by++) {
          for (let bx = x0; bx <= x1; bx++) {
            const k = keyOf(bx, by);
            if (plan.roadMap.has(k) || !split.outsideEmpty.has(k) || borderMap.has(k)) continue;
            if (countRoadNeighbors4(plan.roadMap, bx, by) >= 2) continue;
            // Only fill gaps within the road's own bounding box. Genuine staircase bridges
            // sit inside the road's spatial extent; spurious corner bridges are always at
            // positions that extend beyond the road bounding box.
            if (bx < split.bounds.minX || bx > split.bounds.maxX ||
                by < split.bounds.minY || by > split.bounds.maxY) continue;
            const n = ob.has(keyOf(bx, by - 1)), e = ob.has(keyOf(bx + 1, by));
            const s = ob.has(keyOf(bx, by + 1)), w = ob.has(keyOf(bx - 1, by));
            if ((n && e && !ob.has(keyOf(bx + 1, by - 1))) ||
                (e && s && !ob.has(keyOf(bx + 1, by + 1))) ||
                (s && w && !ob.has(keyOf(bx - 1, by + 1))) ||
                (w && n && !ob.has(keyOf(bx - 1, by - 1)))) toAdd.push({ x: bx, y: by });
          }
        }
        for (const c of toAdd) borderMap.set(keyOf(c.x, c.y), { x: c.x, y: c.y, votes: { 0: 1 } });
      }

      if (innerBorderEnabled) {
        innerBorderMap = buildInnerBorderFromRoad(plan.roadMap, {
          padding: 2,
          orthogonalBridges: true,
        });
      }
    }

    const addBorderMap = (srcMap) => {
      if (!srcMap || !srcMap.size) return;

      const borderSet = new Set();
      for (const cell of srcMap.values()) borderSet.add(keyOf(cell.x, cell.y));

      const hasBorderAt = (x, y) => borderSet.has(keyOf(x, y));

      for (const cell of srcMap.values()) {
        const n = hasBorderAt(cell.x, cell.y - 1);
        const e = hasBorderAt(cell.x + 1, cell.y);
        const s = hasBorderAt(cell.x, cell.y + 1);
        const w = hasBorderAt(cell.x - 1, cell.y);
        const mask = `${n ? "N" : ""}${e ? "E" : ""}${s ? "S" : ""}${w ? "W" : ""}`;
        const fallbackRotation = dominantHeading(cell.votes, 0);
        const picked = pickBorderPieceForMask(mask || "-", fallbackRotation, {
          x: cell.x,
          y: cell.y,
          roadMap: plan.roadMap,
          preferRoadAxis: true,
        });
        let blockType = picked.blockType;
        let rotation = picked.rotation;

        if (borderPiece !== REFERENCE_BLOCK.BORDER && blockType === REFERENCE_BLOCK.BORDER) {
          blockType = borderPiece;
        }

        add(cell.x, cell.y, blockType, rotation);
      }
    };

    addBorderMap(borderMap);
    if (innerBorderEnabled && plan.closeLoop) addBorderMap(innerBorderMap);
  }

  // Emit the marker piece seen in the reference fixed track.
  if (emitCheckpoints) {
    const start = plan.centerlinePieces.find((p) => p.blockType === REFERENCE_BLOCK.START);
    if (start) {
      const hx = DIR4[start.rotation]?.x ?? 0;
      const hy = DIR4[start.rotation]?.y ?? -1;
      const mx = start.x + hx;
      const my = start.y + hy;
      add(mx, my, REFERENCE_BLOCK.FINISH_MARKER, start.rotation);
    }
  }

  return trackData;
}

function fitScaleToTarget(path, {
  closed,
  scale,
  desiredTiles,
  maxIterations = 4,
} = {}) {
  let currentScale = Math.max(0.02, Number(scale) || 1);
  let grid = pathToGrid(path, { scale: currentScale, closed });

  if (!(desiredTiles > 0)) {
    return { scale: currentScale, grid };
  }

  for (let i = 0; i < maxIterations; i++) {
    const segments = closed ? grid.length : Math.max(0, grid.length - 1);
    if (!(segments > 0)) break;

    const factor = desiredTiles / segments;
    if (Math.abs(1 - factor) < 0.015) break;

    currentScale *= factor;
    grid = pathToGrid(path, { scale: currentScale, closed });
  }

  return { scale: currentScale, grid };
}

function countMaskPixels(mask) {
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) n++;
  return n;
}

export function maskToPreviewRgba(mask, width, height, {
  on = [20, 20, 20, 255],
  off = [245, 245, 245, 255],
} = {}) {
  const out = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < mask.length; i++) {
    const p = i * 4;
    const src = mask[i] ? on : off;
    out[p] = src[0];
    out[p + 1] = src[1];
    out[p + 2] = src[2];
    out[p + 3] = src[3];
  }

  return out;
}

export function generateTrackFromImageData({
  imageData,
  name = "Image Trace Track",
  environment = "Summer",
  targetLength = 60,
  lengthUnit = "km",
  scaleMode = "best-fit",
  scaleRatio = 1,
  metersPerTile = 4,
  widthTiles = 1,
  innerBorderEnabled = null,
  closeLoop = true,
  threshold = 140,
  invert = false,
  simplifyEpsilon = 1.1,
  sampleSpacingPx = 2.4,
  trimPasses = 1,
  borderEnabled = true,
  borderPiece = REFERENCE_BLOCK.BORDER,
} = {}) {
  const { mask, width, height } = imageDataToBinaryMask(imageData, { threshold, invert });
  const largest = keepLargestComponent(mask, width, height);

  // Always thin the full original mask to get the best skeleton.
  // - For line images (diagonal, straight): produces a clean open A→B centerline.
  // - For ring images (hand-drawn oval outline): produces a closed ring skeleton.
  // - For filled shapes (solid disk): collapses to a small structure or nothing
  //   → caught by the outerBoundary fallback below.
  //
  // The old approach of thinning the outer boundary ring first is problematic for
  // line images: the two parallel sides of the outer ring collapse to the same tile
  // cells when gridded, producing chaotic road/border interleaving.
  const outerBoundary = extractOuterBoundary(largest, width, height);
  const thinnedFull = thinMaskZhangSuen(largest, width, height, { maxIterations: 80 });

  // Determine if the skeleton is an open path (has degree-1 endpoints) or a closed
  // ring (no endpoints). Open skeletons cannot form a meaningful closed circuit at
  // tile scale — override closeLoop to false for them.
  let skeletonIsOpen = false;
  outer: for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!thinnedFull[y * width + x]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && thinnedFull[ny * width + nx]) n++;
        }
      }
      if (n === 1) { skeletonIsOpen = true; break outer; }
    }
  }
  const effectiveCloseLoop = closeLoop && !skeletonIsOpen;
  // DEBUG
  console.error(`[DBG] skeletonIsOpen=${skeletonIsOpen} effectiveCloseLoop=${effectiveCloseLoop} w=${width} h=${height}`);

  // Use the full-mask skeleton. Fall back to outer-boundary thinning only if the
  // full-mask thinning collapsed (e.g. a solid filled disk where the skeleton
  // shrinks to a point), then ultimately fall back to the raw outer boundary.
  const thinned = thinnedFull;
  const trimmed = trimEndpoints(thinned, width, height, { passes: trimPasses });

  let traced = traceMainPathFromMask(trimmed, width, height);
  if (traced.length < 8) {
    traced = traceMainPathFromMask(thinned, width, height);
  }
  if (traced.length < 8) {
    // Filled-disk fallback: thin the outer boundary ring instead
    const thinnedOuter = thinMaskZhangSuen(outerBoundary, width, height, { maxIterations: 80 });
    traced = traceMainPathFromMask(thinnedOuter, width, height);
  }
  if (traced.length < 8) {
    traced = traceMainPathFromMask(outerBoundary, width, height);
  }
  if (traced.length < 8) {
    throw new Error("Could not trace a usable line from the image. Try adjusting threshold or invert.");
  }

  const simplified = simplifyPath(traced, { epsilon: simplifyEpsilon, closed: effectiveCloseLoop });
  const sampled = resamplePath(simplified, {
    spacing: Math.max(0.6, Number(sampleSpacingPx) || 0.6),
    closed: effectiveCloseLoop,
    minPoints: 72,
  });

  const mode = normalizeScaleMode(scaleMode);
  const desiredMeters = lengthToMeters(targetLength, lengthUnit);
  const desiredTiles = desiredMeters > 0 ? desiredMeters / Math.max(0.2, Number(metersPerTile) || 0.2) : 0;
  const requestedWidthTiles = Math.max(1, Number(widthTiles) || 1);
  const useInnerBorder = innerBorderEnabled == null
    ? (effectiveCloseLoop && requestedWidthTiles >= 3)
    : !!innerBorderEnabled;
  const effectiveWidthTiles = useInnerBorder ? Math.max(3, requestedWidthTiles) : requestedWidthTiles;

  let baseScale = 1;
  if (mode === "manual") {
    baseScale = Math.max(0.02, Number(scaleRatio) || 1);
  } else if (mode === "best-fit") {
    const baseLength = polylineLength(sampled, effectiveCloseLoop);
    if (desiredTiles > 0 && baseLength > 0) {
      baseScale = desiredTiles / baseLength;
    }
  }

  const fitted = fitScaleToTarget(sampled, {
    closed: effectiveCloseLoop,
    scale: baseScale,
    desiredTiles: mode === "best-fit" ? desiredTiles : 0,
  });

  const gridPath = fitted.grid;
  // DEBUG
  { let db=0; for(let i=2;i<gridPath.length;i++){const p0=gridPath[i-2],p1=gridPath[i-1],p2=gridPath[i];const dx0=p1.x-p0.x,dy0=p1.y-p0.y,dx1=p2.x-p1.x,dy1=p2.y-p1.y;if((dx0*dx1<0)||(dy0*dy1<0))db++;} console.error(`[DBG] gridPath.length=${gridPath.length} doublesBack=${db} first=(${gridPath[0]?.x},${gridPath[0]?.y}) last=(${gridPath[gridPath.length-1]?.x},${gridPath[gridPath.length-1]?.y})`); }
  if (gridPath.length < 24) {
    throw new Error("Traced path is too short after scaling. Increase target length or manual scale ratio.");
  }

  const centerlinePieces = centerlineToPieces(gridPath, {
    closed: effectiveCloseLoop,
    widthTiles: effectiveWidthTiles,
  });

  const roadMap = expandRoadWidth(centerlinePieces, { widthTiles: effectiveWidthTiles });
  const borderMap = buildBorderFromRoad(roadMap);

  const plan = {
    widthTiles: effectiveWidthTiles,
    closeLoop: effectiveCloseLoop,
    centerlinePieces,
    roadMap,
    borderMap,
  };

  const trackData = planToTrackData(plan, {
    environment,
    borderPiece,
    borderEnabled,
    innerBorderEnabled: useInnerBorder,
  });

  const shareCode = encodePolyTrack1ShareCode(name, trackData, "");
  const metrics = buildMetrics(centerlinePieces.length, effectiveCloseLoop, Math.max(0.2, Number(metersPerTile) || 0.2));

  return {
    name,
    shareCode,
    trackData,
    plan,
    metrics,
    diagnostics: {
      image: { width, height },
      pixels: {
        rawTrackPixels: countMaskPixels(mask),
        largestComponentPixels: countMaskPixels(largest),
        outerBoundaryPixels: countMaskPixels(outerBoundary),
        thinnedPixels: countMaskPixels(thinned),
        trimmedPixels: countMaskPixels(trimmed),
      },
      tracedPoints: traced.length,
      simplifiedPoints: simplified.length,
      sampledPoints: sampled.length,
      gridPoints: gridPath.length,
      scaleMode: mode,
      scaleUsed: fitted.scale,
      targetLength,
      lengthUnit,
      desiredTiles,
      borderEnabled,
      innerBorderEnabled: useInnerBorder,
      widthTiles: effectiveWidthTiles,
    },
    debug: {
      rawMask: mask,
      largestMask: largest,
      outerBoundaryMask: outerBoundary,
      thinMask: thinned,
      trimmedMask: trimmed,
      tracedPath: traced,
      simplifiedPath: simplified,
      sampledPath: sampled,
      gridPath,
    },
  };
}
