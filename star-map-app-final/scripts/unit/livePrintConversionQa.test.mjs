import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isQaStripeSession } from "../../src/lib/commerceAnalyticsQa.mjs";
import {
  applyQaCheckoutMetadata,
  normalizeQaSource,
  qaCheckoutIdempotencyTag,
  resolveQaRequestContext,
} from "../../src/lib/qaSession.mjs";
import {
  assertCanonicalQaMetadata,
  assertHostedStripeCheckoutUrl,
  assertNoRedirectEscape,
  assertPackageScriptWired,
  assertSafeOutput,
  assertScriptIsNotNoOp,
  assertStripeQaVerificationCapability,
  assertTrustedLiveProbeSite,
  assertUntaggedLiveSessionDispatchRejected,
  buildPrintCheckoutBody,
  buildQaTaggedCheckoutRequest,
  CANONICAL_PRODUCTION_SITE_ORIGIN,
  containsSensitiveOperatorText,
  extractCheckoutSessionIdFromPayPath,
  formatAggregateReport,
  parseArgs,
  writeOperatorError,
} from "../live-print-conversion-qa.mjs";
import {
  assertQaCheckoutDispatchAllowed,
  buildQaCheckoutHeaders,
  LIVE_PRINT_CONVERSION_QA_SOURCE,
} from "../qa-checkout-headers.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT_PATH = path.join(ROOT, "scripts/live-print-conversion-qa.mjs");
const CHECKOUT_ROUTE = path.join(ROOT, "src/app/api/checkout/route.ts");
const MERCH_PROBE = path.join(ROOT, "scripts/live-merch-checkout-probe.mjs");
const C1_M1_PROOF = path.join(ROOT, "scripts/live-c1-m1-checkout-proof.mjs");

test("zero-byte / no-op live-print-conversion implementation fails", () => {
  const tmp = path.join(os.tmpdir(), `live-print-qa-empty-${Date.now()}.mjs`);
  fs.writeFileSync(tmp, "");
  assert.throws(() => assertScriptIsNotNoOp(tmp), /empty \(0 bytes\)/);
  fs.unlinkSync(tmp);
});

test("package script and implementation cannot drift to a zero-byte/no-op state", () => {
  assertPackageScriptWired(path.join(ROOT, "package.json"));
  assert.ok(fs.statSync(SCRIPT_PATH).size > 0);
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /live_print_conversion_checkout_only/);
  assert.match(source, /assertQaCheckoutDispatchAllowed|buildQaTaggedCheckoutRequest/);
});

test("framed and unframed checkout bodies include intended add-on paths and canonical QA markers on dispatch", () => {
  const framed = buildPrintCheckoutBody("poster_framed");
  const unframed = buildPrintCheckoutBody("poster_unframed");
  assert.equal(framed.printVariant, "poster_framed");
  assert.equal(framed.includeDigitalAddOn, true);
  assert.equal(unframed.printVariant, "poster_unframed");
  assert.equal(unframed.includeDigitalAddOn, false);

  const env = { PRINT_ADMIN_TOKEN: "unit-test-token" };
  for (const variant of ["poster_framed", "poster_unframed"]) {
    const request = buildQaTaggedCheckoutRequest(
      {
        site: "https://starmapco.com",
        printVariant: variant,
        mapId: "00000000-0000-4000-8000-000000000001",
        printAssetId: "00000000-0000-4000-8000-000000000002",
      },
      env,
    );
    assert.equal(request.headers["x-qa-run"], "true");
    assert.equal(request.headers["x-qa-source"], LIVE_PRINT_CONVERSION_QA_SOURCE);
    assert.equal(request.body.printVariant, variant);
    assert.equal(request.body.includeDigitalAddOn, variant === "poster_framed");
    assertCanonicalQaMetadata({
      qa_run: request.headers["x-qa-run"],
      qa_source: request.headers["x-qa-source"],
    });
  }
});

