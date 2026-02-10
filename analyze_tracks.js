/**
 * PolyTrack Track Corpus Analysis
 *
 * Analyzes 218 real PolyTrack tracks from found_tracks.txt to understand:
 * 1. Block type frequency distribution
 * 2. Common 3/4/5-piece sequences (by path order)
 * 3. Elevation change patterns around ramp pieces
 * 4. Structural patterns useful for track generation
 */

const fs = require('fs');
const path = require('path');
const {
  decodeV3ShareCode,
  BlockType,
  BlockTypeName,
  START_BLOCKS,
  CHECKPOINT_BLOCKS,
  getBlockCategory,
} = require('./track.js');

// ============================================================
// HELPERS
// ============================================================

/** Classify a block type into a high-level category for reporting */
function classifyBlock(blockType) {
  const name = BlockTypeName[blockType] || 'Unknown';
  if (START_BLOCKS.includes(blockType)) return 'Start';
  if (name.includes('Finish')) return 'Finish';
  if (name.includes('Checkpoint')) return 'Checkpoint';
  if (name.includes('Sign')) return 'Sign';
  if (name.includes('Pillar') || name.includes('Bridge')) return 'Structure';
  if (name.includes('Plane')) return 'Plane/Platform';
  if (name.includes('WallTrack')) return 'WallTrack';
  if (name.includes('Block') && !name.includes('Checkpoint')) return 'Scenery/Block';
  if (name.includes('Wide')) return 'Wide Road';
  if (name.includes('Intersection')) return 'Intersection';
  if (name.includes('Slope') || name.includes('Vertical')) return 'Slope/Ramp';
  if (name.includes('Turn') || name.includes('Corner')) return 'Turn';
  if (name === 'Straight') return 'Straight';
  return 'Other';
}

