import assert from "node:assert/strict";
import fs from "node:fs";
import { register } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Real src module has an extensionless sibling import; register the shared
// loader before dynamically importing it (static imports hoist past register).
register("./tsAliasLoader.mjs", import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const EDITOR = path.join(ROOT, "src/components/EditorExperience.tsx");
const CLIENT_TIMING = path.join(ROOT, "src/lib/checkoutClientTiming.ts");
const SERVER_TIMING = path.join(ROOT, "src/lib/checkoutTiming.ts");

const {
  CHECKOUT_CLIENT_TIMING_STAGES,
  buildCheckoutClientTimingLog,
  checkoutClientTimingDeltas,
  checkoutClientTimingElapsedMs,
  checkoutClientTimingMarkedStages,
  createCheckoutClientTimingCollector,
  logCheckoutClientTiming,
  markCheckoutClientTiming,
} = await import("../../src/lib/checkoutClientTiming.ts");
const { roundTimingMs } = await import("../../src/lib/checkoutTiming.ts");

test("client timing: stages are ordered submit → request → response → redirect", () => {
  assert.deepEqual([...CHECKOUT_CLIENT_TIMING_STAGES], [
    "submit",
    "request_sent",
    "response_received",
    "redirect",
  ]);
});

test("client timing: marks emit in order with sane positive deltas", () => {
  const collector = createCheckoutClientTimingCollector(1_000);
  markCheckoutClientTiming(collector, "submit", { atPerf: 1_000 });
  markCheckoutClientTiming(collector, "request_sent", { atPerf: 1_250.04 });
  markCheckoutClientTiming(collector, "response_received", { atPerf: 4_000 });
  markCheckoutClientTiming(collector, "redirect", { atPerf: 4_080.06 });

  assert.deepEqual(checkoutClientTimingMarkedStages(collector), [
    "submit",
    "request_sent",
    "response_received",
    "redirect",
  ]);

  const deltas = checkoutClientTimingDeltas(collector);
  assert.equal(deltas.submitMs, 0);
  assert.equal(deltas.requestSentMs, 250);
  assert.equal(deltas.responseReceivedMs, 3_000);
  assert.equal(deltas.redirectMs, 3_080.1);
  assert.equal(deltas.submitToRequestMs, 250);
  assert.equal(deltas.requestToResponseMs, 2_750);
  assert.equal(deltas.responseToRedirectMs, 80.1);
  assert.equal(deltas.totalMs, 3_080.1);

  // Segment deltas are non-negative and sum to total (within rounding).
  assert.ok(deltas.submitToRequestMs >= 0);
  assert.ok(deltas.requestToResponseMs >= 0);
  assert.ok(deltas.responseToRedirectMs >= 0);
  const segmentSum =
    deltas.submitToRequestMs + deltas.requestToResponseMs + deltas.responseToRedirectMs;
  assert.equal(roundTimingMs(segmentSum), deltas.totalMs);
});

test("client timing: first mark wins unless overwrite is requested", () => {
  const collector = createCheckoutClientTimingCollector(0);
  markCheckoutClientTiming(collector, "request_sent", { atPerf: 10 });
  markCheckoutClientTiming(collector, "request_sent", { atPerf: 99 });
  assert.equal(collector.marks.request_sent, 10);
  markCheckoutClientTiming(collector, "response_received", { atPerf: 50 });
  markCheckoutClientTiming(collector, "response_received", {
    atPerf: 80,
    overwrite: true,
  });
  assert.equal(collector.marks.response_received, 80);
});

test("client timing: unset stages stay null and never coerce to 0", () => {
  const collector = createCheckoutClientTimingCollector(100);
  markCheckoutClientTiming(collector, "submit", { atPerf: 100 });
  markCheckoutClientTiming(collector, "request_sent", { atPerf: 180 });
  const deltas = checkoutClientTimingDeltas(collector);
  assert.equal(deltas.responseReceivedMs, null);
  assert.equal(deltas.redirectMs, null);
  assert.equal(deltas.requestToResponseMs, null);
  assert.equal(deltas.responseToRedirectMs, null);
  assert.equal(deltas.submitToRequestMs, 80);
  assert.equal(deltas.totalMs, 80);
  assert.equal(checkoutClientTimingElapsedMs(collector, "redirect"), null);
  assert.equal(checkoutClientTimingElapsedMs(collector, "request_sent"), 80);
});

test("client timing: log builder mirrors checkout_timing shape with client marker", () => {
  const collector = createCheckoutClientTimingCollector(0);
  markCheckoutClientTiming(collector, "submit", { atPerf: 0 });
  markCheckoutClientTiming(collector, "request_sent", { atPerf: 40 });
  markCheckoutClientTiming(collector, "response_received", { atPerf: 900 });
  markCheckoutClientTiming(collector, "redirect", { atPerf: 950 });
  const log = buildCheckoutClientTimingLog({
    collector,
    correlationId: "corr-client-1",
    outcome: "created",
    method: "POST",
  });
  assert.equal(log.client, true);
  assert.equal(log.correlationId, "corr-client-1");
  assert.equal(log.method, "POST");
  assert.equal(log.outcome, "created");
  assert.equal(log.stages, "submit>request_sent>response_received>redirect");
  assert.equal(log.totalMs, 950);
  assert.equal(log.submitToRequestMs, 40);
  assert.equal(log.requestToResponseMs, 860);
  assert.equal(log.responseToRedirectMs, 50);
  // No cart / PII fields on the payload.
  assert.equal("plan" in log, false);
  assert.equal("email" in log, false);
  assert.equal("mapId" in log, false);
  assert.equal("checkoutKind" in log, false);
});

test("client timing: emit is inert and uses the server event name", () => {
  const collector = createCheckoutClientTimingCollector(0);
  markCheckoutClientTiming(collector, "submit", { atPerf: 0 });
  markCheckoutClientTiming(collector, "redirect", { atPerf: 12 });

  const originalInfo = console.info;
  const lines = [];
  console.info = (...args) => {
    lines.push(args);
  };
  const tracked = [];
  try {
    logCheckoutClientTiming(
      { collector, outcome: "created", correlationId: "corr-emit" },
      {
        track: (event, props) => {
          tracked.push({ event, props });
        },
      }
    );
    // Throwing track must not escape.
    logCheckoutClientTiming(
      { collector, outcome: "error" },
      {
        track: () => {
          throw new Error("track unavailable");
        },
      }
    );
  } finally {
    console.info = originalInfo;
  }

  assert.equal(lines.length, 2);
  assert.equal(lines[0][0], "checkout_timing");
  assert.equal(lines[0][1].client, true);
  assert.equal(lines[0][1].correlationId, "corr-emit");
  assert.equal(tracked.length, 1);
  assert.equal(tracked[0].event, "checkout_timing");
  assert.equal(tracked[0].props.client, true);
});

test("source: client helper reuses server rounding and stays measurement-only", () => {
  const clientSrc = fs.readFileSync(CLIENT_TIMING, "utf8");
  const serverSrc = fs.readFileSync(SERVER_TIMING, "utf8");
  assert.match(clientSrc, /from "\.\/checkoutTiming"/);
  assert.match(clientSrc, /roundTimingMs/);
  assert.match(clientSrc, /client: true/);
  assert.match(clientSrc, /console\.info\("checkout_timing"/);
  assert.match(clientSrc, /measurement only/i);
  assert.match(serverSrc, /console\.info\("checkout_timing"/);
});

test("source: editor checkout path marks submit/request/response/redirect", () => {
  const editor = fs.readFileSync(EDITOR, "utf8");
  assert.match(editor, /createCheckoutClientTimingCollector/);
  assert.match(editor, /markCheckoutClientTiming/);
  assert.match(editor, /logCheckoutClientTiming/);
  assert.match(editor, /"submit"/);
  assert.match(editor, /"request_sent"/);
  assert.match(editor, /"response_received"/);
  assert.match(editor, /"redirect"/);
  // Measurement must not introduce a dedicated timing network call.
  assert.doesNotMatch(editor, /fetch\(["'`]\/api\/checkout[-_]timing/);
});