test("missing QA marker support fails before network dispatch", () => {
  assert.throws(
    () => buildQaCheckoutHeaders(LIVE_PRINT_CONVERSION_QA_SOURCE, { PRINT_ADMIN_TOKEN: "" }),
    /PRINT_ADMIN_TOKEN/,
  );
  assert.throws(
    () =>
      buildQaTaggedCheckoutRequest(
        {
          site: "https://starmapco.com",
          printVariant: "poster_framed",
          mapId: "00000000-0000-4000-8000-000000000001",
          printAssetId: "00000000-0000-4000-8000-000000000002",
        },
        {},
      ),
    /PRINT_ADMIN_TOKEN|fail-closed/,
  );
  assert.throws(() => assertQaCheckoutDispatchAllowed(LIVE_PRINT_CONVERSION_QA_SOURCE, {}), /PRINT_ADMIN_TOKEN/);
});

test("script cannot create coupons, promotion codes, payments, refunds, or fulfillment submissions", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const scanSource = source.replace(/FORBIDDEN_CAPABILITY_NEEDLES[\s\S]*?\];/, "FORBIDDEN_CAPABILITY_NEEDLES = [];");
  for (const needle of [
    ["coupons", "create"].join("."),
    ["promotionCodes", "create"].join("."),
    ["payment_intents", "create"].join("."),
    ["refunds", "create"].join("."),
    ["charges", "create"].join("."),
    ["waitFor", "Paid", "Verification"].join(""),
    ["submit", "Fulfillment"].join(""),
  ]) {
    assert.equal(scanSource.includes(needle), false, needle);
  }
  assert.doesNotThrow(() => assertScriptIsNotNoOp(SCRIPT_PATH));
});

test("no card/payment form interaction exists in checkout-only probe", () => {
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  const scanSource = source.replace(/FORBIDDEN_CAPABILITY_NEEDLES[\s\S]*?\];/, "FORBIDDEN_CAPABILITY_NEEDLES = [];");
  assert.equal(scanSource.includes(["chromium", "launch"].join(".")), false);
  assert.equal(scanSource.includes(["page", "fill"].join(".")), false);
  assert.equal(scanSource.includes(["card", "Number"].join("")), false);
  assert.match(source, /checkout-only|checkoutOnly/);
});

test("stdout/stderr/reporting cannot expose IDs, URLs, emails, addresses, secrets, or raw responses", () => {
  const report = formatAggregateReport({
    passed: 2,
    failed: 0,
    variants: ["poster_framed", "poster_unframed"],
    checks: [
      { name: "variant_poster_framed", ok: true },
      { name: "variant_poster_unframed", ok: true },
    ],
  });
  assert.doesNotThrow(() => assertSafeOutput(report));
  assert.equal(containsSensitiveOperatorText(report), false);
  assert.equal(containsSensitiveOperatorText("https://checkout.stripe.com/c/pay/cs_live_abc#fid"), true);
  assert.equal(containsSensitiveOperatorText("customer@example.com"), true);
  assert.equal(containsSensitiveOperatorText("cs_live_abc123"), true);
  assert.equal(containsSensitiveOperatorText("sk_live_secret"), true);
  assert.throws(
    () => assertSafeOutput("session https://checkout.stripe.com/c/pay/cs_live_abc#fid"),
    /sensitive/,
  );
});

test("ordinary buyer sessions remain unchanged without QA headers", () => {
  const absent = resolveQaRequestContext(new Headers({ "content-type": "application/json" }), "token");
  assert.deepEqual(absent, { enabled: false, source: null, status: "absent" });

  const metadata = {
    order_type: "print",
    print_variant: "poster_framed",
    map_id: "00000000-0000-4000-8000-000000000001",
  };
  applyQaCheckoutMetadata(metadata, absent);
  assert.equal(metadata.qa_run, undefined);
  assert.equal(metadata.qa_source, undefined);
  assert.equal(isQaStripeSession({ metadata }), false);
  assert.equal(qaCheckoutIdempotencyTag(absent), "buyer");
});