/** Build a spatial neighbor graph from parts and trace a path starting from Start */
function traceTrackPath(allParts) {
  // Build spatial index
  const grid = new Map();
  for (const p of allParts) {
    const key = `${p.x},${p.y},${p.z}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }

  // Filter to only "road" pieces (not scenery, signs, pillars, planes, blocks)
  const roadParts = allParts.filter(p => {
    const cat = classifyBlock(p.blockType);
    return ['Start', 'Finish', 'Checkpoint', 'Straight', 'Turn', 'Slope/Ramp',
            'Wide Road', 'Intersection'].includes(cat);
  });

  if (roadParts.length === 0) return allParts; // fallback

  // Find start piece
  const startParts = roadParts.filter(p => START_BLOCKS.includes(p.blockType));
  if (startParts.length === 0) return roadParts;

  const start = startParts[0];

  // Direction deltas (4 units per grid cell)
  const DELTAS = [
    { dx: 0, dz: -4 },  // 0 = North
    { dx: -4, dz: 0 },  // 1 = West
    { dx: 0, dz: 4 },   // 2 = South
    { dx: 4, dz: 0 },   // 3 = East
  ];

  // BFS/greedy walk from start
  const visited = new Set();
  const ordered = [];
  let current = start;
  let heading = start.rotation;

  for (let step = 0; step < 2000 && current; step++) {
    const key = `${current.x},${current.y},${current.z}`;
    if (visited.has(key)) break;
    visited.add(key);
    ordered.push(current);

    // Determine next heading based on current piece type
    const name = BlockTypeName[current.blockType] || '';
    let nextHeading = heading;

    if (name === 'TurnSharp') {
      // TurnSharp: rotation == heading means right turn => new heading (heading+3)%4
      // rotation == (heading+3)%4 means left turn => new heading (heading+1)%4
      if (current.rotation === heading) {
        nextHeading = (heading + 3) % 4;
      } else {
        nextHeading = (heading + 1) % 4;
      }
    } else if (name === 'TurnShort') {
      // Similar to TurnSharp but gentler
      if (current.rotation === heading) {
        nextHeading = (heading + 3) % 4;
      } else {
        nextHeading = (heading + 1) % 4;
      }
    } else if (name === 'TurnLong' || name === 'TurnLong2' || name === 'TurnLong3') {
      if (current.rotation === heading) {
        nextHeading = (heading + 3) % 4;
      } else {
        nextHeading = (heading + 1) % 4;
      }
    } else if (name === 'TurnSLeft') {
      nextHeading = (heading + 1) % 4;
    } else if (name === 'TurnSRight') {
      nextHeading = (heading + 3) % 4;
    }
    // For Straight, SlopeUp, SlopeDown, Slope, Checkpoint, etc. heading stays the same

    heading = nextHeading;

    // Look for next piece in the direction we're heading
    let found = null;
    const d = DELTAS[heading];

    // Try multiple y offsets for slopes
    const yOffsets = [0, 1, -1, 2, -2, 3, -3];
    for (const dy of yOffsets) {
      const nx = current.x + d.dx;
      const ny = current.y + dy;
      const nz = current.z + d.dz;
      const nkey = `${nx},${ny},${nz}`;
      if (!visited.has(nkey) && grid.has(nkey)) {
        const candidates = grid.get(nkey).filter(p => {
          const c = classifyBlock(p.blockType);
          return ['Start', 'Finish', 'Checkpoint', 'Straight', 'Turn', 'Slope/Ramp',
                  'Wide Road', 'Intersection'].includes(c);
        });
        if (candidates.length > 0) {
          found = candidates[0];
          break;
        }
      }
    }

    current = found;
  }

  return ordered.length > 3 ? ordered : roadParts;
}

// ============================================================
// MAIN ANALYSIS
// ============================================================

const tracksFile = path.join(__dirname, 'found_tracks.txt');
const raw = fs.readFileSync(tracksFile, 'utf-8');
const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0 && l.startsWith('v3'));

console.log(`Found ${lines.length} share codes to analyze.\n`);

// Decode all tracks
const tracks = [];
let failCount = 0;
for (const code of lines) {
  try {
    const result = decodeV3ShareCode(code);
    if (result && result.trackData) {
      tracks.push(result);
    } else {
      failCount++;
    }
  } catch (e) {
    failCount++;
  }
}

console.log(`Successfully decoded: ${tracks.length} tracks`);
console.log(`Failed to decode: ${failCount} tracks\n`);

// ============================================================
// 1. BLOCK TYPE FREQUENCY
// ============================================================
console.log('='.repeat(80));
console.log('1. BLOCK TYPE FREQUENCY (across all tracks)');
console.log('='.repeat(80));

const globalTypeCounts = {};
const globalCategoryCounts = {};
let totalPieces = 0;
const tracksPerType = {}; // How many tracks use each type

for (const { trackData } of tracks) {
  const allParts = trackData.getAllParts();
  totalPieces += allParts.length;

  const typesInTrack = new Set();
  for (const p of allParts) {
    const name = BlockTypeName[p.blockType] || `Unknown(${p.blockType})`;
    globalTypeCounts[name] = (globalTypeCounts[name] || 0) + 1;

    const cat = classifyBlock(p.blockType);
    globalCategoryCounts[cat] = (globalCategoryCounts[cat] || 0) + 1;

    typesInTrack.add(name);
  }

  for (const t of typesInTrack) {
    tracksPerType[t] = (tracksPerType[t] || 0) + 1;
  }
}

console.log(`\nTotal pieces across all tracks: ${totalPieces}`);
console.log(`Average pieces per track: ${(totalPieces / tracks.length).toFixed(1)}\n`);

// Category breakdown
console.log('--- By Category ---');
const sortedCats = Object.entries(globalCategoryCounts).sort((a, b) => b[1] - a[1]);
for (const [cat, count] of sortedCats) {
  const pct = (count / totalPieces * 100).toFixed(1);
  console.log(`  ${cat.padEnd(20)} ${String(count).padStart(6)}  (${pct}%)`);
}

// Detailed block types
console.log('\n--- By Block Type (all types used) ---');
const sortedTypes = Object.entries(globalTypeCounts).sort((a, b) => b[1] - a[1]);
for (const [name, count] of sortedTypes) {
  const pct = (count / totalPieces * 100).toFixed(1);
  const trackCount = tracksPerType[name] || 0;
  const trackPct = (trackCount / tracks.length * 100).toFixed(0);
  console.log(`  ${name.padEnd(38)} ${String(count).padStart(6)}  (${pct}%)  in ${trackCount} tracks (${trackPct}%)`);
}

// ============================================================
// 2. TRACK SIZE STATISTICS
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('2. TRACK SIZE & DIMENSION STATISTICS');
console.log('='.repeat(80));

const trackSizes = [];
const yRanges = [];
const yMins = [];
const yMaxes = [];
const uniqueYLevels = [];

for (const { trackData } of tracks) {
  const allParts = trackData.getAllParts();
  trackSizes.push(allParts.length);

  let minY = Infinity, maxY = -Infinity;
  const ySet = new Set();
  for (const p of allParts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    ySet.add(p.y);
  }
  if (Number.isFinite(minY)) {
    yRanges.push(maxY - minY);
    yMins.push(minY);
    yMaxes.push(maxY);
    uniqueYLevels.push(ySet.size);
  }
}

trackSizes.sort((a, b) => a - b);
console.log(`\nTrack sizes (piece count):`);
console.log(`  Min: ${trackSizes[0]}, Max: ${trackSizes[trackSizes.length - 1]}`);
console.log(`  Median: ${trackSizes[Math.floor(trackSizes.length / 2)]}`);
console.log(`  Mean: ${(trackSizes.reduce((a, b) => a + b, 0) / trackSizes.length).toFixed(1)}`);

console.log(`\nElevation (Y) statistics:`);
console.log(`  Y range (max-min): min=${Math.min(...yRanges)}, max=${Math.max(...yRanges)}, median=${yRanges.sort((a,b)=>a-b)[Math.floor(yRanges.length/2)]}`);
console.log(`  Unique Y levels: min=${Math.min(...uniqueYLevels)}, max=${Math.max(...uniqueYLevels)}, median=${uniqueYLevels.sort((a,b)=>a-b)[Math.floor(uniqueYLevels.length/2)]}`);
console.log(`  Y min values: min=${Math.min(...yMins)}, max=${Math.max(...yMins)}`);
console.log(`  Y max values: min=${Math.min(...yMaxes)}, max=${Math.max(...yMaxes)}`);

// Distribution of Y ranges
const yRangeBuckets = {};
for (const r of yRanges) {
  const bucket = r <= 0 ? 'flat(0)' : r <= 2 ? '1-2' : r <= 5 ? '3-5' : r <= 10 ? '6-10' : r <= 20 ? '11-20' : '21+';
  yRangeBuckets[bucket] = (yRangeBuckets[bucket] || 0) + 1;
}
console.log(`\n  Y range distribution:`);
for (const [bucket, count] of Object.entries(yRangeBuckets)) {
  console.log(`    ${bucket.padEnd(10)} ${count} tracks (${(count/tracks.length*100).toFixed(0)}%)`);
}

// ============================================================
// 3. N-GRAM SEQUENCE PATTERNS
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('3. COMMON N-GRAM PATTERNS (3, 4, 5 consecutive pieces by path order)');
console.log('='.repeat(80));

const ngramCounts = { 3: {}, 4: {}, 5: {} };
const ngramTrackCounts = { 3: {}, 4: {}, 5: {} }; // In how many distinct tracks

let pathTraceSuccesses = 0;

for (const { trackData } of tracks) {
  const allParts = trackData.getAllParts();
  const pathParts = traceTrackPath(allParts);

  if (pathParts.length > 5) pathTraceSuccesses++;

  // Convert to type name sequence
  const typeSeq = pathParts.map(p => BlockTypeName[p.blockType] || `?${p.blockType}`);

  for (const n of [3, 4, 5]) {
    const seenInTrack = new Set();
    for (let i = 0; i <= typeSeq.length - n; i++) {
      const gram = typeSeq.slice(i, i + n).join(' -> ');
      ngramCounts[n][gram] = (ngramCounts[n][gram] || 0) + 1;
      seenInTrack.add(gram);
    }
    for (const gram of seenInTrack) {
      ngramTrackCounts[n][gram] = (ngramTrackCounts[n][gram] || 0) + 1;
    }
  }
}

console.log(`\nPath tracing succeeded for ${pathTraceSuccesses}/${tracks.length} tracks (>5 pieces traced)\n`);

for (const n of [3, 4, 5]) {
  console.log(`\n--- Top 20 ${n}-grams (by occurrence count, min 3 occurrences) ---`);
  const sorted = Object.entries(ngramCounts[n])
    .filter(([, c]) => c >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (sorted.length === 0) {
    console.log('  (No patterns with 3+ occurrences found)');
  }
  for (let i = 0; i < sorted.length; i++) {
    const [gram, count] = sorted[i];
    const trackCount = ngramTrackCounts[n][gram] || 0;
    console.log(`  ${(i + 1 + '.').padEnd(4)} [${count}x in ${trackCount} tracks] ${gram}`);
  }
}

// ============================================================
// 4. ELEVATION CHANGE PATTERNS AROUND RAMPS
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('4. ELEVATION CHANGE PATTERNS AROUND RAMPS');
console.log('='.repeat(80));

// Ramp-related block types
const RAMP_TYPES = new Set([
  'SlopeUp', 'SlopeDown', 'Slope',
  'SlopeUpLong', 'SlopeDownLong',
  'SlopeUpLeftWide', 'SlopeUpRightWide',
  'SlopeDownLeftWide', 'SlopeDownRightWide',
  'SlopeLeftWide', 'SlopeRightWide',
  'SlopePillar', 'SlopePillarShort',
  'SlopeUpVertical',
  'SlopeUpVerticalLeftWide', 'SlopeUpVerticalRightWide',
  'PlaneSlopeUp', 'PlaneSlopeDown', 'PlaneSlope',
  'PlaneSlopeUpLong', 'PlaneSlopeDownLong',
  'BlockSlopeUp', 'BlockSlopeDown',
  'BlockSlopeVerticalTop', 'BlockSlopeVerticalBottom',
  'BlockSlopedDown', 'BlockSlopedUp',
]);

// For each ramp piece, record: its Y, the Y of the piece before, the Y of the piece after
const rampContexts = []; // { type, yBefore, yAt, yAfter, typeBefore, typeAfter }

for (const { trackData } of tracks) {
  const allParts = trackData.getAllParts();
  const pathParts = traceTrackPath(allParts);

  for (let i = 0; i < pathParts.length; i++) {
    const name = BlockTypeName[pathParts[i].blockType] || '';
    if (RAMP_TYPES.has(name)) {
      const before = i > 0 ? pathParts[i - 1] : null;
      const after = i < pathParts.length - 1 ? pathParts[i + 1] : null;

      rampContexts.push({
        type: name,
        yBefore: before ? before.y : null,
        yAt: pathParts[i].y,
        yAfter: after ? after.y : null,
        typeBefore: before ? (BlockTypeName[before.blockType] || '?') : null,
        typeAfter: after ? (BlockTypeName[after.blockType] || '?') : null,
      });
    }
  }
}

console.log(`\nTotal ramp pieces found in traced paths: ${rampContexts.length}\n`);

// Group by ramp type
const rampByType = {};
for (const ctx of rampContexts) {
  if (!rampByType[ctx.type]) rampByType[ctx.type] = [];
  rampByType[ctx.type].push(ctx);
}

console.log('--- Ramp type counts ---');
for (const [type, ctxs] of Object.entries(rampByType).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${type.padEnd(30)} ${ctxs.length}`);
}

