// Offline controlled-I/O comparison, NOT an end-to-end checkout profile.
// Run from the app directory; baseline is the freshly fetched main for this audit.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { bestEffortCheckoutSideEffect } from "../src/lib/checkoutResilience.ts";

const baseline = process.argv[2] || "905ac521";
const routePath = "star-map-app-final/src/app/api/checkout/route.ts";
const sources = {
  before: execFileSync("git", ["show", `${baseline}:${routePath}`], { encoding: "utf8" }),
  after: fs.readFileSync(new URL("../src/app/api/checkout/route.ts", import.meta.url), "utf8"),
};
for (const [version, raw] of Object.entries(sources)) {
  const source = raw.replace(/\r\n/g, "\n");
  const start = source.indexOf("  const flushQueuedTimingCounters =");
  const end = source.indexOf("\n\n  const normalizedOrderType", start);
  if (start < 0 || end < 0) throw new Error("Route closure not found");
  const closure = source.slice(start, end).replace("async (): Promise<void>", "async ()");
  const makeFlush = new Function(
    "queuedTimingCounters", "input", "bestEffortCheckoutSideEffect",
    "recordCheckoutTimingCounter", "getCloudflareContext",
    `${closure}\nreturn flushQueuedTimingCounters;`,
  );
  const samples = [];
  for (let trial = 0; trial < 5; trial++) {
    const lifetimes = [];
    let completedWrites = 0;
    const flush = makeFlush([
      { counter: "printful_quote_lt1s", stage: "quote" },
      { counter: "url_recovery_fired", stage: "recovery" },
    ], {}, bestEffortCheckoutSideEffect, async () => {
      await delay(100);
      completedWrites++;
    }, () => ({ ctx: { waitUntil: (promise) => lifetimes.push(promise) } }));
    const startMs = performance.now();
    await flush();
    const responseWaitMs = performance.now() - startMs;
    await Promise.all(lifetimes);
    if (completedWrites !== 2) throw new Error("Lost telemetry");
    samples.push(Number(responseWaitMs.toFixed(2)));
  }
  const sorted = [...samples].sort((a, b) => a - b);
  console.log(JSON.stringify({ version, injectedDelayPerWriteMs: 100, writes: 2,
    responseWaitSamplesMs: samples, medianResponseWaitMs: sorted[2] }));
}
