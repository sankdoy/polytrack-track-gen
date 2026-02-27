import zlib from "node:zlib";
if (!globalThis.pako) globalThis.pako = {
  deflate: d => zlib.deflateSync(Buffer.from(d)),
  inflate: d => zlib.inflateSync(Buffer.from(d)),
};

import { decodePolyTrack1, blockName } from "./polytrack1/lib.mjs";

const BROKEN = "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";

const FIXED  = "PolyTrack14pdXVeYpJEFKK8rkZbXKab2WtN7ODIqtp2E2epf4fZ2NVRBF3LhTdAeRqdlrLlURL1giK81xRExahSVgeCuBkIo10LEkJL9U3DPgmKkKkaN5Sih99f0fVz68fygmefqvH8fdKqn6fmeZkd77ffFjLayL2hHenEaXuqhlO1W1a11wia3ahvC1110wjf1E993aNXSdPzlDTNXNRtTNphv2vPORczlKzYnFMVb1OBnPxKhPu33S81nBQuVl20CxTvafdi0flgTnBoZfJyxeiQ9erELeJHQ9DJq95rMMfcOKhZT8I5rNT3qI6A7IBrom9Pr9pM69XeFKr9Y8k8zqJbTVT7zeXdms2EJsKYoBEeXXy0bIjQOAanIzYQFgdoyxylyooy3snvsls7KktfmzB7JJq6l75682rYmEpaD8qm1ARZrofKxoa26AFrHwH8Bz7rYoO6lgILDB1HleHOWODCPX9XzNKiitP7R5eLMY6J2l4hZnd7ilRlPNs1WMssmUuCBDtkNyAieNzMSDoqXBglamvBUMrM6ag9mm34isUz1mnl6Axu0hnl2XhNVygRvls3PhLhwPOZCXtvLrit9Mdagf1OuXEv6ehecFepxrf9IOPYVzYpKusc7Xr8YUURX0rsXGMOzqIhz3zynGDrL6MBeJBHtvDwJX4w0Ef4xefCgqqbShK8bejEP6yeVMBJAmfD5eHWnZ8jjGfLbl1DcYY64b8hZlJzIhIoerBDGe2BFjMljxmDsRmQYu0ek8p2el9t6FijCHlJzuE9f1xWfZNpjSpvRVOMtxJ48pLNfysxl1jRrHkRnBGVVuJrJzBwlHKY5IZeztXceXFgGX8RaFj0suSY4UocdWBSA5eJk71ZsF5vkklVmhce9T3eglyROSxVWfVRrPrOHMIl5FF5dmXu7n0969XXqYRK9ZgZcLIVufOoQW3Ceq4OP9gSf35bPfRRen4ArzpVmT1lUD1RlFF32BpbfLSRXguK7889jQygzdzYSiPDNRuDe4easLKIvptPFETys5XA5P31p6I8XfcZlwcdXc9q9lz2zlTnX7D3xB8Pn1CXf0FxyfOubb1MRcdGNbJvlREghmHVUH88RpIVNFhfzH09apLSr0g6pN5et7UzpW0RmxHCqu5lYGQSWu5j8ChrHegi8bbGuDe5ghn8lRuK5pdnOdkwvHOu44ilf6UjXEXEJrqfldWMWafPhbFIwethVVP9ieETmodXs0acoEvvcxrHLyDdkfgMxle0yPCJwl00mFX48EEhv4wg2L7lQ0MaZ21LZcZRTlxZFqPJVqN5KcaeFeWQdcq9c4nCfQxrtXOufW2KZrWKPFiyUvpGc9i2foqqWP8FysORHK3pPdWpSHbayS9QMYtKAOBUXGYVT7POTXPFv1hWCp4tZLyNqJcvNXwEaeUj8lXC2gkutJx5KAhlbeJNKfFWV8o90lbhRos2QxCFERejD86AqViucNv7reTmgOmfjpDHTvCccexmtrgGIJFTeuYkA0e8vYWAX2SGc6I20LAHsLIAxivE1EvTkyf7jpfU3bWEPGoyMgmreB5FhaPUpd6Dp138RWnQbEVdMNdRpnXQBJG6w19uWp4gJSK8lL3yQxx3WzFOVfyyhAeCK6bWILMEISptB2fkPw2GPahZRHsm1KqbnZE4EwDIsaev1sag37ejsqfmWeebXblE2ZWw9SV6D1TyNf9jzVgBJ2tcvGH5vf6qley3EMB8hsyoPndd8NHJ5TuEcN0CHcTw5fhDARh1oIf0i7JcxYp5GU2NvPgxKdiIELOzigTpe0m7RU3U2gfRb9LEJz4Qf6XA67p4L0rIqbOOOSQh4jIRTnq0k0QwDlReLKTryD4xXw3duRIrydryeavV0eQfXOT3WTYoTbOyNMNarygRQh6d4FwtN04YRcGdQqO5wcbh3YubCXxxJ1FFsshkYCwQqo3zHRBNTkmUYMKcz4RnQHGQngCbuMlBJYlkCqAK4Rzlu5PQhuFVb94ctyutXUxmvEXv5k836AWhfcnGkEj6ABCbe4ULE2qecu8yy77nMFmYcYRg1aDifHVwADiOC14wcWaUsudSpmxH31o21SYYf8We5tV5VdaNUnLpT55k41T1C0SeTN8e6Pyp6I58mMIHMtAoK7ycYeeHJqzeE3PwRUqVl7UKMpGGl3Rut8I09VvBl0ZZoeYWVfTDEq3fm2N9zKnjW6m8OVEcajgJl3IkUI6KYe3bLea72P1kQkWFuL1ipsYMJlXcM6epUNATg1QKfHiFL77E";

