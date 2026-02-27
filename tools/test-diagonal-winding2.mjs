function cardinalLine(a, b) {
  const out = [{ x: a.x, y: a.y }];
  let x = a.x, y = a.y;
  while (x !== b.x || y !== b.y) {
    const dx = b.x - x, dy = b.y - y;
    if (dx !== 0 && dy !== 0) {
      if (Math.abs(dx) >= Math.abs(dy)) x += Math.sign(dx);
      else y += Math.sign(dy);
    } else if (dx !== 0) x += Math.sign(dx);
    else y += Math.sign(dy);
    out.push({ x, y });
  }
  return out;
}

function buildPath(pts, closed) {
  const path = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const seg = cardinalLine(pts[i], pts[i + 1]);
    if (!path.length) path.push(...seg);
    else path.push(...seg.slice(1));
  }
  if (closed) {
    const seg = cardinalLine(pts[pts.length - 1], pts[0]);
    if (seg.length > 1) path.push(...seg.slice(1));
  }
  return path;
}

function isInsideGridPolygon(bx, by, path) {
  let winding = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[i], b = path[(i + 1) % n];
    if (a.x !== b.x) continue;
    if (a.x <= bx) continue;
    const yMin = Math.min(a.y, b.y);
    if (yMin !== by) continue;
    winding += (a.y < b.y) ? -1 : 1;
  }
  return winding !== 0;
}

// Match the actual broken track bounding box: x=[-32,31] y=[-21,22]
const A = { x: -32, y: -21 }, B = { x: 31, y: 22 };
const closedPath = buildPath([A, B], true);
const outbound = cardinalLine(A, B);
const ret = cardinalLine(B, A);
const outSet = new Set(outbound.map(p => `${p.x},${p.y}`));
const retSet = new Set(ret.map(p => `${p.x},${p.y}`));
const both = outbound.filter(p => retSet.has(`${p.x},${p.y}`));
console.log(`Outbound length: ${outbound.length}, Return length: ${ret.length}`);
console.log(`Shared cells: ${both.length}`);

// Check winding for known inter-band positions from inspect-broken
const testCells = [[-27,17],[-26,17],[-28,17],[-27,16],[-27,18],[-25,16],[-26,16]];
for (const [bx, by] of testCells) {
  const ins = isInsideGridPolygon(bx, by, closedPath);
  const onO = outSet.has(`${bx},${by}`);
  const onR = retSet.has(`${bx},${by}`);
  console.log(`  (${bx},${by}): inside=${ins} outbound=${onO} return=${onR}`);
}

// Count inside cells
let insideCount = 0, totalNonPath = 0;
const roadSet = new Set([...outbound, ...ret].map(p => `${p.x},${p.y}`));
for (let y = -25; y <= 26; y++) {
  for (let x = -36; x <= 35; x++) {
    if (roadSet.has(`${x},${y}`)) continue;
    totalNonPath++;
    if (isInsideGridPolygon(x, y, closedPath)) insideCount++;
  }
}
console.log(`\nCells classified inside: ${insideCount} of ${totalNonPath} non-path cells`);

// Show minimap around the misclassified area
console.log("\nMinimap z=14..20 rows, x=-34..-22 cols:");
for (let y = 14; y <= 20; y++) {
  let row = `y=${String(y).padStart(3)}: `;
  for (let x = -34; x <= -22; x++) {
    const onO = outSet.has(`${x},${y}`);
    const onR = retSet.has(`${x},${y}`);
    const ins = isInsideGridPolygon(x, y, closedPath);
    if (onO && onR) row += "B";
    else if (onO) row += "O";
    else if (onR) row += "R";
    else if (ins) row += "I";
    else row += ".";
  }
  console.log(row);
}
console.log("  B=both O=outbound R=return I=inside .");