test("isQaStripeSession recognizes live_print_conversion_checkout_only marker", () => {
  assert.equal(
    isQaStripeSession({
      metadata: {
        qa_run: "true",
        qa_source: LIVE_PRINT_CONVERSION_QA_SOURCE,
      },
    }),
    true,
  );
  assert.equal(
    isQaStripeSession({
      metadata: {
        qa_source: LIVE_PRINT_CONVERSION_QA_SOURCE,
      },
    }),
    true,
  );
});

test("negative control fails if a live session can be created without QA metadata", () => {
  assert.doesNotThrow(() =>
    assertUntaggedLiveSessionDispatchRejected({
      site: "https://starmapco.com",
      printVariant: "poster_framed",
      mapId: "00000000-0000-4000-8000-000000000001",
      printAssetId: "00000000-0000-4000-8000-000000000002",
    }),
  );
});

test("checkout API wires fail-closed QA headers into session metadata", () => {
  const route = fs.readFileSync(CHECKOUT_ROUTE, "utf8");
  assert.match(route, /resolveQaRequestContext/);
  assert.match(route, /applyQaCheckoutMetadata/);
  assert.match(route, /qa_auth_required/);
  assert.match(route, /qaCheckoutIdempotencyTag/);
  assert.match(route, /qaContext/);

  const unauthorized = resolveQaRequestContext(
    new Headers({
      "x-qa-run": "true",
      "x-qa-source": LIVE_PRINT_CONVERSION_QA_SOURCE,
      "x-admin-token": "wrong",
    }),
    "expected-token",
  );
  assert.equal(unauthorized.status, "unauthorized");
  assert.equal(unauthorized.enabled, false);

  const enabled = resolveQaRequestContext(
    new Headers({
      "x-qa-run": "true",
      "x-qa-source": LIVE_PRINT_CONVERSION_QA_SOURCE,
      "x-admin-token": "expected-token",
    }),
    "expected-token",
  );
  assert.deepEqual(enabled, {
    enabled: true,
    source: LIVE_PRINT_CONVERSION_QA_SOURCE,
    status: "enabled",
  });

  const metadata = { order_type: "print" };
  applyQaCheckoutMetadata(metadata, enabled);
  assert.equal(metadata.qa_run, "true");
  assert.equal(metadata.qa_source, LIVE_PRINT_CONVERSION_QA_SOURCE);
  assert.equal(normalizeQaSource(" Live Print Conversion Checkout Only "), "live_print_conversion_checkout_only");
});

test("existing live checkout probes QA-tag or stop before session creation", () => {
  const merch = fs.readFileSync(MERCH_PROBE, "utf8");
  const proof = fs.readFileSync(C1_M1_PROOF, "utf8");
  assert.match(merch, /assertQaCheckoutDispatchAllowed/);
  assert.match(merch, /LIVE_MERCH_CHECKOUT_PROBE_QA_SOURCE|live_merch_checkout_probe/);
  assert.match(merch, /fail_closed_before_untagged_session|QA marker capability/);
  assert.match(proof, /assertQaCheckoutDispatchAllowed/);
  assert.match(proof, /LIVE_C1_M1_CHECKOUT_PROOF_QA_SOURCE|live_c1_m1_checkout_proof/);
});

test("missing Stripe verification capability fails before session creation", () => {
  assert.throws(
    () => assertStripeQaVerificationCapability({ PRINT_ADMIN_TOKEN: "unit-test-token" }),
    /STRIPE_SECRET_KEY/,
  );
  assert.throws(() => assertStripeQaVerificationCapability({}), /STRIPE_SECRET_KEY/);
  assert.equal(
    assertStripeQaVerificationCapability({ STRIPE_SECRET_KEY: "sk_test_unit_only_placeholder" }),
    "sk_test_unit_only_placeholder",
  );
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /assertStripeQaVerificationCapability/);
  assert.match(source, /verifyCreatedSessionQaMetadata/);
  // Must not treat Stripe verification as optional after URL return.
  assert.equal(/if\s*\(\s*stripeSecret\s*\)/.test(source), false);
});

