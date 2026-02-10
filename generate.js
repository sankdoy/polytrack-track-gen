#!/usr/bin/env node
/**
 * PolyTrack Random Track Generator
 *
 * Usage:
 *   node generate.js [options]
 *
 * Options:
 *   --name "Track Name"      Track name (default: "Generated Track")
 *   --length N               Number of road pieces, 10-5000 (default: 30)
 *   --elevation N            Height variation (recommended 0-10, default: 1)
 *   --curviness N            Turn frequency (recommended 0-10, default: 1)
 *   --checkpoints N          Number of checkpoints (recommended 0-200, default: 2)
 *   --environment ENV        Summer/Winter/Desert/Default (default: Summer)
 *   --scenery                Add scenery blocks around track
 *   --seed N                 Random seed for reproducibility
 *   --max-height N           Max Y height (default: 24)
 *   --max-attempts N         Max placement attempts per piece (default: 25)
 *   --intersections          Allow self-intersections (upgrades Straights to IntersectionCross)
 *   --intersection-chance F  Chance 0..1 to allow an intersection crossing (default: 0.15)
 *   --template-chance F      Chance 0..1 to enqueue 3-5 piece templates (default: 0.25)
 *   --no-steep-slopes        Disable steep Slope (+2Y) pieces
 *   --no-templates           Disable templates (same as --template-chance 0)
 *   --output FILE            Save share code to file
 *   --batch N                Generate N tracks (outputs share codes only)
 *   --quiet                  Only output share code (no description)
 *
 * Examples:
 *   node generate.js --name "My Track" --length 50 --curviness 2
 *   node generate.js --length 100 --elevation 3 --seed 42
 *   node generate.js --batch 10 --length 30 --output tracks.txt
 */

const fs = require('fs');
const { generateTrack } = require('./track');

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    name: 'Generated Track',
    length: 30,
    elevation: 1,
    curviness: 1,
    numCheckpoints: 2,
    environment: 'Summer',
    includeScenery: false,
    seed: Date.now(),
    maxHeight: 24,
    maxAttemptsPerPiece: 25,
    allowIntersections: false,
    intersectionChance: 0.15,
    templateChance: 0.25,
    allowSteepSlopes: true,
    output: null,
    batch: 1,
    quiet: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--name': opts.name = args[++i]; break;
      case '--length': opts.length = parseInt(args[++i]); break;
      case '--elevation': opts.elevation = parseInt(args[++i]); break;
      case '--curviness': opts.curviness = parseInt(args[++i]); break;
      case '--checkpoints': opts.numCheckpoints = parseInt(args[++i]); break;
      case '--environment': opts.environment = args[++i]; break;
      case '--scenery': opts.includeScenery = true; break;
      case '--seed': opts.seed = parseInt(args[++i]); break;
      case '--max-height': opts.maxHeight = parseInt(args[++i]); break;
      case '--max-attempts': opts.maxAttemptsPerPiece = parseInt(args[++i]); break;
      case '--intersections': opts.allowIntersections = true; break;
      case '--intersection-chance': opts.intersectionChance = parseFloat(args[++i]); break;
      case '--template-chance': opts.templateChance = parseFloat(args[++i]); break;
      case '--no-steep-slopes': opts.allowSteepSlopes = false; break;
      case '--no-templates': opts.templateChance = 0; break;
      case '--output': opts.output = args[++i]; break;
      case '--batch': opts.batch = parseInt(args[++i]); break;
      case '--quiet': opts.quiet = true; break;
      case '--help':
      case '-h':
        console.log(fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1]
          .split('\n').map(l => l.replace(/^ \* ?/, '')).join('\n'));
        process.exit(0);
    }
  }
  return opts;
}

const opts = parseArgs(process.argv);
const codes = [];

for (let i = 0; i < opts.batch; i++) {
  const trackName = opts.batch > 1 ? `${opts.name} #${i + 1}` : opts.name;
  const seed = opts.seed + i;

  const result = generateTrack({
    name: trackName,
    length: opts.length,
    elevation: opts.elevation,
    curviness: opts.curviness,
    numCheckpoints: opts.numCheckpoints,
    environment: opts.environment,
    includeScenery: opts.includeScenery,
    maxHeight: opts.maxHeight,
    maxAttemptsPerPiece: opts.maxAttemptsPerPiece,
    allowIntersections: opts.allowIntersections,
    intersectionChance: opts.intersectionChance,
    templateChance: opts.templateChance,
    allowSteepSlopes: opts.allowSteepSlopes,
    seed,
  });

  codes.push(result.shareCode);

  if (!opts.quiet) {
    console.log(result.description);
    console.log('');
    console.log('Share Code:');
    console.log(result.shareCode);
    console.log('');
  } else {
    console.log(result.shareCode);
  }
}

if (opts.output) {
  fs.writeFileSync(opts.output, codes.join('\n') + '\n');
  if (!opts.quiet) {
    console.log(`Saved ${codes.length} share code(s) to ${opts.output}`);
  }
}