console.log('\n--- Y-value transitions around ramps ---');
for (const [type, ctxs] of Object.entries(rampByType).sort((a, b) => b[1].length - a[1].length)) {
  if (ctxs.length < 2) continue;

  console.log(`\n  ${type} (${ctxs.length} occurrences):`);

  // Compute delta patterns
  const deltaPatterns = {};
  const beforeTypes = {};
  const afterTypes = {};

  for (const ctx of ctxs) {
    if (ctx.yBefore !== null && ctx.yAfter !== null) {
      const dBefore = ctx.yAt - ctx.yBefore;
      const dAfter = ctx.yAfter - ctx.yAt;
      const pattern = `dy_before=${dBefore >= 0 ? '+' : ''}${dBefore}, dy_after=${dAfter >= 0 ? '+' : ''}${dAfter}`;
      deltaPatterns[pattern] = (deltaPatterns[pattern] || 0) + 1;
    }
    if (ctx.typeBefore) {
      beforeTypes[ctx.typeBefore] = (beforeTypes[ctx.typeBefore] || 0) + 1;
    }
    if (ctx.typeAfter) {
      afterTypes[ctx.typeAfter] = (afterTypes[ctx.typeAfter] || 0) + 1;
    }
  }

  // Show top delta patterns
  const sortedDeltas = Object.entries(deltaPatterns).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('    Y-delta patterns (top 5):');
  for (const [pat, count] of sortedDeltas) {
    console.log(`      ${pat}  (${count}x)`);
  }

  // Show top before/after types
  const sortedBefore = Object.entries(beforeTypes).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('    Most common piece BEFORE:');
  for (const [t, c] of sortedBefore) {
    console.log(`      ${t} (${c}x)`);
  }

  const sortedAfter = Object.entries(afterTypes).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('    Most common piece AFTER:');
  for (const [t, c] of sortedAfter) {
    console.log(`      ${t} (${c}x)`);
  }
}

