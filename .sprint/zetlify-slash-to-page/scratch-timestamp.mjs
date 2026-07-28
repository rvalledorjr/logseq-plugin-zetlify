import assert from "node:assert/strict";

// Inline copy of makeTimestampName for a dependency-free sanity check
// (mirrors src/timestamp.ts exactly).
function makeTimestampName(d = new Date()) {
  const p = (n, len = 2) => String(n).padStart(len, "0");
  const centis = Math.floor(d.getMilliseconds() / 10);
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) +
    p(d.getMinutes()) +
    p(d.getSeconds()) +
    p(centis)
  );
}

const name = makeTimestampName(new Date("2026-02-06T09:32:45.107"));
assert.equal(name, "2026020609324510", `expected 2026020609324510, got ${name}`);
assert.equal(name.length, 16, "must be exactly 16 chars");

console.log("OK:", name);
