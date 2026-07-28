export function makeTimestampName(d: Date = new Date()): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  const centis = Math.floor(d.getMilliseconds() / 10); // 0..99
  return (
    d.getFullYear().toString() +
    p(d.getMonth() + 1) +
    p(d.getDate()) +
    p(d.getHours()) + // 24-hour
    p(d.getMinutes()) +
    p(d.getSeconds()) +
    p(centis)
  );
}

// Returns a page name guaranteed not to already exist.
export async function makeUniquePageName(): Promise<string> {
  let base = makeTimestampName();
  let candidate = base;
  let attempt = 0;
  // getPage returns null when the page doesn't exist.
  while ((await logseq.Editor.getPage(candidate)) !== null) {
    attempt += 1;
    // Regenerate from a fresh clock; if still colliding, append a counter.
    const fresh = makeTimestampName();
    candidate = fresh !== base ? fresh : `${base}${String(attempt).padStart(2, "0")}`;
    base = candidate;
    if (attempt > 50) throw new Error("zetlify: could not allocate unique page name");
  }
  return candidate;
}