// ============================================================
// 5. RAMP SEQUENCE PATTERNS
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('5. RAMP SEQUENCE PATTERNS (consecutive ramp pieces)');
console.log('='.repeat(80));

const rampSeqCounts = {};
const rampSeqYDeltas = {};

for (const { trackData } of tracks) {
  const allParts = trackData.getAllParts();
  const pathParts = traceTrackPath(allParts);

  // Find runs of consecutive ramp pieces
  let runStart = -1;
  for (let i = 0; i <= pathParts.length; i++) {
    const name = i < pathParts.length ? (BlockTypeName[pathParts[i].blockType] || '') : '';
    const isRamp = RAMP_TYPES.has(name);

    if (isRamp && runStart === -1) {
      runStart = i;
    } else if (!isRamp && runStart !== -1) {
      // End of ramp run
      const run = pathParts.slice(runStart, i);
      const seq = run.map(p => BlockTypeName[p.blockType]).join(' -> ');
      rampSeqCounts[seq] = (rampSeqCounts[seq] || 0) + 1;

      // Y delta over the entire ramp sequence
      const yStart = runStart > 0 ? pathParts[runStart - 1].y : run[0].y;
      const yEnd = i < pathParts.length ? pathParts[i].y : run[run.length - 1].y;
      const totalDelta = yEnd - yStart;
      if (!rampSeqYDeltas[seq]) rampSeqYDeltas[seq] = [];
      rampSeqYDeltas[seq].push(totalDelta);

      runStart = -1;
    }
  }
}

