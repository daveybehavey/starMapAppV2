import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { isQaStripeSession } from "../../src/lib/commerceAnalyticsQa.mjs";
import { formatAggregateReport, runFunnelReconcile } from "../funnel-reconcile.mjs";

const routeSource = fs.readFileSync(new URL("../../src/app/api/analytics/funnel/reconcile/route.ts", import.meta.url), "utf8");
const executable = stripTypeScriptTypes(routeSource.replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, ""));
const now = Date.parse("2026-11-18T20:00:00Z");
const fixture = (id, extra = {}) => ({ id, created: now / 1000 - 60, livemode: true,
  payment_status: "paid", amount_total: 1000, metadata: { plan: "single" }, ...extra });

function harness(pages = [{ data: [], has_more: false }], { authorized = true, configured = true, recorded = [] } = {}) {
  const calls = [];
  const reads = [];
  let index = 0;
  class FakeStripe {
    static createFetchHttpClient() { return {}; }
    checkout = { sessions: { list: async (query) => {
      calls.push(query);
      const page = pages[index++];
      if (page instanceof Error) throw page;
      assert.ok(page, "unexpected provider page");
      return page;
    } } };
  }
  class FrozenDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const context = vm.createContext({
    Date: FrozenDate, Stripe: FakeStripe,
    process: { env: { STRIPE_SECRET_KEY: configured ? "synthetic-placeholder" : "", PRINT_ADMIN_TOKEN: "synthetic-placeholder" } },
    NextResponse: { json: (body, options) => ({ status: options?.status ?? 200, body: JSON.parse(JSON.stringify(body)) }) },
    hasValidAdminToken: () => authorized, readAdminTokenFromHeaders: () => "synthetic-placeholder",
    isQaStripeSession,
    hasPaymentVerifiedRecord: async (id) => { reads.push(id); return recorded.includes(id); },
    // Negative controls: execution must never reach either old mutation dependency.
    recordPaymentVerifiedOnce: () => { assert.fail("session repair wrote"); },
    syncPaymentVerifiedWindow: () => { assert.fail("aggregate replacement wrote"); },
  });
  vm.runInContext(executable, context);
  return { calls, reads, post: (body = {}, malformed = false) => context.POST({ headers: {},
    json: async () => { if (malformed) throw new SyntaxError("synthetic invalid JSON"); return body; },
  }) };
}

for (const [label, body, malformed] of [
  ["missing body", undefined, true], ["malformed JSON", {}, true], ["null", null], ["array", []],
  ["boolean", false], ["string boolean", { dryRun: "false" }], ["null boolean", { dryRun: null }],
  ["fractional days", { days: 1.5 }], ["out-of-range limit", { limit: 501 }],
  ["string days", { days: "14" }], ["misspelled option", { dryrun: false }],
]) {
  test(`invalid request fails without provider reads or writes: ${label}`, async () => {
    const h = harness();
    assert.equal((await h.post(body, malformed)).status, 400);
    assert.equal(h.calls.length, 0);
    assert.equal(h.reads.length, 0);
  });
}

