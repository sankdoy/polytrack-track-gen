/**
 * Test: does the winding number test work correctly for a thin diagonal closed loop?
 * (the kind produced when the user draws a diagonal line with closeLoop=true)
 */

// Reproduce cardinalLine (from image-track-core.mjs)
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

// Build path like pathToGrid does
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

// Winding test from image-track-core.mjs
function isInsideGridPolygon(bx, by, path) {
  let winding = 0;
  const n = path.length;
  for (let i = 0; i < n; i++) {
    const a = path[i];
    const b = path[(i + 1) % n];
    if (a.x !== b.x) continue;
    if (a.x <= bx) continue;
    const yMin = Math.min(a.y, b.y);
    if (yMin !== by) continue;
    winding += (a.y < b.y) ? -1 : 1;
  }
  return winding !== 0;
}

// A simple diagonal "line": A = (0,0), B = (8,8)
// With closeLoop=true, this becomes outbound + return
const A = { x: 0, y: 0 };
const B = { x: 8, y: 8 };

// Build closed polygon: just two control points, cardinalLine handles the segments
const closedPath = buildPath([A, B], true);

console.log("Closed diagonal polygon vertices:", closedPath.length);
const firstFew = closedPath.slice(0, 8).map(p => `(${p.x},${p.y})`).join(" ");
const lastFew = closedPath.slice(-8).map(p => `(${p.x},${p.y})`).join(" ");
console.log("First 8:", firstFew);
console.log("Last 8:", lastFew);

// Find duplicate vertices (self-intersections)
const seen = new Map();
let selfIntersections = 0;
for (let i = 0; i < closedPath.length; i++) {
  const k = `${closedPath[i].x},${closedPath[i].y}`;
  if (seen.has(k)) {
    selfIntersections++;
    if (selfIntersections <= 5)
      console.log(`  Self-intersection at (${closedPath[i].x},${closedPath[i].y}): indices ${seen.get(k)} and ${i}`);
  } else {
    seen.set(k, i);
  }
}
console.log(`Total self-intersections: ${selfIntersections}`);

// Now expand the path to simulate road of widthTiles=3
// The two "legs" of the diagonal hairpin:
// Outbound: cardinalLine(A, B)
// Return: cardinalLine(B, A)
const outbound = cardinalLine(A, B);
const returnPath = cardinalLine(B, A);

console.log("\nOutbound cells:", outbound.map(p=>`(${p.x},${p.y})`).join(" "));
console.log("Return cells:", returnPath.map(p=>`(${p.x},${p.y})`).join(" "));

// Find cells that are "between" the two legs at some row
// For widthTiles=3, road expands ±1 around centerline
// so outbound band at (ox, oy) → cells {(ox,oy-1),(ox,oy),(ox,oy+1)} for east segments
// and {(ox-1,oy),(ox,oy),(ox+1,oy)} for south segments
// The "gap" cells would be between the outbound and return bands

// Test some candidate inter-band cells
const outSet = new Set(outbound.map(p => `${p.x},${p.y}`));
const retSet = new Set(returnPath.map(p => `${p.x},${p.y}`));

// Cells that are in both (shared diagonal cells)
const shared = outbound.filter(p => retSet.has(`${p.x},${p.y}`));
console.log("\nShared diagonal cells:", shared.map(p=>`(${p.x},${p.y})`).join(" "));

// For a staircase outbound: (0,0),(1,0),(1,1),(2,1),(2,2),...
// The outbound band (width 3) at row y includes outbound cells at y-1,y,y+1 horizontally
// The return band at row y is offset diagonally

// Test: for cell (1,2) which is between outbound and return near start
const testCells = [
  { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 0 }, { x: 2, y: 1 },
  { x: 3, y: 1 }, { x: 3, y: 3 }, { x: 4, y: 2 }, { x: 5, y: 3 },
];
console.log("\nWinding test for candidate inter-band cells:");
for (const cell of testCells) {
  const inside = isInsideGridPolygon(cell.x, cell.y, closedPath);
  const onOutbound = outSet.has(`${cell.x},${cell.y}`);
  const onReturn = retSet.has(`${cell.x},${cell.y}`);
  console.log(`  (${cell.x},${cell.y}): inside=${inside} outbound=${onOutbound} return=${onReturn}`);
}

// Draw ASCII map
console.log("\nASCII map of the diagonal loop (0..9 rows, 0..9 cols):");
console.log("  Legend: O=outbound, R=return, B=both, I=inside-polygon, .=outside");
for (let y = 0; y <= 9; y++) {
  let row = `y=${y}: `;
  for (let x = 0; x <= 9; x++) {
    const onO = outSet.has(`${x},${y}`);
    const onR = retSet.has(`${x},${y}`);
    if (onO && onR) row += "B";
    else if (onO) row += "O";
    else if (onR) row += "R";
    else if (isInsideGridPolygon(x, y, closedPath)) row += "I";
    else row += ".";
  }
  console.log(row);
}