const b = decodePolyTrack1(BROKEN);
const f = decodePolyTrack1(FIXED);

// Count by block type
function count(parts) {
  const c = {};
  for (const p of parts) c[p.blockType] = (c[p.blockType] || 0) + 1;
  return c;
}
const bc = count(b.parts), fc = count(f.parts);
const allTypes = new Set([...Object.keys(bc), ...Object.keys(fc)].map(Number));

console.log("Block type differences (broken vs fixed):");
let changed = false;
for (const t of [...allTypes].sort((a, b) => a - b)) {
  const bv = bc[t] || 0, fv = fc[t] || 0;
  if (bv !== fv) {
    console.log(`  type ${String(t).padStart(3)} (${blockName(t) || "?"}) | broken: ${bv} | fixed: ${fv} | diff: ${fv - bv > 0 ? "+" : ""}${fv - bv}`);
    changed = true;
  }
}
if (!changed) console.log("  (no differences in piece counts)");
console.log(`Total: broken=${b.parts.length}, fixed=${f.parts.length}`);

// Find pieces that are in broken but not in fixed (by position)
function key(p) { return `${p.x},${p.y},${p.z},${p.blockType},${p.rotation}`; }
const bKeys = new Set(b.parts.map(key));
const fKeys = new Set(f.parts.map(key));

const onlyInBroken = b.parts.filter(p => !fKeys.has(key(p)));
const onlyInFixed  = f.parts.filter(p => !bKeys.has(key(p)));

console.log(`\nPieces only in BROKEN (${onlyInBroken.length}):`);
for (const p of onlyInBroken.slice(0, 20)) {
  console.log(`  type=${p.blockType}(${blockName(p.blockType)||"?"}) rot=${p.rotation} @ (${p.x},${p.y},${p.z})`);
}

console.log(`\nPieces only in FIXED (${onlyInFixed.length}):`);
for (const p of onlyInFixed.slice(0, 20)) {
  console.log(`  type=${p.blockType}(${blockName(p.blockType)||"?"}) rot=${p.rotation} @ (${p.x},${p.y},${p.z})`);
}