test("auth runs before request parsing and scanning", async () => {
  const h = harness([], { authorized: false });
  assert.equal((await h.post({}, true)).status, 401);
  assert.equal(h.calls.length, 0);
});
test("unconfigured provider reports 503", async () => {
  assert.equal((await harness([], { configured: false }).post()).status, 503);
});
test("explicit apply fails closed, including repeated calls", async () => {
  const h = harness();
  for (let i = 0; i < 2; i++) {
    const result = await h.post({ dryRun: false });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, "apply_unavailable");
  }
  assert.equal(h.calls.length, 0);
  assert.equal(h.reads.length, 0);
});
test("omitted dryRun previews only live non-QA paid StarMap sessions", async () => {
  const data = [fixture("normal"), fixture("qa", { metadata: { plan: "single", qa_run: "true" } }),
    fixture("test", { livemode: false }), fixture("unknown-mode", { livemode: undefined }),
    fixture("unpaid", { payment_status: "unpaid" }), fixture("unrelated", { metadata: {} })];
  const h = harness([{ data, has_more: false }]);
  const result = await h.post({ days: 1 });
  assert.equal(result.status, 200);
  assert.equal(result.body.dryRun, true);
  assert.equal(result.body.complete, true);
  assert.equal(result.body.applyAvailable, false);
  assert.equal(result.body.eligible, 1);
  assert.equal(result.body.excludedQa, 1);
  assert.equal(result.body.excludedTest, 2);
  assert.equal(result.body.repaired, 0);
  assert.equal(result.body.wouldRepair, 1);
  assert.deepEqual(result.body.countsByDate, { "2026-11-18": 1 });
  assert.deepEqual(h.reads, ["normal"]);
  assert.equal("results" in result.body, false);
});
test("all existing QA classifier variants are excluded before counts and marker reads", async () => {
  const data = [fixture("ops", { metadata: { qa_ops_checkout: "yes" } }),
    fixture("source", { metadata: { qa_source: "live_print_conversion_check" } }),
    fixture("ref", { client_reference_id: "qa-live-conversion" })];
  const h = harness([{ data, has_more: false }]);
  const { body } = await h.post();
  assert.equal(body.eligible, 0);
  assert.equal(body.excludedQa, 3);
  assert.equal(h.reads.length, 0);
});
test("UTC calendar window is frozen and includes zero-count dates", async () => {
  const start = Date.parse("2026-11-17T00:00:00Z") / 1000;
  const h = harness([{ data: [fixture("first", { created: start })], has_more: true },
    { data: [fixture("last")], has_more: false }], { recorded: ["first"] });
  const { body } = await h.post({ days: 2 });
  for (const call of h.calls) {
    assert.equal(call.created.gte, start);
    assert.equal(call.created.lt, now / 1000);
  }
  assert.equal(h.calls[1].starting_after, "first");
  assert.equal(body.alreadyRecorded, 1);
  assert.equal(body.wouldRepair, 1);
  assert.deepEqual(body.countsByDate, { "2026-11-17": 1, "2026-11-18": 1 });
  const empty = await harness().post({ days: 2 });
  assert.deepEqual(empty.body.countsByDate, { "2026-11-17": 0, "2026-11-18": 0 });
});
for (const [label, pages, options] of [
  ["limit", [{ data: [fixture("one")], has_more: true }], { limit: 1 }],
  ["unpaid limit", [{ data: [fixture("one", { payment_status: "unpaid" })], has_more: true }], { limit: 1 }],
  ["empty page with more", [{ data: [], has_more: true }], {}],
  ["missing completeness flag", [{ data: [] }], {}],
  ["repeated cursor", [{ data: [fixture("one")], has_more: true }, { data: [fixture("one")], has_more: false }], {}],
  ["out of window", [{ data: [fixture("future", { created: now / 1000 })], has_more: false }], {}],
]) {
  test(`incomplete ${label} returns no authoritative totals or marker reads`, async () => {
    const h = harness(pages);
    const result = await h.post(options);
    assert.equal(result.status, 409);
    assert.equal(result.body.complete, false);
    assert.equal("countsByDate" in result.body, false);
    assert.equal(h.reads.length, 0);
  });
}
test("complete page exactly at limit succeeds as a preview", async () => {
  const result = await harness([{ data: [fixture("one")], has_more: false }]).post({ limit: 1 });
  assert.equal(result.status, 200);
});
test("second-page failure returns a redacted error without partial totals", async () => {
  const h = harness([{ data: [fixture("one")], has_more: true }, new Error("private-provider-detail")]);
  const result = await h.post();
  assert.equal(result.status, 502);
  assert.equal(h.reads.length, 0);
  assert.equal(JSON.stringify(result).includes("private-provider-detail"), false);
});
test("unsafe replacement helper is removed; route has no mutation imports", () => {
  const funnel = fs.readFileSync(new URL("../../src/lib/funnel.ts", import.meta.url), "utf8");
  assert.equal(funnel.includes("syncPaymentVerifiedWindow"), false);
  assert.equal(routeSource.includes("recordPaymentVerifiedOnce"), false);
});
test("CLI displays preview candidates without claiming repairs or exposing sessions", () => {
  const report = formatAggregateReport({ dryRun: true, site: "https://example.com", days: 1, limit: 100 },
    { repaired: 0, wouldRepair: 2, complete: true, applyAvailable: false, excludedQa: 1,
      excludedTest: 1, results: [{ sessionId: "private-session" }] });
  assert.match(report, /would_repair: 2/);
  assert.match(report, /scan_complete: true/);
  assert.match(report, /apply_available: false/);
  assert.equal(report.includes("private-session"), false);
});
test("CLI treats refused apply/incomplete scans as failures without echoing body", async () => {
  let stderr = "";
  const code = await runFunnelReconcile({ argv: ["--site", "https://example.com"], loadEnv: false,
    env: { PRINT_ADMIN_TOKEN: "synthetic-placeholder" },
    fetchImpl: async () => ({ status: 409, text: async () => JSON.stringify({ error: "private-detail" }) }),
    stdout: { write() { assert.fail("no success report"); } }, stderr: { write(text) { stderr += text; } },
  });
  assert.equal(code, 1);
  assert.match(stderr, /refused/);
  assert.equal(stderr.includes("private-detail"), false);
});