console.log('\n--- Most common ramp sequences ---');
const sortedRampSeqs = Object.entries(rampSeqCounts)
  .filter(([, c]) => c >= 2)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25);

for (const [seq, count] of sortedRampSeqs) {
  const deltas = rampSeqYDeltas[seq] || [];
  const avgDelta = deltas.length > 0 ? (deltas.reduce((a, b) => a + b, 0) / deltas.length).toFixed(1) : '?';
  console.log(`  [${count}x] ${seq}  (avg Y delta: ${avgDelta})`);
}

// ============================================================
// 6. INTERESTING BLOCK USAGE PATTERNS
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('6. NOTABLE BLOCK USAGE PATTERNS');
console.log('='.repeat(80));

// Intersection usage
const intersectionTracks = [];
const loopTracks = [];
const wideTracks = [];
const wallTrackTracks = [];
const planeTracks = [];

for (let i = 0; i < tracks.length; i++) {
  const { name, trackData } = tracks[i];
  const allParts = trackData.getAllParts();
  const typeNames = allParts.map(p => BlockTypeName[p.blockType] || '');

  if (typeNames.some(n => n.includes('Intersection'))) {
    intersectionTracks.push({ name, types: typeNames.filter(n => n.includes('Intersection')) });
  }
  if (typeNames.some(n => n.includes('Wide'))) {
    wideTracks.push({ name, count: typeNames.filter(n => n.includes('Wide')).length });
  }
  if (typeNames.some(n => n.includes('WallTrack'))) {
    wallTrackTracks.push({ name, count: typeNames.filter(n => n.includes('WallTrack')).length });
  }
  if (typeNames.some(n => n.includes('Plane') && !n.includes('Start') && !n.includes('Finish') && !n.includes('Checkpoint'))) {
    planeTracks.push({ name, count: typeNames.filter(n => n.includes('Plane')).length });
  }
  if (typeNames.some(n => n === 'SlopeUpVertical' || n.includes('Vertical'))) {
    loopTracks.push({ name, types: typeNames.filter(n => n.includes('Vertical') || n.includes('Ceiling') || n.includes('WallTrack')) });
  }
}

