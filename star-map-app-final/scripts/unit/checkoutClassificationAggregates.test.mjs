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
const DOCS_PATH = path.join(ROOT, "docs/PURCHASE_ANALYTICS.md");

const KV_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "starmap-funnel-class-"));
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.STARMAP_KV_DIR = KV_DIR;
process.env.CI = "1";

const {
  CHECKOUT_CLASSIFICATION_HANDOFFS,
  CHECKOUT_CLASSIFICATION_KV_PREFIX,
  CHECKOUT_CLASSIFICATION_PLANS,
  CHECKOUT_CLASSIFICATION_SOURCES,
  CHECKOUT_CLASSIFICATION_STEPS,
  CHECKOUT_CLASSIFICATION_TOTAL_RETENTION_DAYS,
  getCheckoutClassificationDiagnostics,
  isProtectedCheckoutClassificationWrite,
  legacyPlanKey,
  legacySourceKey,
  normalizeCheckoutHandoff,
  recordFunnelStepMirror,
  recordTrustedCheckoutClassificationStep,
  trustedCheckoutHandoffDailyKey,
  trustedCheckoutHandoffKey,
  trustedCheckoutPlanDailyKey,
  trustedCheckoutPlanKey,
  trustedCheckoutSourceDailyKey,
  trustedCheckoutSourceKey,
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
  assert.equal(CHECKOUT_CLASSIFICATION_TOTAL_RETENTION_DAYS, 180);
  assert.equal(CHECKOUT_CLASSIFICATION_KV_PREFIX, "funnel:checkout_class");
  assert.match(funnel, /CHECKOUT_CLASSIFICATION_TOTAL_RETENTION_DAYS = 180/);
  assert.match(funnel, /CHECKOUT_CLASSIFICATION_KV_PREFIX = "funnel:checkout_class"/);
  assert.match(funnel, /\$\{CHECKOUT_CLASSIFICATION_KV_PREFIX\}:source:\$\{step\}:\$\{source\}/);
  assert.match(funnel, /\$\{CHECKOUT_CLASSIFICATION_KV_PREFIX\}:source_daily:\$\{date\}:\$\{step\}:\$\{source\}/);
  assert.match(funnel, /\$\{CHECKOUT_CLASSIFICATION_KV_PREFIX\}:plan:\$\{step\}:\$\{plan\}/);
  assert.match(funnel, /\$\{CHECKOUT_CLASSIFICATION_KV_PREFIX\}:handoff:\$\{step\}:\$\{handoff\}/);
  assert.match(funnel, /trustedTotalsUseCleanNamespace: true/);
  assert.match(funnel, /trustedCheckoutClassification/);
  assert.match(funnel, /trustedCheckoutWritesOnly: true/);
  assert.match(funnel, /sourcePlanTotalsRetainUpTo180Days: true/);
  assert.match(funnel, /browserMeansHandoffNotVerifiedHuman: true/);
  assert.equal(funnel.includes("sourcePlanTotalsAreCumulative"), false);
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

test("positive: trusted checkout path records allowlisted dims in clean namespace with daily windows", async () => {
  clearKv();
  const occurredAt = `${todayUtc()}T12:00:00.000Z`;

  await recordTrustedCheckoutClassificationStep({
    step: "checkout_request_received",
    source: "checkout_api_print_post",
    plan: "poster_framed",
    handoff: "browser",
    occurredAt,
  });
  await recordTrustedCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "checkout_api_print_post",
    plan: "poster_framed",
    handoff: "browser",
    occurredAt,
  });
  await recordTrustedCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "checkout_api_digital_post",
    plan: "single",
    handoff: "missing",
    occurredAt,
  });

  assert.equal(
    memoryStore().get(trustedCheckoutSourceKey("checkout_session_created", "checkout_api_print_post")),
    1,
  );
  assert.equal(
    memoryStore().get(
      trustedCheckoutSourceDailyKey(todayUtc(), "checkout_session_created", "checkout_api_print_post"),
    ),
    1,
  );
  assert.equal(memoryStore().get(trustedCheckoutPlanKey("checkout_session_created", "poster_framed")), 1);
  assert.equal(
    memoryStore().get(trustedCheckoutPlanDailyKey(todayUtc(), "checkout_session_created", "single")),
    1,
  );
  assert.equal(memoryStore().get(trustedCheckoutHandoffKey("checkout_session_created", "browser")), 1);
  assert.equal(
    memoryStore().get(trustedCheckoutHandoffDailyKey(todayUtc(), "checkout_session_created", "missing")),
    1,
  );

  // Trusted classification must not write/refresh legacy keys.
  assert.equal(
    memoryStore().has(legacySourceKey("checkout_session_created", "checkout_api_print_post")),
    false,
  );
  assert.equal(memoryStore().has(legacyPlanKey("checkout_session_created", "poster_framed")), false);

  const diagnostics = await getCheckoutClassificationDiagnostics(7);
  assert.equal(diagnostics.notes.sourcePlanTotalsRetainUpTo180Days, true);
  assert.equal(diagnostics.notes.trustedTotalsUseCleanNamespace, true);
  assert.equal(diagnostics.notes.trustedCheckoutWritesOnly, true);

  const session = diagnostics.byStep.find((block) => block.step === "checkout_session_created");
  assert.ok(session);
  assert.equal(session.sources.find((row) => row.key === "checkout_api_print_post")?.total, 1);
  assert.equal(session.sources.find((row) => row.key === "checkout_api_digital_post")?.total, 1);
  assert.equal(session.plans.find((row) => row.key === "poster_framed")?.total, 1);
  assert.equal(session.plans.find((row) => row.key === "single")?.total, 1);
  assert.equal(session.handoffs.find((row) => row.key === "browser")?.windows.d1, 1);
  assert.equal(session.handoffs.find((row) => row.key === "missing")?.windows.d7, 1);
});

