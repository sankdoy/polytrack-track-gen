import fs from "node:fs";
import { TextDecoder } from "node:util";

function usage() {
  // eslint-disable-next-line no-console
  console.error("Usage: node tools/ndjson/array-to-ndjson.mjs <input.json> <output.ndjson>");
  process.exit(2);
}

const inputPath = process.argv[2];
const outputPath = process.argv[3];
if (!inputPath || !outputPath) usage();

const input = fs.createReadStream(inputPath, { highWaterMark: 1024 * 1024 });
const output = fs.createWriteStream(outputPath, { encoding: "utf8" });
const decoder = new TextDecoder("utf-8");

let startedArray = false;
let depth = 0;
let inString = false;
let escape = false;
let elementStarted = false;
let wroteAnyElement = false;

let outBuf = "";
let records = 0;

function flush(force = false) {
  if (!outBuf) return;
  if (!force && outBuf.length < 1024 * 1024) return;
  output.write(outBuf);
  outBuf = "";
}

function endElement() {
  if (!elementStarted) return;
  outBuf += "\n";
  flush();
  elementStarted = false;
  wroteAnyElement = true;
  records++;
}

input.on("data", (chunk) => {
  const text = decoder.decode(chunk, { stream: true });

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (!startedArray) {
      if (ch === "[") {
        startedArray = true;
        depth = 1;
      }
      continue;
    }

    if (!elementStarted) {
      if (ch === "]") break;
      if (ch === "," || ch === " " || ch === "\n" || ch === "\r" || ch === "\t") continue;
      elementStarted = true;
    }

    if (!inString && depth === 1) {
      if (ch === ",") {
        endElement();
        continue;
      }
      if (ch === "]") {
        endElement();
        break;
      }
    }

    outBuf += ch;

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === "\"") {
        inString = false;
      }
    } else {
      if (ch === "\"") {
        inString = true;
        escape = false;
      } else if (ch === "{" || ch === "[") {
        depth++;
      } else if (ch === "}" || ch === "]") {
        depth--;
      }
    }

    flush();
  }
});

input.on("end", () => {
  decoder.decode(new Uint8Array(), { stream: false });
  if (elementStarted) endElement();
  flush(true);
  output.end();

  // eslint-disable-next-line no-console
  console.log(`Wrote ${records} record(s) to ${outputPath}${wroteAnyElement ? "" : " (no elements found)"}`);
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
