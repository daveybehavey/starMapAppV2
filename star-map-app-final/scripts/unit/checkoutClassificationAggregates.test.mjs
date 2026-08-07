import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const FUNNEL_PATH = path.join(ROOT, "src/lib/funnel.ts");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");
const FUNNEL_ROUTE = path.join(ROOT, "src/app/api/analytics/funnel/route.ts");
const FUNNEL_PAGE = path.join(ROOT, "src/app/funnel/page.tsx");

const KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "starmap-funnel-class-"));
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = KV_DIR;
process.env.CI = "1";

const {
  CHECKOUT_CLASSIFICATION_HANDOFFS,
  CHECKOUT_CLASSIFICATION_PLANS,
  CHECKOUT_CLASSIFICATION_SOURCES,
  CHECKOUT_CLASSIFICATION_STEPS,
  getCheckoutClassificationDiagnostics,
  normalizeCheckoutHandoff,
  recordCheckoutClassificationStep,
  sourceDailyKey,
  sourceKey,
  handoffDailyKey,
  handoffKey,
  planDailyKey,
  planKey,
} = await import("./checkoutClassificationAggregates.harness.mjs");

function memoryStore() {
  return /** @type {Map<string, unknown>} */ ((globalThis).__starmapKv ?? new Map());
}

function clearKv() {
  memoryStore().clear();
  for (const entry of fs.readdirSync(KV_DIR)) {
    fs.rmSync(path.join(KV_DIR, entry), { force: true, recursive: true });
  }
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

test("harness allowlists stay locked to funnel.ts fixed allowlists", () => {
  const funnel = fs.readFileSync(FUNNEL_PATH, "utf8");
  for (const source of CHECKOUT_CLASSIFICATION_SOURCES) {
    assert.match(funnel, new RegExp(`"${source}"`));
  }
  for (const plan of CHECKOUT_CLASSIFICATION_PLANS) {
    assert.match(funnel, new RegExp(`"${plan}"`));
  }
  for (const handoff of CHECKOUT_CLASSIFICATION_HANDOFFS) {
    assert.match(funnel, new RegExp(`"${handoff}"`));
  }
  for (const step of CHECKOUT_CLASSIFICATION_STEPS) {
    assert.match(funnel, new RegExp(`"${step}"`));
  }
  assert.match(funnel, /funnel:source_daily:\$\{date\}:\$\{step\}:\$\{source\}/);
  assert.match(funnel, /funnel:plan_daily:\$\{date\}:\$\{step\}:\$\{plan\}/);
  assert.match(funnel, /funnel:handoff_daily:\$\{date\}:\$\{step\}:\$\{handoff\}/);
  assert.match(funnel, /funnel:handoff:\$\{step\}:\$\{handoff\}/);
  assert.match(funnel, /checkoutClassification: CheckoutClassificationDiagnostics/);
  assert.match(funnel, /export async function getCheckoutClassificationDiagnostics/);
  assert.match(funnel, /normalizeCheckoutHandoff/);
  assert.match(funnel, /cleaned === "browser" \|\| cleaned === "missing"/);
});

test("normalizeCheckoutHandoff accepts only browser|missing (never raw tokens)", () => {
  assert.equal(normalizeCheckoutHandoff("browser"), "browser");
  assert.equal(normalizeCheckoutHandoff("missing"), "missing");
  assert.equal(normalizeCheckoutHandoff(" Browser "), "browser");
  assert.equal(normalizeCheckoutHandoff("b0123456789abcdef0"), null);
  assert.equal(normalizeCheckoutHandoff("browser_extra"), null);
  assert.equal(normalizeCheckoutHandoff(""), null);
  assert.equal(normalizeCheckoutHandoff(undefined), null);
});

test("record + diagnostics aggregate allowlisted source/plan/handoff with daily windows", async () => {
  clearKv();
  const occurredAt = `${todayUtc()}T12:00:00.000Z`;

  await recordCheckoutClassificationStep({
    step: "checkout_request_received",
    source: "checkout_api_print_post",
    plan: "poster_framed",
    handoff: "browser",
    occurredAt,
  });
  await recordCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "checkout_api_print_post",
    plan: "poster_framed",
    handoff: "browser",
    occurredAt,
  });
  await recordCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "checkout_api_digital_post",
    plan: "single",
    handoff: "missing",
    occurredAt,
  });

  assert.equal(memoryStore().get(sourceKey("checkout_session_created", "checkout_api_print_post")), 1);
  assert.equal(
    memoryStore().get(sourceDailyKey(todayUtc(), "checkout_session_created", "checkout_api_print_post")),
    1,
  );
  assert.equal(memoryStore().get(planKey("checkout_session_created", "poster_framed")), 1);
  assert.equal(memoryStore().get(planDailyKey(todayUtc(), "checkout_session_created", "single")), 1);
  assert.equal(memoryStore().get(handoffKey("checkout_session_created", "browser")), 1);
  assert.equal(memoryStore().get(handoffDailyKey(todayUtc(), "checkout_session_created", "missing")), 1);

  const diagnostics = await getCheckoutClassificationDiagnostics(7);
  assert.equal(diagnostics.schemaVersion, 1);
  assert.equal(diagnostics.notes.sourcePlanTotalsAreCumulative, true);
  assert.equal(diagnostics.notes.dailyWindowsSupportedGoingForward, true);
  assert.equal(diagnostics.notes.qaTrafficExcluded, true);
  assert.equal(diagnostics.notes.noRawHandoffTokens, true);

  const request = diagnostics.byStep.find((block) => block.step === "checkout_request_received");
  const session = diagnostics.byStep.find((block) => block.step === "checkout_session_created");
  assert.ok(request && session);

  const printPostRequest = request.sources.find((row) => row.key === "checkout_api_print_post");
  assert.equal(printPostRequest?.total, 1);
  assert.equal(printPostRequest?.windows.d1, 1);
  assert.equal(printPostRequest?.windows.d7, 1);
  assert.equal(printPostRequest?.windows.d30, 1);

  const printPostSession = session.sources.find((row) => row.key === "checkout_api_print_post");
  const digitalPostSession = session.sources.find((row) => row.key === "checkout_api_digital_post");
  assert.equal(printPostSession?.total, 1);
  assert.equal(digitalPostSession?.total, 1);

  const framed = session.plans.find((row) => row.key === "poster_framed");
  const single = session.plans.find((row) => row.key === "single");
  assert.equal(framed?.total, 1);
  assert.equal(single?.total, 1);

  const browser = session.handoffs.find((row) => row.key === "browser");
  const missing = session.handoffs.find((row) => row.key === "missing");
  assert.equal(browser?.total, 1);
  assert.equal(browser?.windows.d1, 1);
  assert.equal(missing?.total, 1);
  assert.equal(missing?.windows.d7, 1);

  assert.equal(memoryStore().get("funnel:total:checkout_session_created"), 2);
});