console.log(`\n--- Intersection usage ---`);
console.log(`Tracks with intersections: ${intersectionTracks.length}/${tracks.length} (${(intersectionTracks.length/tracks.length*100).toFixed(0)}%)`);
if (intersectionTracks.length > 0) {
  const intTypes = {};
  for (const t of intersectionTracks) {
    for (const ty of t.types) {
      intTypes[ty] = (intTypes[ty] || 0) + 1;
    }
  }
  for (const [t, c] of Object.entries(intTypes).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${c} total pieces`);
  }
}

console.log(`\n--- Wide road usage ---`);
console.log(`Tracks with wide pieces: ${wideTracks.length}/${tracks.length} (${(wideTracks.length/tracks.length*100).toFixed(0)}%)`);
if (wideTracks.length > 0) {
  wideTracks.sort((a, b) => b.count - a.count);
  console.log(`  Highest wide-piece count: ${wideTracks[0].count} in "${wideTracks[0].name}"`);
  console.log(`  Average wide pieces per track (among users): ${(wideTracks.reduce((a, b) => a + b.count, 0) / wideTracks.length).toFixed(1)}`);
}

console.log(`\n--- WallTrack (loop/wall-ride) usage ---`);
console.log(`Tracks with WallTrack: ${wallTrackTracks.length}/${tracks.length} (${(wallTrackTracks.length/tracks.length*100).toFixed(0)}%)`);
if (wallTrackTracks.length > 0) {
  wallTrackTracks.sort((a, b) => b.count - a.count);
  console.log(`  Highest WallTrack count: ${wallTrackTracks[0].count} in "${wallTrackTracks[0].name}"`);
}

console.log(`\n--- Vertical/Loop pieces ---`);
console.log(`Tracks with vertical/loop elements: ${loopTracks.length}/${tracks.length} (${(loopTracks.length/tracks.length*100).toFixed(0)}%)`);

console.log(`\n--- Plane/Platform usage ---`);
console.log(`Tracks with planes: ${planeTracks.length}/${tracks.length} (${(planeTracks.length/tracks.length*100).toFixed(0)}%)`);

// ============================================================
// 7. TYPICAL ELEVATION PROFILES
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('7. ELEVATION PROFILES (Y values along traced paths)');
console.log('='.repeat(80));

const elevationProfiles = [];

for (const { name, trackData } of tracks) {
  const allParts = trackData.getAllParts();
  const pathParts = traceTrackPath(allParts);
  if (pathParts.length < 5) continue;

  const yValues = pathParts.map(p => p.y);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const startY = yValues[0];
  const endY = yValues[yValues.length - 1];

  // Count up/down transitions
  let ups = 0, downs = 0, flats = 0;
  for (let i = 1; i < yValues.length; i++) {
    if (yValues[i] > yValues[i - 1]) ups++;
    else if (yValues[i] < yValues[i - 1]) downs++;
    else flats++;
  }

  elevationProfiles.push({ name, length: pathParts.length, minY, maxY, startY, endY, ups, downs, flats });
}

// Classify elevation profiles
const profileTypes = { flat: 0, gentle: 0, moderate: 0, extreme: 0 };
for (const prof of elevationProfiles) {
  const range = prof.maxY - prof.minY;
  if (range === 0) profileTypes.flat++;
  else if (range <= 3) profileTypes.gentle++;
  else if (range <= 10) profileTypes.moderate++;
  else profileTypes.extreme++;
}

console.log(`\nElevation profile distribution:`);
for (const [type, count] of Object.entries(profileTypes)) {
  console.log(`  ${type.padEnd(12)} ${count} tracks (${(count/elevationProfiles.length*100).toFixed(0)}%)`);
}

// Show some interesting profiles
console.log('\n--- Tracks with most elevation change ---');
elevationProfiles.sort((a, b) => (b.maxY - b.minY) - (a.maxY - a.minY));
for (let i = 0; i < Math.min(10, elevationProfiles.length); i++) {
  const p = elevationProfiles[i];
  console.log(`  "${p.name}" range=${p.maxY - p.minY} (Y: ${p.minY}-${p.maxY}), ${p.ups} ups, ${p.downs} downs, ${p.flats} flats, ${p.length} pieces traced`);
}

// ============================================================
// 8. COMMON "TEMPLATE" PATTERNS FOR GENERATION
// ============================================================
console.log('\n' + '='.repeat(80));
console.log('8. RECOMMENDED TEMPLATE PATTERNS FOR GENERATION');
console.log('='.repeat(80));

// Aggregate: most frequent 3-grams that appear in 5+ tracks
console.log('\n--- 3-piece templates (appearing in 5+ tracks) ---');
const template3 = Object.entries(ngramTrackCounts[3])
  .filter(([, c]) => c >= 5)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);
for (const [gram, trackCount] of template3) {
  const totalCount = ngramCounts[3][gram];
  console.log(`  [${trackCount} tracks, ${totalCount}x total] ${gram}`);
}

console.log('\n--- 4-piece templates (appearing in 3+ tracks) ---');
const template4 = Object.entries(ngramTrackCounts[4])
  .filter(([, c]) => c >= 3)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 25);
for (const [gram, trackCount] of template4) {
  const totalCount = ngramCounts[4][gram];
  console.log(`  [${trackCount} tracks, ${totalCount}x total] ${gram}`);
}

console.log('\n--- 5-piece templates (appearing in 3+ tracks) ---');
const template5 = Object.entries(ngramTrackCounts[5])
  .filter(([, c]) => c >= 3)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);
for (const [gram, trackCount] of template5) {
  const totalCount = ngramCounts[5][gram];
  console.log(`  [${trackCount} tracks, ${totalCount}x total] ${gram}`);
}

console.log('\n' + '='.repeat(80));
console.log('ANALYSIS COMPLETE');
console.log('='.repeat(80));