test("canonical QA metadata assertion accepts only exact markers", () => {
  assert.doesNotThrow(() =>
    assertCanonicalQaMetadata({
      qa_run: "true",
      qa_source: LIVE_PRINT_CONVERSION_QA_SOURCE,
    }),
  );
  assert.throws(() => assertCanonicalQaMetadata({ qa_run: "true", qa_source: "other" }), /qa_source/);
  assert.throws(
    () => assertCanonicalQaMetadata({ qa_source: LIVE_PRINT_CONVERSION_QA_SOURCE }),
    /qa_run/,
  );
  assert.throws(() => assertCanonicalQaMetadata({}), /qa_run/);
  // Normalized / truthy aliases must fail — byte-for-byte exact only.
  for (const qa_run of ["TRUE", "True", " true", "true ", "1", "yes", "Yes"]) {
    assert.throws(
      () =>
        assertCanonicalQaMetadata({
          qa_run,
          qa_source: LIVE_PRINT_CONVERSION_QA_SOURCE,
        }),
      /qa_run/,
      qa_run,
    );
  }
  for (const qa_source of [
    "LIVE_PRINT_CONVERSION_CHECKOUT_ONLY",
    " live_print_conversion_checkout_only",
    "live_print_conversion_checkout_only ",
    "live_print_conversion",
  ]) {
    assert.throws(
      () => assertCanonicalQaMetadata({ qa_run: "true", qa_source }),
      /qa_source/,
      qa_source,
    );
  }
});

test("trusted live probe site accepts only canonical production origin", () => {
  assert.equal(assertTrustedLiveProbeSite(CANONICAL_PRODUCTION_SITE_ORIGIN), CANONICAL_PRODUCTION_SITE_ORIGIN);
  assert.equal(assertTrustedLiveProbeSite("https://starmapco.com/"), CANONICAL_PRODUCTION_SITE_ORIGIN);
  const wrangler = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
  assert.match(wrangler, /NEXT_PUBLIC_SITE_URL\s*=\s*"https:\/\/starmapco\.com"/);
});

test("trusted live probe site rejects HTTP, deceptive hosts, credentials, ports, path, query, fragment", () => {
  const rejects = [
    "http://starmapco.com",
    "https://starmapco.example",
    "https://evil.starmapco.com",
    "https://starmapco.com.evil.example",
    "https://www.starmapco.com",
    "https://user:pass@starmapco.com",
    "https://starmapco.com:8443",
    "https://starmapco.com/editor",
    "https://starmapco.com?x=1",
    "https://starmapco.com#frag",
    "https://starmapco.ca",
    "not-a-url",
  ];
  for (const site of rejects) {
    assert.throws(() => assertTrustedLiveProbeSite(site), /BLOCKER/, site);
  }
});

test("PRINT_ADMIN_TOKEN is not read or attached before trusted-origin checks pass", () => {
  let tokenAccessed = false;
  const secretToken = "unit-admin-token-must-not-leak";
  const env = new Proxy(
    { PRINT_ADMIN_TOKEN: secretToken, STRIPE_SECRET_KEY: "sk_test_unit_only_placeholder" },
    {
      get(target, prop) {
        if (prop === "PRINT_ADMIN_TOKEN") tokenAccessed = true;
        return Reflect.get(target, prop);
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, prop) {
        return Reflect.getOwnPropertyDescriptor(target, prop);
      },
    },
  );
  assert.throws(
    () =>
      buildQaTaggedCheckoutRequest(
        {
          site: "https://starmapco.example",
          printVariant: "poster_framed",
          mapId: "00000000-0000-4000-8000-000000000001",
          printAssetId: "00000000-0000-4000-8000-000000000002",
        },
        env,
      ),
    /trusted|canonical|HTTPS|host/i,
  );
  assert.equal(tokenAccessed, false);

  const chunks = [];
  writeOperatorError({ write: (s) => chunks.push(String(s)) }, "failed https://starmapco.example", env);
  assert.equal(chunks.join("").includes(secretToken), false);
});