test("negative: raw handoff token is never stored or returned", async () => {
  clearKv();
  const rawToken = "b0123456789abcdef0";
  await recordCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "checkout_api_digital_post",
    plan: "single",
    handoff: rawToken,
    occurredAt: `${todayUtc()}T15:00:00.000Z`,
  });

  const keys = [...memoryStore().keys()];
  assert.equal(keys.some((key) => key.includes(rawToken)), false);
  assert.equal(keys.some((key) => key.includes("funnel:handoff:")), false);

  const diagnostics = await getCheckoutClassificationDiagnostics(1);
  const session = diagnostics.byStep.find((block) => block.step === "checkout_session_created");
  assert.equal(session?.handoffs.find((row) => row.key === "browser")?.total ?? 0, 0);
  assert.equal(session?.handoffs.find((row) => row.key === "missing")?.total ?? 0, 0);
  assert.equal(JSON.stringify(diagnostics).includes(rawToken), false);
});

test("negative: diagnostics never enumerate arbitrary KV keys outside allowlist", async () => {
  clearKv();
  await recordCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "some_unknown_probe_source",
    plan: "mystery_plan",
    handoff: "browser",
  });

  const diagnostics = await getCheckoutClassificationDiagnostics(1);
  const session = diagnostics.byStep.find((block) => block.step === "checkout_session_created");
  assert.ok(session);
  assert.deepEqual(
    session.sources.map((row) => row.key),
    [...CHECKOUT_CLASSIFICATION_SOURCES],
  );
  assert.deepEqual(
    session.plans.map((row) => row.key),
    [...CHECKOUT_CLASSIFICATION_PLANS],
  );
  assert.deepEqual(
    session.handoffs.map((row) => row.key),
    [...CHECKOUT_CLASSIFICATION_HANDOFFS],
  );
  assert.equal(session.sources.some((row) => row.key === "some_unknown_probe_source"), false);
  assert.equal(session.plans.some((row) => row.key === "mystery_plan"), false);
});

test("negative: QA checkout does not increment production classification", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /if\s*\(\s*!qaContext\.enabled\s*\)\s*\{\s*\n\s*await recordFunnelStep/);
  assert.match(route, /handoff: checkoutHandoff/);
  assert.match(route, /handoff: "missing"/);

  const funnelCallPattern =
    /if\s*\(\s*!qaContext\.enabled\s*\)\s*\{[\s\S]*?await recordFunnelStep\(\{[\s\S]*?source: orderType === "print" \? "checkout_api_(?:print|digital)_(?:post|get)"[\s\S]*?handoff: (?:checkoutHandoff|"missing")[\s\S]*?\}/g;
  const gatedCalls = route.match(funnelCallPattern) || [];
  assert.ok(gatedCalls.length >= 3, `expected >=3 QA-gated classification writes, got ${gatedCalls.length}`);

  assert.equal(route.includes("handoff: body?.checkoutHandoff"), false);
  assert.equal(route.includes("handoff: body.checkoutHandoff"), false);
  assert.match(route, /checkoutHandoff = resolveCheckoutHandoff\(body\?\.checkoutHandoff\)/);
  assert.match(route, /metadata\.checkout_handoff = checkoutHandoff === "browser" \? "browser" : "missing"/);
});

test("funnel diagnostic contract exposes classification without weakening auth/rate limits", () => {
  const route = fs.readFileSync(FUNNEL_ROUTE, "utf8");
  const page = fs.readFileSync(FUNNEL_PAGE, "utf8");
  assert.match(route, /getFunnelDashboard\(daysParam\)/);
  assert.match(route, /checkRateLimit\(`analytics:funnel:get:\$\{ip\}`, 20, 60\)/);
  assert.match(route, /hasDashboardAccess\(req\)/);
  assert.match(page, /checkoutClassification/);
  assert.match(page, /Checkout classification \(safe aggregates\)/);
});
