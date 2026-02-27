import { COMMAND_CASES } from "./fixtures/command-cases.mjs";
import { buildCommandCase, renderDecodedAscii } from "./command-cases-lib.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const listOnly = args.includes("--list");

let selectedId = null;
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--id" && args[i + 1]) {
    selectedId = args[i + 1];
    i++;
    continue;
  }
  if (arg.startsWith("--id=")) {
    selectedId = arg.slice("--id=".length);
  }
}

if (listOnly) {
  for (const def of COMMAND_CASES) {
    // eslint-disable-next-line no-console
    console.log(`${def.id}\t${def.commands}\t${def.note || ""}`);
  }
  process.exit(0);
}

let defs = COMMAND_CASES;
if (selectedId) {
  defs = COMMAND_CASES.filter((d) => d.id === selectedId);
  if (!defs.length) {
    throw new Error(`Unknown case id "${selectedId}". Run with --list to inspect ids.`);
  }
}

const out = defs.map((def) => {
  const built = buildCommandCase(def);
  return {
    id: built.id,
    label: built.label,
    commands: built.commands,
    style: built.style,
    closed: built.closed,
    widthTiles: built.widthTiles,
    status: built.status,
    shareCode: built.shareCode,
    expectedShareCode: built.expectedShareCode,
    parts: built.parts,
    counts: built.counts,
    bbox: built.bbox,
    ascii: renderDecodedAscii(built.decoded),
  };
});

if (asJson) {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

for (const c of out) {
  // eslint-disable-next-line no-console
  console.log(`\n=== ${c.id} :: ${c.label} ===`);
  // eslint-disable-next-line no-console
  console.log(`commands: ${c.commands}`);
  // eslint-disable-next-line no-console
  console.log(`style=${c.style} closed=${c.closed} widthTiles=${c.widthTiles} status=${c.status} parts=${c.parts} bbox=${c.bbox.w}x${c.bbox.h}`);
  // eslint-disable-next-line no-console
  console.log(`counts=${JSON.stringify(c.counts)}`);
  // eslint-disable-next-line no-console
  console.log(`generated=${c.shareCode}`);
  if (c.expectedShareCode) {
    // eslint-disable-next-line no-console
    console.log(`expected=${c.expectedShareCode}`);
  } else {
    // eslint-disable-next-line no-console
    console.log("expected=<paste fixed share code in tools/fixtures/command-cases.mjs>");
  }
  // eslint-disable-next-line no-console
  console.log(`\n${c.ascii}`);
}