test("negative: legacy contaminated funnel:source/plan keys are not read as trusted totals", async () => {
  clearKv();

  // Simulate pre-deploy untrusted contamination on legacy keys.
  memoryStore().set(legacySourceKey("checkout_session_created", "checkout_api_digital_post"), 999);
  memoryStore().set(legacyPlanKey("checkout_session_created", "single"), 888);
  memoryStore().set("funnel:handoff:checkout_session_created:browser", 777);

  const before = await getCheckoutClassificationDiagnostics(1);
  const sessionBefore = before.byStep.find((block) => block.step === "checkout_session_created");
  assert.equal(sessionBefore?.sources.find((row) => row.key === "checkout_api_digital_post")?.total ?? 0, 0);
  assert.equal(sessionBefore?.plans.find((row) => row.key === "single")?.total ?? 0, 0);
  assert.equal(sessionBefore?.handoffs.find((row) => row.key === "browser")?.total ?? 0, 0);

  // Trusted write populates only the clean namespace.
  await recordTrustedCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "checkout_api_digital_post",
    plan: "single",
    handoff: "browser",
  });

  assert.equal(
    memoryStore().get(trustedCheckoutSourceKey("checkout_session_created", "checkout_api_digital_post")),
    1,
  );
  // Legacy contaminated values remain unchanged (not refreshed/merged).
  assert.equal(memoryStore().get(legacySourceKey("checkout_session_created", "checkout_api_digital_post")), 999);
  assert.equal(memoryStore().get(legacyPlanKey("checkout_session_created", "single")), 888);

  const after = await getCheckoutClassificationDiagnostics(1);
  const sessionAfter = after.byStep.find((block) => block.step === "checkout_session_created");
  assert.equal(sessionAfter?.sources.find((row) => row.key === "checkout_api_digital_post")?.total, 1);
  assert.equal(sessionAfter?.plans.find((row) => row.key === "single")?.total, 1);
  assert.equal(sessionAfter?.handoffs.find((row) => row.key === "browser")?.total, 1);

  const funnel = fs.readFileSync(FUNNEL_PATH, "utf8");
  assert.match(funnel, /trustedCheckoutSourceKey\(/);
  assert.match(funnel, /never refresh legacy funnel:source:\*/);
  assert.equal(/totalKey: sourceKey\(step, source\)/.test(funnel), false);
  assert.equal(/totalKey: planKey\(step, plan\)/.test(funnel), false);
});

