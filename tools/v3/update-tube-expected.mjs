import fs from "node:fs";

import { analyzeTubeLogic, readShareCodeFromTrackCodes } from "./tube-logic-lib.mjs";

function usage() {
  // eslint-disable-next-line no-console
  console.error(
    [
      "Usage:",
      "  node tools/v3/update-tube-expected.mjs [--line <n>] [--out <path>]",
      "  node tools/v3/update-tube-expected.mjs --input <file-with-sharecode> [--out <path>]",
      "",
      "Defaults:",
      "  --line 51",
      "  --out tools/v3/tube-logic.expected.json",
    ].join("\n"),
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = {
    line: 51,
    outPath: "tools/v3/tube-logic.expected.json",
    input: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--line") out.line = Number(argv[++i]);
    else if (a === "--out") out.outPath = argv[++i];
    else if (a === "--input") out.input = argv[++i];
    else usage();
  }
  return out;
}

const args = parseArgs(process.argv);

let code;
let source;

if (args.input) {
  const lines = fs.readFileSync(args.input, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  if (!lines.length) throw new Error(`No non-empty lines in ${args.input}`);
  code = lines[0];
  source = { type: "input", path: args.input, line: 1 };
} else {
  code = readShareCodeFromTrackCodes({ line: args.line });
  source = { type: "track_codes_only", path: "TRACK_CODES_ONLY.txt", line: args.line };
}

const profile = analyzeTubeLogic(code);
if (!profile) throw new Error("Failed to decode or analyze share code");

const payload = {
  source,
  profile,
};

fs.writeFileSync(args.outPath, JSON.stringify(payload, null, 2), "utf8");

// eslint-disable-next-line no-console
console.log(`Wrote ${args.outPath}`);
// eslint-disable-next-line no-console
console.log(`Source: ${JSON.stringify(source)}`);
// eslint-disable-next-line no-console
console.log(`Tube parts: ${profile.tubePartCount}`);
