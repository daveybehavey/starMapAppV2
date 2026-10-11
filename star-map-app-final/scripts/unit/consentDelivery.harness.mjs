// Execute production checkout/verify/webhook/consume handlers. Only framework,
// storage, Stripe, Printful and unrelated provider boundaries are synthetic.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("../../src/", import.meta.url));
const realNames = [
  "app/api/checkout/route.ts",
  "app/api/stripe/verify/route.ts",
  "app/api/stripe/webhook/route.ts",
  "app/api/entitlements/consume/route.ts",
  "lib/optionalPaymentAnalytics.ts",
  "lib/funnel.ts",
  "lib/funnelSteps.ts",
  "lib/ga4MeasurementProtocol.ts",
  "lib/posthogServerPurchase.ts",
  "lib/commerceAnalytics.ts",
  "lib/purchaseAnalyticsConsent.mjs",
  "lib/checkoutResilience.ts",
  "lib/stripeCheckoutNavigation.ts",
  "lib/entitlementConsume.mjs",
];
const real = new Set(realNames.map((n) => path.join(root, n)));
const keyFor = (specifier, parent) => {
  if (!specifier.startsWith(".") && !specifier.startsWith("@/")) return specifier;
  const base = specifier.startsWith("@/")
    ? path.join(root, specifier.slice(2))
    : path.resolve(path.dirname(parent), specifier);
  return [base, base + ".ts", base + ".mjs"].find((p) => fs.existsSync(p)) ?? base;
};
const exportsNeeded = new Map();
for (const file of real) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest);
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) || !node.importClause) continue;
    const key = keyFor(node.moduleSpecifier.text, file),
      names = exportsNeeded.get(key) ?? new Set();
    if (node.importClause.name) names.add("default");
    if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      for (const n of node.importClause.namedBindings.elements) names.add((n.propertyName ?? n.name).text);
    }
    exportsNeeded.set(key, names);
  }
}
const mapId = "123e4567-e89b-42d3-a456-426614174000";
let fixtureNumber = 0;
async function fixture({
  proof,
  mode = "ok",
  order = "digital",
  unavailableScheduler = false,
  paid = true,
} = {}) {
  const id = `cs_test_fixture${++fixtureNumber}`;
  const session = {
    id,
    mode: "payment",
    payment_status: paid ? "paid" : "unpaid",
    amount_total: order === "print" ? 10600 : 900,
    currency: "usd",
    metadata: {
      map_id: mapId,
      plan: "single",
      credits: "1",
      order_type: order,
      ...(order === "print"
        ? { print_variant: "poster_framed", print_include_digital: "true", print_asset_id: "asset-synthetic" }
        : {}),
      ...(proof === undefined ? {} : { analytics_consent: proof }),
    },
  };
  const event = {
    id: `evt_test_${fixtureNumber}`,
    type: "checkout.session.completed",
    data: { object: session },
  };
  const store = new Map([[`map:${mapId}`, { version: 1 }]]),
    afterTasks = [],
    captures = [],
    submissions = [],
    creates = [],
    warnings = [];
  const kv = {
    get: async (key) => {
      if (/^(posthog:purchase:|ga4:mp:purchase:)/.test(key)) {
        if (mode === "kv_throw") throw new Error("synthetic KV failure");
        if (mode === "kv_hang") return new Promise(() => {});
      }
      return store.get(key) ?? null;
    },
    set: async (key, value) => {
      store.set(key, value);
    },
    incr: async (key, n = 1) => {
      const value = (store.get(key) ?? 0) + n;
      store.set(key, value);
      return value;
    },
    del: async (key) => {
      store.delete(key);
    },
  };
  const tiers = {
    single: { amountCents: 900, currency: "usd", credits: 1, label: "HD" },
    pack3: { amountCents: 1000, currency: "usd", credits: 3, label: "Pack" },
    subscription: { amountCents: 1900, currency: "usd", label: "Monthly" },
  };
  class Stripe {
    static createFetchHttpClient() {
      return {};
    }
    checkout = {
      sessions: {
        retrieve: async () => session,
        create: async (params, options) => {
          creates.push({ params: structuredClone(params), key: options?.idempotencyKey });
          const previous = creates.find((c) => c !== creates.at(-1) && c.key === options?.idempotencyKey);
          if (previous)
            assert.deepEqual(
              structuredClone(params),
              previous.params,
              "Stripe params must be stable for one key"
            );
          return {
            ...session,
            url: `https://checkout.stripe.com/pay/${id}#fragment`,
            metadata: params.metadata,
          };
        },
      },
    };
    webhooks = { constructEvent: () => event };
  }
  const json = (body, init = {}) => {
    const response = Response.json(body, init);
    response.cookies = { set: (name, value) => response.headers.append("Set-Cookie", `${name}=${value}`) };
    return response;
  };
  const m = (name) => keyFor("@/lib/" + name, path.join(root, "placeholder.ts"));
  const mocks = {
    "next/server": {
      NextResponse: { json },
      NextRequest: Request,
      after: (fn) => {
        if (unavailableScheduler) throw new Error("no context");
        afterTasks.push(fn);
      },
    },
    stripe: { default: Stripe },
    [m("kv")]: { kv, isDurableKvPersistenceError: () => false },
    [m("pricing")]: {
      getPricingTiers: () => tiers,
      getPrintPricingTiers: () => ({ poster_framed: { amountCents: 9900, currency: "usd" } }),
      getPrintDigitalAddOnPrice: () => ({ amountCents: 700, currency: "usd" }),
    },
    [m("rateLimit")]: { getClientIp: () => "127.0.0.1", checkRateLimit: async () => ({ allowed: true }) },
    [m("premium")]: { PREMIUM_COOKIE_NAME: "premium", PREMIUM_COOKIE_TTL_SECONDS: 3600 },
    [m("printfulShipping")]: { getPrintfulShippingCountries: () => ["CA", "US"] },
    [m("printCatalog")]: {
      parsePrintVariant: (v) => v || "poster_framed",
      isPrintVariant: (v) => v === "poster_framed",
    },
    [m("commerceAnalyticsQa.mjs")]: {
      isQaStripeSession: () => false,
      applyMarketingAttributionMetadata: () => {},
    },
    [m("marketingAttributionGa4")]: { buildGa4MarketingParamsFromStripeMetadata: () => ({}) },
    [m("referrals")]: { normalizeReferralCode: () => null },
    [m("referralCookie")]: {
      parseReferralCookieValue: () => null,
      parseReferralSourceCookieValue: () => null,
      REFERRAL_COOKIE_NAME: "ref",
      REFERRAL_SOURCE_COOKIE_NAME: "ref-source",
    },
    [m("geoPricing")]: { getRequestCountry: () => null, getGeoDigitalSinglePrice: () => null },
    [m("checkoutPromotions")]: { selectCheckoutPromotion: () => ({ source: "none" }) },
    [m("qaSession")]: {
      resolveQaRequestContext: () => ({ enabled: false, status: "absent", source: null }),
      applyQaCheckoutMetadata: () => {},
      appendCheckoutIdempotencyQaSegment: (base, _qa, map) => `${base}:${map}`,
    },
    [m("checkoutDiagnostics")]: { recordBuyerCheckoutFailure: async () => {} },
    [m("printAssetReuse")]: { loadReusablePrintAssetId: async () => null },
    [m("printAssets")]: { PRINT_ASSET_ID_REGEX: /^asset-/, normalizeRecipeFingerprint: () => undefined },
    [m("merchCheckout")]: { MerchCheckoutError: class extends Error {} },
    [m("merchCatalog")]: { isMerchFamilyId: () => false },
    [m("printful")]: {
      isPrintfulConfigured: () => true,
      submitPrintfulOrder: async (input) => {
        submissions.push(input);
        return { ok: true, status: 200, orderId: "synthetic-provider-order" };
      },
    },
    [m("printOrders")]: {
      printOrderKey: (id) => `print:${id}`,
      resolvePrintOrderCreatedAt: () => 123,
      extractCheckoutPhoneFromStripeSession: () => null,
      persistPrintOrderRecord: async (id, record) => {
        store.set(`print:${id}`, record);
        return { outcome: "persisted" };
      },
      assertPrintOrderRetained: (r) => assert.equal(r.outcome, "persisted"),
      isPrintOrderUnretainableError: () => false,
      buildPrintAssetUrl: () => "https://example.invalid/synthetic.png",
      getPrintRecipient: () => ({ country_code: "CA" }),
      hasSufficientPrintCharge: () => true,
    },
    [m("printOrderAuthority")]: { isPrintOrderAuthorityBindError: () => false },
    [m("printFulfillmentPostSubmit")]: {
      bindAcceptedPrintfulIdentityThenReview: async ({ sessionId, sentRecord }) => {
        store.set(`print:${sessionId}`, sentRecord);
        return { identityPersist: { outcome: "persisted" }, record: sentRecord, bindOk: true };
      },
    },
    [m("printAssetFulfillment")]: { extendPrintAssetTtlForFulfillment: async () => {} },
    [m("printOrderConfirmation")]: { sendPrintOrderConfirmation: async () => {} },
    [m("printMargin")]: { evaluatePrintMarginForPaidOrder: () => ({ allowed: true }) },
    [m("accountAccessAlerts")]: { isAccountAccessEmailConfigured: () => false },
    [m("entitlementsStore")]: {
      ENTITLEMENT_KV: {
        stripeSession: (id) => `stripe:session:${id}`,
        stripeWebhookEvent: (id) => `stripe:event:${id}`,
      },
      refreshEntitledMapRecipeTtl: async () => {},
      isPrintOnlyOrder: (r) => r.orderType === "print" && !r.includesDigitalAddOn,
    },
    [m("checkoutMapId")]: { resolveCheckoutMapIdFromStripeSession: (s) => s.metadata?.map_id },
  };
  const env = {
    STRIPE_SECRET_KEY: "synthetic-placeholder",
    STRIPE_WEBHOOK_SECRET: "synthetic-placeholder",
    PRINT_ORDER_SUBMISSION_ENABLED: "true",
    NEXT_PUBLIC_SITE_URL: "https://example.invalid",
    ...(mode === "unavailable"
      ? {}
      : {
          NEXT_PUBLIC_POSTHOG_KEY: "synthetic-placeholder",
          NEXT_PUBLIC_GA_ID: "synthetic-placeholder",
          GA4_API_SECRET: "synthetic-placeholder",
        }),
  };
  const context = vm.createContext({
    process: { env },
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    AbortController,
    DOMException,
    crypto: globalThis.crypto,
    Buffer,
    structuredClone,
    console: { warn: (...x) => warnings.push(x), error: (...x) => warnings.push(x), log: () => {} },
    setTimeout: (fn, ms, ...args) => setTimeout(fn, ms === 1500 ? 10 : ms, ...args),
    clearTimeout,
    fetch: async (url, init) => {
      captures.push({ url, body: JSON.parse(init.body), signal: init.signal });
      if (mode === "throw") throw new Error("synthetic provider failure");
      if (mode === "timeout")
        return new Promise((_resolve, reject) =>
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
        );
      if (mode === "ignore_abort") return new Promise(() => {});
      return { ok: mode !== "http_failure", status: mode === "http_failure" ? 503 : 200 };
    },
  });
  const modules = new Map();
  async function moduleFor(key) {
    if (modules.has(key)) return modules.get(key);
    let mod;
    if (real.has(key)) {
      const source = ts.transpileModule(fs.readFileSync(key, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      mod = new vm.SourceTextModule(source, {
        context,
        identifier: key,
        importModuleDynamically: async (spec, parent) => {
          const child = await moduleFor(keyFor(spec, parent.identifier));
          if (child.status === "unlinked") await child.link(linker);
          if (child.status === "linked") await child.evaluate();
          return child;
        },
      });
    } else {
      const values = mocks[key] ?? {},
        names = new Set([...(exportsNeeded.get(key) ?? []), ...Object.keys(values)]);
      mod = new vm.SyntheticModule(
        [...names],
        function () {
          for (const name of names)
            this.setExport(
              name,
              Object.hasOwn(values, name)
                ? values[name]
                : () => {
                    warnings.push(`Unmocked boundary ${key}:${name}`);
                    throw new Error(`Unmocked boundary ${key}:${name}`);
                  }
            );
        },
        { context, identifier: key }
      );
    }
    modules.set(key, mod);
    return mod;
  }
  async function linker(spec, parent) {
    return moduleFor(keyFor(spec, parent.identifier));
  }
  async function load(name) {
    const mod = await moduleFor(path.join(root, name));
    if (mod.status === "unlinked") await mod.link(linker);
    if (mod.status === "linked") await mod.evaluate();
    return mod.namespace;
  }
  const verify = await load("app/api/stripe/verify/route.ts"),
    webhook = await load("app/api/stripe/webhook/route.ts"),
    consume = await load("app/api/entitlements/consume/route.ts"),
    checkout = await load("app/api/checkout/route.ts");
  const req = (url, body = {}, cookie = false) => ({
    url: `https://example.invalid${url}`,
    headers: new Headers({ "stripe-signature": "synthetic" }),
    cookies: { get: (name) => (cookie && name === "premium" ? { value: id } : undefined) },
    json: async () => body,
    text: async () => "synthetic event",
  });
  return {
    id,
    session,
    event,
    store,
    afterTasks,
    captures,
    submissions,
    creates,
    warnings,
    load,
    verify: () => verify.GET(req(`/api/stripe/verify?session_id=${id}`)),
    webhook: () => webhook.POST(req("/api/stripe/webhook")),
    consume: () => consume.POST(req("/api/entitlements/consume", { token: "same-export-token" }, true)),
    checkout: (body) =>
      checkout.POST(
        req("/api/checkout", { mapId, plan: "single", checkoutHandoff: "b1234567890abcdef", ...body })
      ),
    drain: () => Promise.all(afterTasks.splice(0).map((fn) => fn())),
  };
}

let cases = 0;
for (const proof of [undefined, "not-granted", "true", "granted-v1"]) {
  for (const mode of [
    "ok",
    "unavailable",
    "throw",
    "timeout",
    "ignore_abort",
    "kv_throw",
    "kv_hang",
    "http_failure",
  ]) {
    for (const order of ["digital", "print"]) {
      const f = await fixture({ proof, mode, order });
      const [verified, webhook] = await Promise.all([f.verify(), f.webhook()]);
      assert.equal(verified.status, 200, JSON.stringify(f.warnings));
      assert.equal((await verified.json()).paid, true);
      assert.equal(webhook.status, 200, JSON.stringify(f.warnings));
      assert.equal(f.store.get(`stripe:session:${f.id}`).paid, true);
      assert.match(verified.headers.get("Set-Cookie"), /premium=cs_test_/);
      assert.equal(f.captures.length, 0, "providers must wait until after response/fulfillment");
      assert.equal(f.submissions.length, order === "print" ? 1 : 0, JSON.stringify(f.warnings));
      const exported = await f.consume();
      assert.equal((await exported.json()).ok, true);
      const repeated = await f.consume();
      assert.equal((await repeated.json()).idempotent, true);
      await f.drain();
      if (proof !== "granted-v1" || mode === "unavailable") assert.equal(f.captures.length, 0);
      if (proof === "granted-v1" && mode === "ok") {
        const posthog = f.captures.filter((c) => c.body.event === "purchase");
        const ga4 = f.captures.filter((c) => c.body.events?.[0]?.name === "purchase");
        assert.ok(posthog.length > 0);
        assert.ok(ga4.length > 0);
        for (const c of posthog) assert.equal(c.body.properties.$insert_id, `purchase:${f.id}`);
        for (const c of ga4) assert.equal(c.body.events[0].params.transaction_id, f.id);
      }
      if (proof === "granted-v1" && ["timeout", "ignore_abort"].includes(mode))
        assert.ok(f.captures.every((c) => c.signal.aborted));
      const calls = f.submissions.length;
      assert.equal((await f.verify()).status, 200);
      assert.equal((await f.webhook()).status, 200);
      assert.equal(f.submissions.length, calls, "replayed event must not submit a second print order");
      assert.ok(
        !f.warnings.some((w) => typeof w === "string" && w.startsWith("Unmocked boundary")),
        JSON.stringify(f.warnings)
      );
      cases++;
    }
  }
}
for (const order of ["digital", "print"]) {
  const f = await fixture({ proof: "granted-v1", order, unavailableScheduler: true });
  assert.equal((await f.verify()).status, 200);
  assert.equal((await f.webhook()).status, 200);
  assert.equal(f.captures.length, 0);
  assert.equal(f.submissions.length, order === "print" ? 1 : 0);
  cases++;
}
const unpaid = await fixture({ paid: false });
assert.equal((await (await unpaid.verify()).json()).paid, false);
assert.equal((await unpaid.consume()).status, 403);
assert.equal(unpaid.captures.length, 0);
cases++;

for (const proof of [undefined, "not-granted", true, "granted-v1"]) {
  const f = await fixture();
  for (let attempt = 0; attempt < 2; attempt++) {
    // Bypass the URL cache only, to exercise Stripe's unchanged-parameter retry contract.
    for (const key of f.store.keys()) if (key.startsWith("checkout:idempotency:url:")) f.store.delete(key);
    const result = await f.checkout({ analyticsConsent: proof });
    assert.equal(result.status, 200, JSON.stringify(f.warnings));
  }
  assert.equal(f.creates.length, 2);
  assert.equal(f.creates[0].key, f.creates[1].key);
  assert.deepEqual(f.creates[0].params, f.creates[1].params);
  assert.equal(f.creates[0].params.metadata.analytics_consent, proof === "granted-v1" ? proof : undefined);
  assert.equal(f.creates[0].key.includes(":analytics-v1:"), proof === "granted-v1");
  cases++;
}
console.log(
  `PASS ${cases} actual-route consent/delivery scenarios; no external calls; deadlines accelerated in test only`
);
