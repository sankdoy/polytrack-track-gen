import fs from "node:fs";
import readline from "node:readline";

function usage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  node tools/dedupe-ndjson-by-name.mjs --input <in.ndjson> --output <out.ndjson>",
      "",
      "Options:",
      "  --case-sensitive    Treat names as case-sensitive (default: case-insensitive)",
      "  --keep-empty        Keep records with empty/missing names (default: drop after first empty)",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { input: null, output: null, caseSensitive: false, keepEmpty: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--input") out.input = argv[++i];
    else if (a === "--output") out.output = argv[++i];
    else if (a === "--case-sensitive") out.caseSensitive = true;
    else if (a === "--keep-empty") out.keepEmpty = true;
    else usage();
  }
  if (!out.input || !out.output) usage();
  return out;
}

const args = parseArgs(process.argv);

function normalizeName(name) {
  const s = String(name ?? "").trim().replace(/\s+/g, " ");
  return args.caseSensitive ? s : s.toLowerCase();
}

const input = fs.createReadStream(args.input, { encoding: "utf8" });
const rl = readline.createInterface({ input, crlfDelay: Infinity });
const output = fs.createWriteStream(args.output, { encoding: "utf8" });

const seen = new Set();
let total = 0;
let kept = 0;
let dropped = 0;
let bad = 0;

for await (const line of rl) {
  if (!line) continue;
  total++;

  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    bad++;
    continue;
  }

  const key = normalizeName(obj?.name);
  const isEmpty = !key;

  if (isEmpty && args.keepEmpty) {
    output.write(line + "\n");
    kept++;
    continue;
  }

  if (seen.has(key)) {
    dropped++;
    continue;
  }

  seen.add(key);
  output.write(line + "\n");
  kept++;
}

output.end();

// eslint-disable-next-line no-console
console.error(
  [
    `Total lines read: ${total}`,
    `Kept: ${kept}`,
    `Dropped (duplicate names): ${dropped}`,
    `Skipped (invalid JSON): ${bad}`,
    `Unique names kept: ${seen.size}`,
  ].join("\n"),
);

