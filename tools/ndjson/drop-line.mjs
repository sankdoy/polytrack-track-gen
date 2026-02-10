import fs from "node:fs";

function usage() {
  // eslint-disable-next-line no-console
  console.error("Usage: node tools/ndjson/drop-line.mjs --input <in.ndjson> --output <out.ndjson> --drop-line <n>");
  process.exit(2);
}

function parseArgs(argv) {
  const out = { input: null, output: null, dropLine: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--drop-line") out.dropLine = Number(argv[++i]);
    else usage();
  }
  if (!out.input || !out.output || !Number.isFinite(out.dropLine) || out.dropLine < 1) usage();
  out.dropLine = Math.floor(out.dropLine);
  return out;
}

const args = parseArgs(process.argv);

const input = fs.createReadStream(args.input, { highWaterMark: 1024 * 1024 });
const output = fs.createWriteStream(args.output);

let lineNo = 1;
let skipped = 0;

input.on("data", (chunk) => {
  let start = 0;
  for (let i = 0; i < chunk.length; i++) {
    if (chunk[i] !== 10) continue; // '\n'
    const end = i + 1;
    if (lineNo !== args.dropLine) {
      output.write(chunk.subarray(start, end));
    } else {
      skipped += end - start;
    }
    lineNo++;
    start = end;
  }

  if (start < chunk.length) {
    if (lineNo !== args.dropLine) output.write(chunk.subarray(start));
    else skipped += chunk.length - start;
  }
});

input.on("end", () => {
  output.end();
  // eslint-disable-next-line no-console
  console.error(`Dropped line ${args.dropLine}. Skipped ~${skipped} byte(s). Output lines: ${lineNo - 1 - 1}.`);
});

input.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

output.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});