test("negative: untrusted/generic analytics cannot forge checkout classification", async () => {
  clearKv();
  const occurredAt = `${todayUtc()}T16:00:00.000Z`;

  await recordFunnelStepMirror({
    step: "checkout_session_created",
    source: "checkout_api_digital_post",
    plan: "single",
    handoff: "browser",
    occurredAt,
    trustedCheckoutClassification: false,
  });

  assert.equal(
    isProtectedCheckoutClassificationWrite({
      step: "checkout_session_created",
      source: "checkout_api_digital_post",
      plan: "single",
      handoff: "browser",
    }),
    true,
  );

  assert.equal(memoryStore().get("funnel:total:checkout_session_created"), 1);
  assert.equal(
    memoryStore().has(trustedCheckoutSourceKey("checkout_session_created", "checkout_api_digital_post")),
    false,
  );
  assert.equal(memoryStore().has(legacySourceKey("checkout_session_created", "checkout_api_digital_post")), false);
  assert.equal(memoryStore().has(trustedCheckoutPlanKey("checkout_session_created", "single")), false);
  assert.equal(memoryStore().has(trustedCheckoutHandoffKey("checkout_session_created", "browser")), false);

  const diagnostics = await getCheckoutClassificationDiagnostics(1);
  const session = diagnostics.byStep.find((block) => block.step === "checkout_session_created");
  assert.equal(session?.sources.find((row) => row.key === "checkout_api_digital_post")?.total ?? 0, 0);

  const analyticsRoute = fs.readFileSync(FUNNEL_ROUTE, "utf8");
  assert.equal(analyticsRoute.includes("trustedCheckoutClassification"), false);
});

test("positive: checkout route marks classification writes as trusted", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  const funnel = fs.readFileSync(FUNNEL_PATH, "utf8");
  assert.match(funnel, /trustedCheckoutClassification === true/);
  assert.match(funnel, /export function isProtectedCheckoutClassificationWrite/);

  const funnelCallPattern =
    /await recordFunnelStep\(\{[\s\S]*?source: orderType === "print" \? "checkout_api_(?:print|digital)_(?:post|get)"[\s\S]*?trustedCheckoutClassification: true[\s\S]*?\}/g;
  const trustedCalls = route.match(funnelCallPattern) || [];
  assert.ok(trustedCalls.length >= 3, `expected >=3 trusted checkout classification writes, got ${trustedCalls.length}`);
  assert.equal(route.includes("trustedCheckoutClassification: false"), false);
});

test("negative: raw handoff token is never stored or returned", async () => {
  clearKv();
  const rawToken = "b0123456789abcdef0";
  await recordTrustedCheckoutClassificationStep({
    step: "checkout_session_created",
    source: "checkout_api_digital_post",
    plan: "single",
    handoff: rawToken,
    occurredAt: `${todayUtc()}T15:00:00.000Z`,
  });

  const keys = [...memoryStore().keys()];
  assert.equal(keys.some((key) => key.includes(rawToken)), false);
  assert.equal(keys.some((key) => key.includes(":handoff:")), false);

  const diagnostics = await getCheckoutClassificationDiagnostics(1);
  const session = diagnostics.byStep.find((block) => block.step === "checkout_session_created");
  assert.equal(session?.handoffs.find((row) => row.key === "browser")?.total ?? 0, 0);
  assert.equal(JSON.stringify(diagnostics).includes(rawToken), false);
});