test("redirect escape on secret-bearing responses is rejected", () => {
  assert.throws(
    () => assertNoRedirectEscape({ status: 302 }),
    /redirect/,
  );
  assert.doesNotThrow(() => assertNoRedirectEscape({ status: 200 }));
});

test("path-bound Checkout Session ID extraction ignores fragment and query IDs", () => {
  const valid =
    "https://checkout.stripe.com/c/pay/cs_live_pathbound123#fidfragment";
  assert.equal(extractCheckoutSessionIdFromPayPath(valid), "cs_live_pathbound123");

  // Fragment has a valid-looking session id; path does not — must fail and never use fragment.
  assert.throws(
    () =>
      extractCheckoutSessionIdFromPayPath(
        "https://checkout.stripe.com/c/pay/not-a-session#cs_test_oldsession",
      ),
    /pathname|Session ID|Stripe-hosted/,
  );

  // Query has a valid-looking session id; path invalid — must fail.
  assert.throws(
    () =>
      extractCheckoutSessionIdFromPayPath(
        "https://checkout.stripe.com/c/pay/not-a-session?session=cs_test_queryid#fidx",
      ),
    /pathname|Session ID|Stripe-hosted/,
  );

  // Path id must be preferred; ensure helper does not scan whole URL (path wins when valid).
  assert.equal(
    extractCheckoutSessionIdFromPayPath(
      "https://checkout.stripe.com/c/pay/cs_live_frompath#cs_test_fromfragment",
    ),
    "cs_live_frompath",
  );

  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.match(source, /extractCheckoutSessionIdFromPayPath/);
  assert.equal(source.includes("String(checkoutUrl).match(/(cs_"), false);
});

test("hosted Stripe URL validator accepts bounded handoff shape without echoing identifiers", () => {
  assert.equal(
    assertHostedStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_live_abc#fidfragment"),
    true,
  );
  assert.throws(() => assertHostedStripeCheckoutUrl(""), /missing/);
  assert.throws(() => assertHostedStripeCheckoutUrl("https://example.com/pay"), /Stripe-hosted/);
});

test("hosted Stripe URL validator rejects HTTP, deceptive hosts, wrong paths, and missing fragments", () => {
  const rejects = [
    "http://checkout.stripe.com/c/pay/cs_live_abc#fidfragment",
    "https://evil.example/checkout.stripe.com/c/pay/cs_live_abc#fidfragment",
    "https://checkout.stripe.com.evil.example/c/pay/cs_live_abc#fidfragment",
    "https://checkout.stripe.com/pay/cs_live_abc#fidfragment",
    "https://checkout.stripe.com/c/pay/cs_live_abc",
    "https://checkout.stripe.com/c/pay/cs_live_abc#",
    "not-a-url-but-checkout.stripe.com",
  ];
  for (const url of rejects) {
    assert.throws(() => assertHostedStripeCheckoutUrl(url), /Stripe-hosted|missing/, url);
  }
  // Negative control: permissive substring alone must not pass.
  assert.throws(
    () => assertHostedStripeCheckoutUrl("prefix checkout.stripe.com suffix"),
    /Stripe-hosted/,
  );
  const source = fs.readFileSync(SCRIPT_PATH, "utf8");
  assert.equal(/!isValidStripeCheckoutUrl\([^)]+\)\s*&&\s*!\/checkout\\.stripe\\.com/i.test(source), false);
});

test("parseArgs defaults to both variants in checkout-only mode and validates --site", () => {
  const args = parseArgs([]);
  assert.equal(args.checkoutOnly, true);
  assert.deepEqual(args.variants, ["poster_framed", "poster_unframed"]);
  const framedOnly = parseArgs(["--print-variant", "poster_framed", "--checkout-only"]);
  assert.deepEqual(framedOnly.variants, ["poster_framed"]);
  assert.equal(parseArgs(["--site", "https://starmapco.com"]).site, CANONICAL_PRODUCTION_SITE_ORIGIN);
  assert.throws(() => parseArgs(["--site", "https://starmapco.example"]), /BLOCKER/);
});
