#!/usr/bin/env node
/**
 * Decode and describe PolyTrack tracks from found_tracks.txt
 * Usage: node decode.js [--count N] [--index N] [--all]
 */

const fs = require('fs');
const path = require('path');
const { decodeV3ShareCode, describeTrack } = require('./track');

const args = process.argv.slice(2);
const flagAll = args.includes('--all');
const countIdx = args.indexOf('--count');
const idxIdx = args.indexOf('--index');
const count = countIdx !== -1 ? parseInt(args[countIdx + 1]) : (flagAll ? Infinity : 5);
const startIndex = idxIdx !== -1 ? parseInt(args[idxIdx + 1]) : 0;

const tracksFile = path.join(__dirname, 'found_tracks.txt');
const raw = fs.readFileSync(tracksFile, 'utf8');
const lines = raw.split('\n').filter(l => l.trim().length > 0);

console.log(`Found ${lines.length} tracks in found_tracks.txt\n`);

let decoded = 0;
let failed = 0;

for (let i = startIndex; i < lines.length && decoded < count; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const result = decodeV3ShareCode(line);
  if (result) {
    console.log(describeTrack(result.name, result.trackData));
    console.log('');
    decoded++;
  } else {
    failed++;
    if (!flagAll) {
      console.log(`Track #${i}: FAILED to decode (${line.substring(0, 40)}...)\n`);
    }
  }
}

console.log(`\n--- Summary: ${decoded} decoded, ${failed} failed ---`);