test("negative: diagnostics never enumerate arbitrary KV keys outside allowlist", async () => {
  clearKv();
  await recordTrustedCheckoutClassificationStep({
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
  assert.equal(session.sources.some((row) => row.key === "some_unknown_probe_source"), false);
});

test("negative: QA checkout does not increment production classification", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /if\s*\(\s*!qaContext\.enabled\s*\)\s*\{\s*\n\s*await recordFunnelStep/);
  assert.match(route, /trustedCheckoutClassification: true/);

  const funnelCallPattern =
    /if\s*\(\s*!qaContext\.enabled\s*\)\s*\{[\s\S]*?await recordFunnelStep\(\{[\s\S]*?source: orderType === "print" \? "checkout_api_(?:print|digital)_(?:post|get)"[\s\S]*?handoff: (?:checkoutHandoff|"missing")[\s\S]*?trustedCheckoutClassification: true[\s\S]*?\}/g;
  const gatedCalls = route.match(funnelCallPattern) || [];
  assert.ok(gatedCalls.length >= 3, `expected >=3 QA-gated trusted classification writes, got ${gatedCalls.length}`);
});

test("funnel diagnostic contract exposes classification without weakening auth/rate limits", () => {
  const route = fs.readFileSync(FUNNEL_ROUTE, "utf8");
  const page = fs.readFileSync(FUNNEL_PAGE, "utf8");
  assert.match(route, /getFunnelDashboard\(daysParam\)/);
  assert.match(route, /checkRateLimit\(`analytics:funnel:get:\$\{ip\}`, 20, 60\)/);
  assert.match(page, /checkoutClassification/);
  assert.match(page, /funnel:checkout_class:\*/);
});

test("semantic: browser handoff is not a verified-human/buyer count (notes + UI + docs lockstep)", async () => {
  clearKv();
  const funnel = fs.readFileSync(FUNNEL_PATH, "utf8");
  const page = fs.readFileSync(FUNNEL_PAGE, "utf8");
  const docs = fs.readFileSync(DOCS_PATH, "utf8");

  const diagnostics = await getCheckoutClassificationDiagnostics(1);
  assert.equal(diagnostics.notes.browserMeansHandoffNotVerifiedHuman, true);
  assert.equal(diagnostics.notes.trustedTotalsUseCleanNamespace, true);
  assert.deepEqual(diagnostics.notes.handoffLabels, {
    browser: "browser handoff (not verified human)",
    missing: "missing/direct handoff",
  });

  assert.match(page, /browser handoff \(not verified human\)/);
  assert.match(page, /Do not treat browser handoff as a buyer count/);
  assert.match(docs, /funnel:checkout_class:\*/);
  assert.match(docs, /do \*\*not\*\* read legacy `funnel:source:\*`/);
  assert.equal(docs.toLowerCase().includes("chatgpt.com"), false);
  assert.equal(funnel.toLowerCase().includes("chatgpt.com"), false);
});

test("semantic: source/plan totals are labeled as ≤180d retention, not infinite cumulative", () => {
  const funnel = fs.readFileSync(FUNNEL_PATH, "utf8");
  const page = fs.readFileSync(FUNNEL_PAGE, "utf8");
  const docs = fs.readFileSync(DOCS_PATH, "utf8");

  assert.match(funnel, /sourcePlanTotalsRetainUpTo180Days: true/);
  assert.match(funnel, /trustedTotalsUseCleanNamespace: true/);
  assert.equal(funnel.includes("sourcePlanTotalsAreCumulative"), false);

  assert.match(page, /retained up to\s+180 days/);
  assert.match(page, /Session type \(totals ≤180d retention\)/);
  assert.match(docs, /retained up to 180 days/);
  assert.match(docs, /not infinite cumulative history/);
});
