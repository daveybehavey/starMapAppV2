import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_STRIPE_FIXED_CENTS,
  DEFAULT_STRIPE_PERCENT,
  PRINT_VARIANT_COST_ROWS,
  estimateStripeFeeCents,
  getConfiguredProductCostCents,
  getConfiguredShippingCostCents,
  getStripeFeeConfig,
} from "../lib/commerceCostEstimates.mjs";
import {
  CHECKOUT_ADDON_ALIAS_NORMALIZED,
  CHECKOUT_SHIPPING_ALIAS_NORMALIZED,
  LEGACY_QA_CLIENT_REFERENCE_VALUE,
  LEGACY_QA_DERIVED_SOURCE,
  PRODUCT_CONTRIBUTION_CONTRACT,
  SENSITIVE_RECORD_FIELDS,
  UNSUPPORTED_MERCH_RECORD_FIELDS,
  assertAggregateOnly,
  assertScriptIsNotNoOp,
  buildProductContributionReport,
  classifyProductGroup,
  consumeLegacyQaClientReference,
  containsSensitiveOperatorText,
  estimateRecordContribution,
  formatJsonReport,
  formatTableReport,
  isCheckoutAddonAliasKey,
  isCheckoutMetadataAliasKey,
  isCheckoutShippingAliasKey,
  isExcludedQaRecord,
  isSensitiveRecordFieldKey,
  isUnsupportedMerchFieldKey,
  normalizeRecordFieldKey,
  parseArgs,
  parseSanitizedDocument,
  resolveCanonicalBoolWithAlias,
  resolveCanonicalCentsWithAlias,
  resolveCanonicalShippingCountryWithAlias,
  runProductContribution,
  sanitizeRecord,
  parseStrictIncludeBool,
  STRICT_INCLUDE_BOOL_TRUE_STRINGS,
  STRICT_INCLUDE_BOOL_FALSE_STRINGS,
} from "../product-contribution.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../product-contribution.mjs", import.meta.url));
const FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/product-contribution/synthetic-paid-sessions.json", import.meta.url)
);
const PRINT_MARGIN_TS = fileURLToPath(new URL("../../src/lib/printMargin.ts", import.meta.url));
const PRINT_CATALOG_TS = fileURLToPath(new URL("../../src/lib/printCatalog.ts", import.meta.url));

function createIo() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: {
      write(chunk) {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      write(chunk) {
        stderr += String(chunk);
        return true;
      },
    },
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

function loadFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
}

test("negative control: empty/no-op/gross-only stub is detected", () => {
  const tmp = path.join(path.dirname(SCRIPT_PATH), `.product-contribution-empty-${process.pid}.mjs`);
  fs.writeFileSync(tmp, "");
  try {
    assert.throws(() => assertScriptIsNotNoOp(tmp), /empty \(0 bytes\)/);
  } finally {
    fs.unlinkSync(tmp);
  }

  const stub = path.join(path.dirname(SCRIPT_PATH), `.product-contribution-noop-${process.pid}.mjs`);
  fs.writeFileSync(stub, "#!/usr/bin/env node\nprocess.exit(0);\n");
  try {
    assert.throws(() => assertScriptIsNotNoOp(stub), /does not compute estimated contribution/);
  } finally {
    fs.unlinkSync(stub);
  }

  const grossOnly = path.join(path.dirname(SCRIPT_PATH), `.product-contribution-gross-${process.pid}.mjs`);
  fs.writeFileSync(
    grossOnly,
    `
export const estimated_pre_fixed_cost_contribution_cents = true;
export function estimateStripeFeeCents() { return 0; }
--input
collected_revenue_cents only
`
  );
  try {
    assert.throws(() => assertScriptIsNotNoOp(grossOnly), /gross-revenue-only|incomplete|configured product/);
  } finally {
    fs.unlinkSync(grossOnly);
  }

  const info = assertScriptIsNotNoOp(SCRIPT_PATH);
  assert.ok(info.bytes > 0);
});

test("shared Stripe fee defaults align with printMargin.ts", () => {
  const source = fs.readFileSync(PRINT_MARGIN_TS, "utf8");
  assert.match(source, new RegExp(`DEFAULT_STRIPE_PERCENT\\s*=\\s*${DEFAULT_STRIPE_PERCENT}`));
  assert.match(source, new RegExp(`DEFAULT_STRIPE_FIXED_CENTS\\s*=\\s*${DEFAULT_STRIPE_FIXED_CENTS}`));
  assert.equal(estimateStripeFeeCents(10000, getStripeFeeConfig({})), Math.round(10000 * 0.029) + 30);
});

test("shared print COGS defaults align with printCatalog.ts", () => {
  const source = fs.readFileSync(PRINT_CATALOG_TS, "utf8");
  for (const [variant, row] of Object.entries(PRINT_VARIANT_COST_ROWS)) {
    assert.ok(source.includes(`id: "${variant}"`), `catalog missing ${variant}`);
    assert.ok(source.includes(`cogsEnv: "${row.cogsEnv}"`), `cogsEnv drift for ${variant}`);
    assert.ok(
      source.includes(`defaultCogsCents: ${row.defaultCogsCents}`),
      `defaultCogsCents drift for ${variant}`
    );
    assert.ok(
      source.includes(`shippingProfile: "${row.shippingProfile}"`),
      `shippingProfile drift for ${variant}`
    );
    assert.equal(getConfiguredProductCostCents(variant, {}), row.defaultCogsCents);
  }
});

test("shipping estimate matches printful matrix for US framed poster", () => {
  const shipping = getConfiguredShippingCostCents("poster_framed", "US");
  assert.ok(shipping);
  assert.equal(shipping.amountCents, 977);
  assert.equal(shipping.currency, "USD");
});

test("correct grouping of digital, print, and bundle records", () => {
  assert.equal(classifyProductGroup({ order_type: "digital", plan: "single" }).groupKey, "digital:single");
  assert.equal(classifyProductGroup({ order_type: "digital", plan: "pack3" }).groupKey, "digital:pack3");
  assert.equal(
    classifyProductGroup({ order_type: "print", print_variant: "poster_unframed" }).groupKey,
    "print:poster_unframed"
  );
  assert.equal(
    classifyProductGroup({
      order_type: "print",
      print_variant: "poster_framed",
      include_digital: true,
    }).groupKey,
    "print:poster_framed+digital"
  );
  assert.equal(
    classifyProductGroup({
      order_type: "print",
      print_variant: "poster_framed",
      include_card: true,
    }).groupKey,
    "print:poster_framed+card"
  );
  assert.equal(
    classifyProductGroup({ order_type: "print", print_variant: "mystery_sku" }).groupKey,
    "unknown"
  );
});

test("Codex regression: missing/blank/unsupported digital plan must not default to digital:single", () => {
  // Pre-fix bug: `record.plan || "single"` silently classified these as HD single.
  for (const plan of [null, undefined, "", "   ", "enterprise", "SINGLE_PACK"]) {
    const classification = classifyProductGroup({
      order_type: "digital",
      plan: plan === undefined ? undefined : plan,
      currency: "usd",
      amount_total: 2900,
    });
    assert.equal(classification.groupKey, "unknown", `plan=${JSON.stringify(plan)}`);
    assert.equal(classification.kind, "unknown");

    const estimate = estimateRecordContribution(
      {
        order_type: "digital",
        plan: typeof plan === "string" ? plan.trim().toLowerCase() || null : (plan ?? null),
        currency: "usd",
        amount_total: 2900,
      },
      getStripeFeeConfig({}),
      {}
    );
    assert.equal(estimate.resolved, false);
    assert.equal(estimate.unresolvedReason, "unknown_product_metadata");
    assert.equal(estimate.contributionCents, null);
  }

  const report = buildProductContributionReport(
    [
      { currency: "usd", amount_total: 2900, order_type: "digital" },
      { currency: "usd", amount_total: 3100, order_type: "digital", plan: "" },
      { currency: "usd", amount_total: 3300, order_type: "digital", plan: "not_a_plan" },
      { currency: "usd", amount_total: 2900, order_type: "digital", plan: "single" },
    ],
    { env: {} }
  );
  const usd = report.currency_sections[0];
  const unknown = usd.groups.find((g) => g.group_key === "unknown");
  const digitalSingle = usd.groups.find((g) => g.group_key === "digital:single");
  assert.ok(unknown);
  assert.equal(unknown.paid_order_count, 3);
  assert.equal(unknown.unresolved_count, 3);
  assert.equal(unknown.estimated_pre_fixed_cost_contribution_cents, 0);
  assert.equal(unknown.contribution_margin_percent, null);
  assert.ok(digitalSingle);
  assert.equal(digitalSingle.paid_order_count, 1);
  assert.equal(digitalSingle.resolved_order_count, 1);
});

test("Codex regression: camelCase/snake_case sensitive fields fail closed before unknown stripping", () => {
  const sensitiveExamples = [
    "first_name",
    "last_name",
    "buyerName",
    "BuyerEmail",
    "paymentIntentId",
    "clientReferenceId",
    "orderId",
    "chargeId",
    "FullName",
    "shippingAddress",
    "customerPhone",
  ];

  for (const field of sensitiveExamples) {
    assert.equal(isSensitiveRecordFieldKey(field), true, field);
    assert.throws(
      () =>
        sanitizeRecord(
          {
            currency: "usd",
            amount_total: 100,
            order_type: "digital",
            plan: "single",
            [field]: "SENSITIVE_VALUE_MUST_NOT_LEAK",
          },
          0
        ),
      /sensitive|row-identifying/
    );
  }

  // Allowed schema keys must never be treated as sensitive.
  for (const field of [
    "shipping_country",
    "shipping_charge_cents",
    "shipping_subsidy_cents",
    "discount_cents",
    "print_variant",
    "include_digital",
  ]) {
    assert.equal(isSensitiveRecordFieldKey(field), false, field);
  }

  assert.equal(normalizeRecordFieldKey("paymentIntentId"), "payment_intent_id");
  assert.equal(normalizeRecordFieldKey("clientReferenceId"), "client_reference_id");
  assert.equal(normalizeRecordFieldKey("buyerName"), "buyer_name");

  const io = createIo();
  const bad = {
    schema_version: 1,
    records: [
      {
        currency: "usd",
        amount_total: 100,
        order_type: "digital",
        plan: "single",
        first_name: "Ada",
        last_name: "Lovelace",
        buyerName: "Ada Lovelace",
        paymentIntentId: "pi_test_should_not_leak",
        clientReferenceId: "cref_should_not_leak",
      },
    ],
  };
  const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-camel-sensitive-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(bad));
  try {
    const code = runProductContribution({
      argv: ["--input", tmp, "--format", "json"],
      stdout: io.stdout,
      stderr: io.stderr,
      env: {},
    });
    assert.equal(code, 1);
    // Must reject (fail closed) — not strip-and-continue.
    assert.equal(containsSensitiveOperatorText(io.getStdout()), false);
    assert.equal(containsSensitiveOperatorText(io.getStderr()), false);
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /Ada/);
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /Lovelace/);
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /pi_test_should_not_leak/);
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /cref_should_not_leak/);
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /SENSITIVE_VALUE/);
    assert.match(io.getStderr(), /sensitive|row-identifying|Product contribution failed/);
  } finally {
    fs.unlinkSync(tmp);
  }

  assert.ok(SENSITIVE_RECORD_FIELDS.includes("first_name"));
  assert.ok(SENSITIVE_RECORD_FIELDS.includes("clientReferenceId"));
  assert.ok(SENSITIVE_RECORD_FIELDS.includes("paymentIntentId"));
});

test("fixture report groups digital/print/bundle and excludes QA", () => {
  const doc = loadFixture();
  const { records } = parseSanitizedDocument(doc);
  const report = buildProductContributionReport(records, { env: {} });
  assert.equal(report.currency_sections.length, 2);

  const usd = report.currency_sections.find((s) => s.currency === "usd");
  assert.ok(usd);
  assert.equal(usd.excluded_qa_count, 1);
  assert.equal(usd.excluded_qa_revenue_cents, 2900);

  const keys = usd.groups.map((g) => g.group_key);
  assert.ok(keys.includes("digital:single"));
  assert.ok(keys.includes("digital:pack3"));
  assert.ok(keys.includes("print:poster_framed"));
  assert.ok(keys.includes("print:poster_framed+digital"));
  assert.ok(keys.includes("print:poster_framed+card"));
  assert.ok(keys.includes("print:poster_unframed"));
  assert.ok(keys.includes("unknown"));
  assert.ok(keys.includes("print:canvas_wrap"));

  const digital = usd.groups.find((g) => g.group_key === "digital:single");
  assert.equal(digital.paid_order_count, 1); // QA excluded
  assert.ok(digital.estimated_pre_fixed_cost_contribution_cents < digital.collected_revenue_cents);

  const unknown = usd.groups.find((g) => g.group_key === "unknown");
  assert.equal(unknown.paid_order_count, 1);
  assert.equal(unknown.unresolved_count, 1);
  assert.equal(unknown.estimated_pre_fixed_cost_contribution_cents, 0);

  const canvas = usd.groups.find((g) => g.group_key === "print:canvas_wrap");
  assert.equal(canvas.unresolved_count, 1);
  assert.ok(canvas.unresolved_reasons.missing_shipping_country >= 1);

  const cad = report.currency_sections.find((s) => s.currency === "cad");
  assert.ok(cad);
  assert.equal(cad.paid_order_count, 1);
  // Currencies are never combined
  assert.notEqual(usd.collected_revenue_cents, usd.collected_revenue_cents + cad.collected_revenue_cents);
});

test("Codex regression: legacy QA client_reference is classified before strip; production and raw ids unchanged", () => {
  assert.equal(LEGACY_QA_CLIENT_REFERENCE_VALUE, "qa-live-conversion");
  assert.equal(LEGACY_QA_DERIVED_SOURCE, "live_conversion_legacy");
  assert.ok(LEGACY_QA_DERIVED_SOURCE.startsWith("live_conversion"));

  // Positive: exact legacy marker → derive non-identifying qa_source, drop identifier, exclude.
  for (const key of ["client_reference_id", "clientReferenceId", "ClientReferenceId"]) {
    const { derivedQaSource, consumedKeys } = consumeLegacyQaClientReference({
      [key]: LEGACY_QA_CLIENT_REFERENCE_VALUE,
      currency: "usd",
      amount_total: 2900,
    });
    assert.equal(derivedQaSource, LEGACY_QA_DERIVED_SOURCE, key);
    assert.deepEqual(consumedKeys, [key], key);

    const { record, warnings } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
        [key]: `  ${LEGACY_QA_CLIENT_REFERENCE_VALUE}  `,
      },
      3
    );
    assert.equal(record.qa_source, LEGACY_QA_DERIVED_SOURCE, key);
    assert.equal(record.client_reference_id, undefined, key);
    assert.equal(record.clientReferenceId, undefined, key);
    assert.equal(Object.prototype.hasOwnProperty.call(record, key), false, key);
    assert.equal(isExcludedQaRecord(record), true, key);
    assert.equal(
      warnings.some((w) => w.includes("client_reference")),
      false,
      key
    );
    assert.doesNotMatch(JSON.stringify(record), new RegExp(LEGACY_QA_CLIENT_REFERENCE_VALUE));
  }

  // Derived legacy marker is authoritative over any existing qa_source (recognized or not).
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
        qa_source: "live_conversion_qa",
        client_reference_id: LEGACY_QA_CLIENT_REFERENCE_VALUE,
      },
      4
    );
    assert.equal(record.qa_source, LEGACY_QA_DERIVED_SOURCE);
    assert.equal(isExcludedQaRecord(record), true);
    assert.equal(Object.prototype.hasOwnProperty.call(record, "client_reference_id"), false);
  }

  // Codex regression: unrecognized nonempty qa_source (e.g. "manual") must not
  // neutralize exact legacy client_reference classification.
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 3700,
        order_type: "digital",
        plan: "single",
        qa_source: "manual",
        client_reference_id: LEGACY_QA_CLIENT_REFERENCE_VALUE,
      },
      5
    );
    assert.equal(record.qa_source, LEGACY_QA_DERIVED_SOURCE);
    assert.equal(isExcludedQaRecord(record), true);
    assert.equal(Object.prototype.hasOwnProperty.call(record, "client_reference_id"), false);
    assert.doesNotMatch(JSON.stringify(record), /qa-live-conversion/);
  }

  // Aggregate: legacy QA (+ unrecognized qa_source) is excluded; production is not.
  {
    const production = {
      currency: "usd",
      amount_total: 2900,
      order_type: "digital",
      plan: "single",
    };
    const legacyQa = {
      currency: "usd",
      amount_total: 5000,
      order_type: "digital",
      plan: "single",
      client_reference_id: LEGACY_QA_CLIENT_REFERENCE_VALUE,
    };
    const legacyQaWithUnrecognizedSource = {
      currency: "usd",
      amount_total: 6100,
      order_type: "digital",
      plan: "single",
      qa_source: "manual",
      client_reference_id: LEGACY_QA_CLIENT_REFERENCE_VALUE,
    };
    const recognizedQaOnly = {
      currency: "usd",
      amount_total: 1800,
      order_type: "digital",
      plan: "single",
      qa_source: "live_conversion_qa",
    };
    const { records } = parseSanitizedDocument({
      schema_version: 1,
      records: [production, legacyQa, legacyQaWithUnrecognizedSource, recognizedQaOnly],
    });
    assert.equal(records.length, 4);
    assert.equal(isExcludedQaRecord(records[0]), false);
    assert.equal(isExcludedQaRecord(records[1]), true);
    assert.equal(isExcludedQaRecord(records[2]), true);
    assert.equal(isExcludedQaRecord(records[3]), true);
    assert.equal(records[1].qa_source, LEGACY_QA_DERIVED_SOURCE);
    assert.equal(records[2].qa_source, LEGACY_QA_DERIVED_SOURCE);
    assert.equal(records[3].qa_source, "live_conversion_qa");
    assert.equal(Object.prototype.hasOwnProperty.call(records[1], "client_reference_id"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(records[2], "client_reference_id"), false);

    const report = buildProductContributionReport(records, { env: {} });
    const usd = report.currency_sections.find((s) => s.currency === "usd");
    assert.equal(usd.excluded_qa_count, 3);
    assert.equal(usd.excluded_qa_revenue_cents, 5000 + 6100 + 1800);
    const digital = usd.groups.find((g) => g.group_key === "digital:single");
    assert.equal(digital.paid_order_count, 1);
    assert.equal(digital.collected_revenue_cents, 2900);
    assert.equal(digital.estimated_pre_fixed_cost_contribution_cents > 0, true);
  }

  // Negative: ordinary production row (no QA markers) is not excluded.
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
      },
      0
    );
    assert.equal(record.qa_source, undefined);
    assert.equal(isExcludedQaRecord(record), false);
  }

  // Negative: unrecognized qa_source alone (no legacy marker) is not QA-excluded.
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
        qa_source: "manual",
      },
      0
    );
    assert.equal(record.qa_source, "manual");
    assert.equal(isExcludedQaRecord(record), false);
  }

  // Negative: non-legacy client_reference values still fail closed; value never leaked.
  const leakValues = [
    "cref_prod_must_not_leak",
    "123e4567-e89b-42d3-a456-426614174000",
    "qa-live-conversion-extra",
    "CUSTOMER_NAME_TOKEN",
  ];
  for (const value of leakValues) {
    assert.throws(
      () =>
        sanitizeRecord(
          {
            currency: "usd",
            amount_total: 100,
            order_type: "digital",
            plan: "single",
            client_reference_id: value,
          },
          9
        ),
      (err) => {
        const message = String(err?.message ?? "");
        assert.match(message, /sensitive|row-identifying/);
        assert.match(message, /client_reference_id/);
        assert.doesNotMatch(message, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        return true;
      },
      value
    );
  }

  // CLI: legacy QA excluded with empty identifier leakage; production counted.
  {
    const io = createIo();
    const doc = {
      schema_version: 1,
      records: [
        {
          currency: "usd",
          amount_total: 2900,
          order_type: "digital",
          plan: "single",
        },
        {
          currency: "usd",
          amount_total: 4100,
          order_type: "digital",
          plan: "single",
          clientReferenceId: LEGACY_QA_CLIENT_REFERENCE_VALUE,
        },
      ],
    };
    const tmp = path.join(path.dirname(FIXTURE_PATH), `.legacy-qa-cref-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify(doc));
    try {
      const code = runProductContribution({
        argv: ["--input", tmp, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 0);
      const combined = io.getStdout() + io.getStderr();
      assert.doesNotMatch(combined, new RegExp(LEGACY_QA_CLIENT_REFERENCE_VALUE));
      assert.doesNotMatch(combined, /client_reference/i);
      assert.doesNotMatch(combined, /clientReferenceId/);
      const parsed = JSON.parse(io.getStdout());
      const usd = parsed.currency_sections.find((s) => s.currency === "usd");
      assert.equal(usd.excluded_qa_count, 1);
      assert.equal(usd.excluded_qa_revenue_cents, 4100);
      const digital = usd.groups.find((g) => g.group_key === "digital:single");
      assert.equal(digital.paid_order_count, 1);
      assert.equal(digital.collected_revenue_cents, 2900);
      assert.equal(containsSensitiveOperatorText(combined), false);
    } finally {
      fs.unlinkSync(tmp);
    }
  }

  // CLI negative: non-legacy client_reference fails closed with empty aggregate stdout.
  {
    const io = createIo();
    const leak = "map-uuid-or-customer-token-LEAK";
    const doc = {
      schema_version: 1,
      records: [
        {
          currency: "usd",
          amount_total: 2900,
          order_type: "digital",
          plan: "single",
          client_reference_id: leak,
        },
      ],
    };
    const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-cref-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify(doc));
    try {
      const code = runProductContribution({
        argv: ["--input", tmp, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1);
      assert.equal(io.getStdout().trim(), "");
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.doesNotMatch(io.getStdout(), /digital:single/);
      const combined = io.getStdout() + io.getStderr();
      assert.doesNotMatch(combined, new RegExp(leak));
      assert.match(io.getStderr(), /sensitive|row-identifying|Product contribution failed/);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
});

test("mixed currencies produce separate sections and are never summed together", () => {
  const records = [
    { currency: "usd", amount_total: 1000, order_type: "digital", plan: "single" },
    { currency: "eur", amount_total: 2000, order_type: "digital", plan: "single" },
    { currency: "usd", amount_total: 3000, order_type: "digital", plan: "single" },
  ];
  const report = buildProductContributionReport(records, { env: {} });
  assert.deepEqual(
    report.currency_sections.map((s) => s.currency),
    ["eur", "usd"]
  );
  const usd = report.currency_sections.find((s) => s.currency === "usd");
  const eur = report.currency_sections.find((s) => s.currency === "eur");
  assert.equal(usd.collected_revenue_cents, 4000);
  assert.equal(eur.collected_revenue_cents, 2000);
  const totalIfCombined = usd.collected_revenue_cents + eur.collected_revenue_cents;
  assert.equal(totalIfCombined, 6000);
  // Report object has no combined grand total across currencies
  assert.equal(report.collected_revenue_cents, undefined);
});

test("unknown product metadata goes to exception bucket", () => {
  const estimate = estimateRecordContribution(
    {
      currency: "usd",
      amount_total: 5000,
      order_type: "print",
      print_variant: "not_a_real_variant",
      shipping_country: "US",
    },
    getStripeFeeConfig({}),
    {}
  );
  assert.equal(estimate.resolved, false);
  assert.equal(estimate.unresolvedReason, "unknown_product_metadata");
  assert.equal(estimate.contributionCents, null);
});

test("missing required cost inputs produce unresolved counts rather than fabricated margin", () => {
  const report = buildProductContributionReport(
    [
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        shipping_country: null,
      },
    ],
    { env: {} }
  );
  const usd = report.currency_sections[0];
  const group = usd.groups[0];
  assert.equal(group.unresolved_count, 1);
  assert.equal(group.estimated_pre_fixed_cost_contribution_cents, 0);
  assert.equal(group.contribution_margin_percent, null);
  assert.equal(group.contribution_per_order_cents, null);
});

test("shipping matrix currency mismatch is unresolved (never mixed into contribution)", () => {
  const estimate = estimateRecordContribution(
    {
      currency: "cad",
      amount_total: 12000,
      order_type: "print",
      print_variant: "poster_framed",
      shipping_country: "CA",
    },
    getStripeFeeConfig({}),
    {}
  );
  assert.equal(estimate.resolved, false);
  assert.equal(estimate.unresolvedReason, "shipping_currency_mismatch");
  assert.equal(estimate.contributionCents, null);
});

test("discounts and shipping subsidies are informational and not double-counted", () => {
  const feeConfig = getStripeFeeConfig({});
  const withMeta = estimateRecordContribution(
    {
      currency: "usd",
      amount_total: 10000,
      order_type: "print",
      print_variant: "poster_framed",
      shipping_country: "US",
      shipping_charge_cents: 0,
      shipping_subsidy_cents: 977,
      discount_cents: 500,
    },
    feeConfig,
    {}
  );
  assert.equal(withMeta.resolved, true);
  const expectedFee = estimateStripeFeeCents(10000, feeConfig);
  const product = getConfiguredProductCostCents("poster_framed", {});
  const ship = getConfiguredShippingCostCents("poster_framed", "US").amountCents;
  // Contribution uses amount_total only once; subsidy/discount not subtracted again
  assert.equal(withMeta.contributionCents, 10000 - expectedFee - product - ship);
  assert.equal(withMeta.shippingSubsidyCents, 977);
  assert.equal(withMeta.discountCents, 500);
});

test("invalid/negative/non-integer minor-unit amounts fail", () => {
  assert.throws(
    () => sanitizeRecord({ currency: "usd", amount_total: -1, order_type: "digital", plan: "single" }, 0),
    /non-negative/
  );
  assert.throws(
    () => sanitizeRecord({ currency: "usd", amount_total: 10.5, order_type: "digital", plan: "single" }, 0),
    /integer/
  );
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 100,
          order_type: "digital",
          plan: "single",
          discount_cents: 1.2,
        },
        0
      ),
    /integer/
  );
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 100,
          order_type: "digital",
          plan: "single",
          shipping_charge_cents: -5,
        },
        0
      ),
    /non-negative/
  );
});

test("customer/session/payment fields are rejected and never printed", () => {
  for (const field of ["session_id", "email", "customer_email", "payment_intent", "metadata", "name"]) {
    assert.throws(
      () =>
        sanitizeRecord(
          {
            currency: "usd",
            amount_total: 100,
            order_type: "digital",
            plan: "single",
            [field]: "should-not-appear",
          },
          0
        ),
      /sensitive|row-identifying/
    );
  }

  const io = createIo();
  const bad = {
    schema_version: 1,
    records: [
      {
        currency: "usd",
        amount_total: 100,
        order_type: "digital",
        plan: "single",
        email: "buyer@example.com",
        session_id: "cs_test_abc123xyz",
      },
    ],
  };
  const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-sensitive-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(bad));
  try {
    const code = runProductContribution({
      argv: ["--input", tmp, "--format", "json"],
      stdout: io.stdout,
      stderr: io.stderr,
      env: {},
    });
    assert.equal(code, 1);
    assert.equal(containsSensitiveOperatorText(io.getStdout()), false);
    assert.equal(containsSensitiveOperatorText(io.getStderr()), false);
    assert.doesNotMatch(io.getStderr(), /buyer@example\.com/);
    assert.doesNotMatch(io.getStderr(), /cs_test_abc123xyz/);
    assert.doesNotMatch(io.getStdout(), /buyer@example\.com/);
  } finally {
    fs.unlinkSync(tmp);
  }

  assert.ok(SENSITIVE_RECORD_FIELDS.includes("session_id"));
  assert.ok(SENSITIVE_RECORD_FIELDS.includes("metadata"));
});

test("JSON and table output contain aggregates only", () => {
  const { records } = parseSanitizedDocument(loadFixture());
  const report = buildProductContributionReport(records, { env: {} });
  assertAggregateOnly(report);

  const json = formatJsonReport(report);
  const table = formatTableReport(report);
  assert.equal(containsSensitiveOperatorText(json), false);
  assert.equal(containsSensitiveOperatorText(table), false);
  assert.doesNotMatch(json, /"paid_at"/);
  assert.doesNotMatch(json, /"records"/);
  assert.match(table, /contribution_cents=/);
  assert.match(json, /estimated_pre_fixed_cost_contribution_cents/);
});

test("input row order does not change results", () => {
  const { records } = parseSanitizedDocument(loadFixture());
  const forward = buildProductContributionReport(records, { env: {} });
  const reversed = buildProductContributionReport([...records].reverse(), { env: {} });
  assert.deepEqual(forward.currency_sections, reversed.currency_sections);
});

test("CLI runs offline against synthetic fixture", () => {
  const io = createIo();
  const code = runProductContribution({
    argv: ["--input", FIXTURE_PATH, "--format", "table"],
    stdout: io.stdout,
    stderr: io.stderr,
    env: {},
  });
  assert.equal(code, 0, io.getStderr());
  assert.match(io.getStdout(), /currency: usd/);
  assert.match(io.getStdout(), /currency: cad/);
  assert.match(io.getStdout(), /excluded_qa=/);
  assert.doesNotMatch(io.getStdout(), /cs_/);
  assert.doesNotMatch(io.getStdout(), /@/);
});

test("CLI JSON mode is aggregate-only and suitable for ingestion", () => {
  const io = createIo();
  const code = runProductContribution({
    argv: ["--input", FIXTURE_PATH, "--format", "json"],
    stdout: io.stdout,
    stderr: io.stderr,
    env: {},
  });
  assert.equal(code, 0, io.getStderr());
  const parsed = JSON.parse(io.getStdout());
  assert.equal(parsed.ok, true);
  assert.equal(parsed.report_kind, PRODUCT_CONTRIBUTION_CONTRACT.labels.reportKind);
  assert.equal(parsed.disclaimer.not_accounting_profit, true);
  assertAggregateOnly(parsed);
});

test("parseArgs requires --input and validates format", () => {
  assert.throws(() => parseArgs([]), /--input/);
  assert.throws(() => parseArgs(["--input", "x.json", "--format", "xml"]), /table|json/);
  assert.deepEqual(parseArgs(["--input", "x.json"]), {
    help: false,
    inputPath: "x.json",
    format: "table",
  });
});

test("impossible metadata combinations fail closed", () => {
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 100,
          order_type: "digital",
          plan: "single",
          print_variant: "poster_framed",
        },
        0
      ),
    /cannot include print_variant/
  );
});

test("Codex regression: print rows reject non-single plans regardless of include_digital", () => {
  // Pre-fix bug: guard was `plan && !includeDigital && plan !== "single"`, so
  // print+include_digital+pack3/subscription silently resolved into print:<variant>+digital.
  const badPlans = ["pack3", "subscription"];
  const includeDigitalFlags = [true, false];

  for (const plan of badPlans) {
    for (const include_digital of includeDigitalFlags) {
      assert.throws(
        () =>
          sanitizeRecord(
            {
              currency: "usd",
              amount_total: 10600,
              order_type: "print",
              print_variant: "poster_framed",
              plan,
              include_digital,
              shipping_country: "US",
            },
            0
          ),
        /unsupported plan/,
        `plan=${plan} include_digital=${include_digital}`
      );
    }
  }

  // Allowed: missing/blank plan, or plan=single (with or without HD add-on).
  for (const plan of [undefined, null, "", "single"]) {
    for (const include_digital of [true, false]) {
      const { record } = sanitizeRecord(
        {
          currency: "usd",
          amount_total: 10600,
          order_type: "print",
          print_variant: "poster_framed",
          ...(plan === undefined ? {} : { plan }),
          include_digital,
          shipping_country: "US",
        },
        0
      );
      assert.equal(record.order_type, "print");
      assert.equal(record.plan, plan === "" || plan == null ? null : "single");
    }
  }

  // CLI must exit nonzero and produce no aggregate contribution / no value leakage.
  for (const plan of badPlans) {
    for (const include_digital of includeDigitalFlags) {
      const io = createIo();
      const bad = {
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 10600,
            order_type: "print",
            print_variant: "poster_framed",
            plan,
            include_digital,
            shipping_country: "US",
          },
          // Would otherwise contribute if the bad row were only stripped:
          {
            currency: "usd",
            amount_total: 2900,
            order_type: "digital",
            plan: "single",
          },
        ],
      };
      const tmp = path.join(
        path.dirname(FIXTURE_PATH),
        `.bad-print-plan-${plan}-${include_digital}-${process.pid}.json`
      );
      fs.writeFileSync(tmp, JSON.stringify(bad));
      try {
        const code = runProductContribution({
          argv: ["--input", tmp, "--format", "json"],
          stdout: io.stdout,
          stderr: io.stderr,
          env: {},
        });
        assert.equal(code, 1, `cli exit plan=${plan} include_digital=${include_digital}`);
        assert.equal(io.getStdout().trim(), "");
        assert.doesNotMatch(io.getStdout(), /print:poster_framed\+digital/);
        assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
        assert.doesNotMatch(io.getStdout() + io.getStderr(), /cs_/);
        assert.doesNotMatch(io.getStdout() + io.getStderr(), /@/);
        // Rejected plan value must never appear in operator output.
        assert.doesNotMatch(io.getStdout() + io.getStderr(), new RegExp(plan, "i"));
        assert.match(io.getStderr(), /unsupported plan|Product contribution failed/);
      } finally {
        fs.unlinkSync(tmp);
      }
    }
  }
});

test("Codex regression: unsupported print plan errors never echo the rejected value", () => {
  // Distinctive sensitive-looking + log-injection style plan — must fail closed without leakage.
  const toxicPlan =
    "pack3\nAuthorization: Bearer sk_live_fake_token_do_not_leak\nalice.buyer@example.com\rcs_test_leakprobe";

  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 10600,
          order_type: "print",
          print_variant: "poster_framed",
          plan: toxicPlan,
          include_digital: true,
          shipping_country: "US",
        },
        7
      ),
    (err) => {
      assert.match(String(err?.message ?? ""), /records\[7\]: print order_type has unsupported plan/);
      assert.doesNotMatch(String(err?.message ?? ""), /sk_live_fake_token_do_not_leak/);
      assert.doesNotMatch(String(err?.message ?? ""), /alice\.buyer@example\.com/);
      assert.doesNotMatch(String(err?.message ?? ""), /cs_test_leakprobe/);
      assert.doesNotMatch(String(err?.message ?? ""), /Authorization/);
      assert.doesNotMatch(String(err?.message ?? ""), /Bearer/);
      assert.doesNotMatch(String(err?.message ?? ""), /pack3/);
      return true;
    }
  );

  const io = createIo();
  const tmp = path.join(path.dirname(FIXTURE_PATH), `.toxic-print-plan-${process.pid}.json`);
  fs.writeFileSync(
    tmp,
    JSON.stringify({
      schema_version: 1,
      records: [
        {
          currency: "usd",
          amount_total: 10600,
          order_type: "print",
          print_variant: "poster_framed",
          plan: toxicPlan,
          include_digital: false,
          shipping_country: "US",
        },
        {
          currency: "usd",
          amount_total: 2900,
          order_type: "digital",
          plan: "single",
        },
      ],
    })
  );
  try {
    const code = runProductContribution({
      argv: ["--input", tmp, "--format", "json"],
      stdout: io.stdout,
      stderr: io.stderr,
      env: {},
    });
    assert.equal(code, 1);
    assert.equal(io.getStdout().trim(), "");
    assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
    assert.doesNotMatch(io.getStdout(), /print:poster_framed/);
    assert.doesNotMatch(io.getStdout(), /digital:single/);
    const combined = io.getStdout() + io.getStderr();
    assert.doesNotMatch(combined, /sk_live_fake_token_do_not_leak/);
    assert.doesNotMatch(combined, /alice\.buyer@example\.com/);
    assert.doesNotMatch(combined, /cs_test_leakprobe/);
    assert.doesNotMatch(combined, /Authorization:\s*Bearer/);
    assert.doesNotMatch(combined, /pack3/);
    assert.match(io.getStderr(), /unsupported plan|Product contribution failed/);
    assert.equal(containsSensitiveOperatorText(combined), false);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test("Codex regression: print_card_asset_id and asset-id variants fail closed before unknown stripping", () => {
  const assetFields = [
    "print_card_asset_id",
    "printCardAssetId",
    "PrintCardAssetId",
    "print_asset_id",
    "printAssetId",
    "card_print_asset_id",
    "cardPrintAssetId",
    "map_id",
    "mapId",
  ];

  for (const field of assetFields) {
    assert.equal(isSensitiveRecordFieldKey(field), true, field);
    assert.throws(
      () =>
        sanitizeRecord(
          {
            currency: "usd",
            amount_total: 11800,
            order_type: "print",
            print_variant: "poster_framed",
            include_card: true,
            shipping_country: "US",
            [field]: "ASSET_VALUE_MUST_NOT_LEAK_xyz",
          },
          0
        ),
      /sensitive|row-identifying/,
      field
    );
  }

  assert.ok(SENSITIVE_RECORD_FIELDS.includes("print_card_asset_id"));
  assert.ok(SENSITIVE_RECORD_FIELDS.includes("printCardAssetId"));

  const io = createIo();
  const bad = {
    schema_version: 1,
    records: [
      {
        currency: "usd",
        amount_total: 11800,
        order_type: "print",
        print_variant: "poster_framed",
        include_card: true,
        shipping_country: "US",
        print_card_asset_id: "ASSET_VALUE_MUST_NOT_LEAK_xyz",
      },
      {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
      },
    ],
  };
  const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-card-asset-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(bad));
  try {
    const code = runProductContribution({
      argv: ["--input", tmp, "--format", "json"],
      stdout: io.stdout,
      stderr: io.stderr,
      env: {},
    });
    assert.equal(code, 1);
    assert.equal(io.getStdout().trim(), "");
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /ASSET_VALUE_MUST_NOT_LEAK/);
    assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
    assert.match(io.getStderr(), /sensitive|row-identifying|Product contribution failed/);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test("Codex regression: print_merch_* markers fail closed and never contribute as print variants", () => {
  const merchFields = [
    "print_merch_family",
    "printMerchFamily",
    "print_merch_catalog_variant_id",
    "printMerchCatalogVariantId",
    "print_merch_size",
    "printMerchSize",
    "print_merch_color",
    "printMerchColor",
  ];

  for (const field of merchFields) {
    assert.equal(isUnsupportedMerchFieldKey(field), true, field);
    // Must not be treated as a silent unknown strip path.
    assert.throws(
      () =>
        sanitizeRecord(
          {
            currency: "usd",
            amount_total: 2500,
            order_type: "print",
            print_variant: "poster_framed",
            shipping_country: "US",
            [field]: "sticker_kisscut_MUST_NOT_LEAK",
          },
          0
        ),
      /unsupported merch|merch contribution/,
      field
    );
  }

  for (const field of UNSUPPORTED_MERCH_RECORD_FIELDS) {
    assert.equal(isUnsupportedMerchFieldKey(field), true, field);
  }

  // Each marker: CLI nonzero, empty aggregate stdout, no print:<variant> contribution.
  for (const field of [
    "print_merch_family",
    "print_merch_catalog_variant_id",
    "print_merch_size",
    "print_merch_color",
  ]) {
    const io = createIo();
    const bad = {
      schema_version: 1,
      records: [
        {
          currency: "usd",
          amount_total: 2500,
          order_type: "print",
          print_variant: "poster_framed",
          shipping_country: "US",
          [field]: "sticker_kisscut_MUST_NOT_LEAK",
        },
        {
          currency: "usd",
          amount_total: 2900,
          order_type: "digital",
          plan: "single",
        },
      ],
    };
    const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-merch-${field}-${process.pid}.json`);
    fs.writeFileSync(tmp, JSON.stringify(bad));
    try {
      const code = runProductContribution({
        argv: ["--input", tmp, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1, field);
      assert.equal(io.getStdout().trim(), "");
      assert.doesNotMatch(io.getStdout(), /print:poster_framed/);
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.doesNotMatch(io.getStdout() + io.getStderr(), /sticker_kisscut_MUST_NOT_LEAK/);
      assert.match(io.getStderr(), /unsupported merch|Product contribution failed/);
    } finally {
      fs.unlinkSync(tmp);
    }
  }

  // Ordinary supported print/digital rows remain unchanged (no merch/asset keys).
  const { record: printOk } = sanitizeRecord(
    {
      currency: "usd",
      amount_total: 9900,
      order_type: "print",
      print_variant: "poster_framed",
      shipping_country: "US",
      include_digital: false,
      plan: "single",
    },
    0
  );
  assert.equal(classifyProductGroup(printOk).groupKey, "print:poster_framed");
  const printEst = estimateRecordContribution(printOk, getStripeFeeConfig({}), {});
  assert.equal(printEst.resolved, true);
  assert.ok(printEst.contributionCents !== null);

  const { record: digitalOk } = sanitizeRecord(
    {
      currency: "usd",
      amount_total: 2900,
      order_type: "digital",
      plan: "single",
    },
    0
  );
  assert.equal(classifyProductGroup(digitalOk).groupKey, "digital:single");

  const fixtureReport = buildProductContributionReport(parseSanitizedDocument(loadFixture()).records, {
    env: {},
  });
  assert.ok(fixtureReport.currency_sections.some((s) => s.currency === "usd"));
  const usd = fixtureReport.currency_sections.find((s) => s.currency === "usd");
  assert.ok(usd.groups.some((g) => g.group_key === "print:poster_framed"));
  assert.ok(usd.groups.some((g) => g.group_key === "digital:single"));
});

test("Codex regression: printMerchant* context keys are not treated as print_merch markers", () => {
  // Pre-fix bug: /^printmerch/.test(lower) matched printMerchantCountry → unsupported merch.
  const unrelatedMerchantKeys = [
    "printMerchantCountry",
    "printMerchantLabel",
    "printMerchantId",
    "PrintMerchantProcessor",
  ];

  for (const field of unrelatedMerchantKeys) {
    assert.equal(isUnsupportedMerchFieldKey(field), false, field);
    assert.equal(isSensitiveRecordFieldKey(field), false, field);
    // Normalized form is print_merchant_*, not print_merch_*.
    assert.match(normalizeRecordFieldKey(field), /^print_merchant/);
    assert.doesNotMatch(normalizeRecordFieldKey(field), /^print_merch(_|$)/);

    const { record, warnings } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
        [field]: "merchant_context_must_not_fail_as_merch",
      },
      0
    );
    assert.equal(record.order_type, "digital");
    assert.equal(record.plan, "single");
    assert.ok(
      warnings.some((w) => w.includes(`stripped unknown field "${field}"`)),
      `expected unknown-field strip warning for ${field}`
    );
  }

  // Real merch markers still fail closed (including PascalCase).
  for (const field of ["print_merch_family", "printMerchFamily", "PrintMerchCatalogVariantId"]) {
    assert.equal(isUnsupportedMerchFieldKey(field), true, field);
    assert.throws(
      () =>
        sanitizeRecord(
          {
            currency: "usd",
            amount_total: 2500,
            order_type: "print",
            print_variant: "poster_framed",
            shipping_country: "US",
            [field]: "MERCH_VALUE_MUST_NOT_LEAK",
          },
          0
        ),
      /unsupported merch|merch contribution/
    );
  }

  // CLI: unrelated merchant key strips; report still aggregates; no value leakage.
  const io = createIo();
  const doc = {
    schema_version: 1,
    records: [
      {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
        printMerchantCountry: "US_MERCHANT_CONTEXT_SECRET",
      },
    ],
  };
  const tmp = path.join(path.dirname(FIXTURE_PATH), `.merchant-context-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify(doc));
  try {
    const code = runProductContribution({
      argv: ["--input", tmp, "--format", "json"],
      stdout: io.stdout,
      stderr: io.stderr,
      env: {},
    });
    assert.equal(code, 0, io.getStderr());
    assert.match(io.getStderr(), /stripped unknown field "printMerchantCountry"/);
    assert.doesNotMatch(io.getStderr(), /unsupported merch/);
    const parsed = JSON.parse(io.getStdout());
    assert.equal(parsed.ok, true);
    assert.equal(parsed.currency_sections[0].groups[0].group_key, "digital:single");
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /US_MERCHANT_CONTEXT_SECRET/);
    assert.doesNotMatch(io.getStdout() + io.getStderr(), /MERCH_VALUE_MUST_NOT_LEAK/);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test("Codex regression: include_card only valid for print poster_framed without digital", () => {
  // Checkout only sets print_include_card when poster_framed && !include_digital.
  const impossible = [
    {
      label: "poster_unframed+card",
      row: {
        currency: "usd",
        amount_total: 5500,
        order_type: "print",
        print_variant: "poster_unframed",
        include_card: true,
        shipping_country: "US",
      },
    },
    {
      label: "canvas_wrap+card",
      row: {
        currency: "usd",
        amount_total: 6500,
        order_type: "print",
        print_variant: "canvas_wrap",
        include_card: true,
        shipping_country: "US",
      },
    },
    {
      label: "poster_framed+digital+card",
      row: {
        currency: "usd",
        amount_total: 12500,
        order_type: "print",
        print_variant: "poster_framed",
        include_digital: true,
        include_card: true,
        shipping_country: "US",
      },
    },
    {
      label: "digital+card",
      row: {
        currency: "usd",
        amount_total: 2900,
        order_type: "digital",
        plan: "single",
        include_card: true,
      },
    },
    {
      label: "unknown_order+card",
      row: {
        currency: "usd",
        amount_total: 4000,
        order_type: "gift",
        include_card: true,
      },
    },
  ];

  for (const { label, row } of impossible) {
    assert.throws(() => sanitizeRecord(row, 0), /include_card|print bundle flags/, label);
  }

  // Valid framed + card path remains.
  const { record: validCard } = sanitizeRecord(
    {
      currency: "usd",
      amount_total: 11800,
      order_type: "print",
      print_variant: "poster_framed",
      include_digital: false,
      include_card: true,
      shipping_country: "US",
    },
    0
  );
  assert.equal(classifyProductGroup(validCard).groupKey, "print:poster_framed+card");
  const est = estimateRecordContribution(validCard, getStripeFeeConfig({}), {});
  assert.equal(est.resolved, true);
  assert.ok(est.contributionCents !== null);

  for (const { label, row } of impossible) {
    const io = createIo();
    const bad = {
      schema_version: 1,
      records: [
        row,
        {
          currency: "usd",
          amount_total: 2900,
          order_type: "digital",
          plan: "single",
        },
      ],
    };
    const tmp = path.join(
      path.dirname(FIXTURE_PATH),
      `.bad-card-combo-${label.replace(/\+/g, "-")}-${process.pid}.json`
    );
    fs.writeFileSync(tmp, JSON.stringify(bad));
    try {
      const code = runProductContribution({
        argv: ["--input", tmp, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1, label);
      assert.equal(io.getStdout().trim(), "");
      assert.doesNotMatch(io.getStdout(), /print:poster_unframed\+card/);
      assert.doesNotMatch(io.getStdout(), /print:canvas_wrap\+card/);
      assert.doesNotMatch(io.getStdout(), /print:poster_framed\+digital\+card/);
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.match(io.getStderr(), /include_card|print bundle flags|Product contribution failed/);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
});

test("Codex regression: preserve Stripe print_include_* checkout aliases before stripping", () => {
  assert.equal(CHECKOUT_ADDON_ALIAS_NORMALIZED.include_digital, "print_include_digital");
  assert.equal(CHECKOUT_ADDON_ALIAS_NORMALIZED.include_card, "print_include_card");
  for (const key of [
    "print_include_digital",
    "printIncludeDigital",
    "PrintIncludeDigital",
    "print_include_card",
    "printIncludeCard",
    "PrintIncludeCard",
  ]) {
    assert.equal(isCheckoutAddonAliasKey(key), true, key);
    assert.equal(isSensitiveRecordFieldKey(key), false, key);
  }

  // 1) framed + HD via alias only
  {
    const { record, warnings } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 10600,
        order_type: "print",
        print_variant: "poster_framed",
        print_include_digital: true,
        shipping_country: "US",
      },
      0
    );
    assert.equal(record.include_digital, true);
    assert.equal(record.include_card, false);
    assert.equal(classifyProductGroup(record).groupKey, "print:poster_framed+digital");
    assert.equal(
      warnings.some((w) => w.includes("print_include_digital")),
      false,
      "alias must not be stripped as unknown"
    );
  }

  // 2) framed + card via alias only
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 11800,
        order_type: "print",
        print_variant: "poster_framed",
        print_include_card: true,
        shipping_country: "US",
      },
      0
    );
    assert.equal(record.include_card, true);
    assert.equal(record.include_digital, false);
    assert.equal(classifyProductGroup(record).groupKey, "print:poster_framed+card");
  }

  // 3) explicit false aliases
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        print_include_digital: false,
        print_include_card: "false",
        shipping_country: "US",
      },
      0
    );
    assert.equal(record.include_digital, false);
    assert.equal(record.include_card, false);
    assert.equal(classifyProductGroup(record).groupKey, "print:poster_framed");
  }

  // 4) matching canonical + alias
  {
    assert.equal(
      resolveCanonicalBoolWithAlias(
        { include_digital: true, printIncludeDigital: "true" },
        0,
        "include_digital",
        "print_include_digital"
      ),
      true
    );
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 10600,
        order_type: "print",
        print_variant: "poster_framed",
        include_digital: true,
        print_include_digital: true,
        shipping_country: "US",
      },
      0
    );
    assert.equal(record.include_digital, true);
    assert.equal(classifyProductGroup(record).groupKey, "print:poster_framed+digital");
  }

  // 5) conflicting canonical + alias fails closed
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 10600,
          order_type: "print",
          print_variant: "poster_framed",
          include_digital: false,
          print_include_digital: true,
          shipping_country: "US",
        },
        0
      ),
    /conflicting values for include_digital and print_include_digital/
  );
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 11800,
          order_type: "print",
          print_variant: "poster_framed",
          include_card: true,
          printIncludeCard: false,
          shipping_country: "US",
        },
        0
      ),
    /conflicting values for include_card and print_include_card/
  );

  // 6) CLI: alias-only succeeds; conflict fails with empty stdout and no value leakage
  {
    const io = createIo();
    const okDoc = {
      schema_version: 1,
      records: [
        {
          currency: "usd",
          amount_total: 10600,
          order_type: "print",
          print_variant: "poster_framed",
          print_include_digital: true,
          shipping_country: "US",
        },
      ],
    };
    const tmpOk = path.join(path.dirname(FIXTURE_PATH), `.alias-ok-${process.pid}.json`);
    fs.writeFileSync(tmpOk, JSON.stringify(okDoc));
    try {
      const code = runProductContribution({
        argv: ["--input", tmpOk, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 0, io.getStderr());
      const parsed = JSON.parse(io.getStdout());
      assert.ok(
        parsed.currency_sections[0].groups.some((g) => g.group_key === "print:poster_framed+digital")
      );
    } finally {
      fs.unlinkSync(tmpOk);
    }
  }
  {
    const io = createIo();
    const tmpBad = path.join(path.dirname(FIXTURE_PATH), `.alias-conflict-${process.pid}.json`);
    fs.writeFileSync(
      tmpBad,
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 10600,
            order_type: "print",
            print_variant: "poster_framed",
            include_digital: false,
            print_include_digital: "yes",
            shipping_country: "US",
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmpBad, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1);
      assert.equal(io.getStdout().trim(), "");
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.doesNotMatch(io.getStdout(), /print:poster_framed\+digital/);
      // Must not echo the alias value token from the export.
      assert.doesNotMatch(io.getStdout() + io.getStderr(), /"yes"/);
      assert.match(io.getStderr(), /conflicting values|Product contribution failed/);
      assert.equal(containsSensitiveOperatorText(io.getStdout() + io.getStderr()), false);
    } finally {
      fs.unlinkSync(tmpBad);
    }
  }
});

test("Codex regression: malformed include flag values fail closed (never coerce to false)", () => {
  // Valid documented forms
  for (const [raw, expected] of [
    [true, true],
    [false, false],
    [1, true],
    [0, false],
    ["true", true],
    ["FALSE", false],
    ["1", true],
    ["0", false],
    ["yes", true],
    ["No", false],
    ["  true  ", true],
  ]) {
    assert.equal(parseStrictIncludeBool(raw, 0, "include_digital"), expected, String(raw));
  }
  for (const s of STRICT_INCLUDE_BOOL_TRUE_STRINGS) {
    assert.equal(parseStrictIncludeBool(s, 0, "include_digital"), true, s);
  }
  for (const s of STRICT_INCLUDE_BOOL_FALSE_STRINGS) {
    assert.equal(parseStrictIncludeBool(s, 0, "include_card"), false, s);
  }

  const malformed = [
    "tru",
    "yes!",
    "",
    " ",
    2,
    -1,
    1.5,
    NaN,
    null,
    undefined,
    {},
    [],
    { true: true },
    ["true"],
  ];
  for (const bad of malformed) {
    assert.throws(
      () => parseStrictIncludeBool(bad, 3, "include_digital"),
      /records\[3\]: invalid boolean value for include_digital/,
      `must reject ${Object.prototype.toString.call(bad)}`
    );
  }

  // Canonical malformed → schema error; must not classify as plain framed print
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 10600,
          order_type: "print",
          print_variant: "poster_framed",
          include_digital: "tru",
          shipping_country: "US",
        },
        0
      ),
    /invalid boolean value for include_digital/
  );
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 9900,
          order_type: "print",
          print_variant: "poster_framed",
          include_card: 2,
          shipping_country: "US",
        },
        0
      ),
    /invalid boolean value for include_card/
  );

  // Alias malformed (checkout key names)
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 10600,
          order_type: "print",
          print_variant: "poster_framed",
          print_include_digital: "tru",
          shipping_country: "US",
        },
        1
      ),
    /invalid boolean value for print_include_digital/
  );
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 11800,
          order_type: "print",
          print_variant: "poster_framed",
          printIncludeCard: null,
          shipping_country: "US",
        },
        2
      ),
    /invalid boolean value for print_include_card/
  );

  // Matching valid string forms still succeed via alias
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 10600,
        order_type: "print",
        print_variant: "poster_framed",
        print_include_digital: "YES",
        shipping_country: "US",
      },
      0
    );
    assert.equal(record.include_digital, true);
    assert.equal(classifyProductGroup(record).groupKey, "print:poster_framed+digital");
  }

  // Conflict still preferred when both valid but disagree; malformed still fails first
  assert.throws(
    () =>
      resolveCanonicalBoolWithAlias(
        { include_digital: true, print_include_digital: "tru" },
        0,
        "include_digital",
        "print_include_digital"
      ),
    /invalid boolean value for print_include_digital/
  );

  // CLI negative controls: nonzero exit, empty aggregate stdout, no grouping, no leakage
  const cases = [
    { field: "include_digital", value: "tru", leak: "tru" },
    { field: "print_include_digital", value: "tru", leak: "tru" },
    { field: "include_card", value: 2, leak: null },
    { field: "print_include_card", value: { ok: true }, leak: "ok" },
    { field: "include_digital", value: ["true"], leak: null },
  ];
  for (const { field, value, leak } of cases) {
    const io = createIo();
    const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-include-${field}-${process.pid}.json`);
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 10600,
            order_type: "print",
            print_variant: "poster_framed",
            shipping_country: "US",
            [field]: value,
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmp, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1, `cli exit field=${field}`);
      assert.equal(io.getStdout().trim(), "", `empty stdout field=${field}`);
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.doesNotMatch(io.getStdout(), /print:poster_framed/);
      assert.doesNotMatch(io.getStdout(), /print:poster_framed\+digital/);
      assert.match(io.getStderr(), /invalid boolean value|Product contribution failed/);
      if (leak) {
        assert.doesNotMatch(io.getStdout() + io.getStderr(), new RegExp(leak));
      }
      assert.equal(containsSensitiveOperatorText(io.getStdout() + io.getStderr()), false);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
});

test("Codex regression: preserve Stripe print_shipping_country alias before stripping", () => {
  assert.equal(CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_country, "print_shipping_country");
  for (const key of ["print_shipping_country", "printShippingCountry", "PrintShippingCountry"]) {
    assert.equal(isCheckoutShippingAliasKey(key), true, key);
    assert.equal(isCheckoutMetadataAliasKey(key), true, key);
    assert.equal(isSensitiveRecordFieldKey(key), false, key);
    assert.equal(isCheckoutAddonAliasKey(key), false, key);
  }

  const canonicalBase = {
    currency: "usd",
    amount_total: 9900,
    order_type: "print",
    print_variant: "poster_framed",
    shipping_country: "US",
  };
  const { record: canonicalRecord } = sanitizeRecord(canonicalBase, 0);
  const feeConfig = getStripeFeeConfig({});
  const canonicalEstimate = estimateRecordContribution(canonicalRecord, feeConfig, {});
  assert.equal(canonicalEstimate.resolved, true);
  assert.ok(canonicalEstimate.shippingCostCents > 0);
  assert.equal(canonicalEstimate.unresolvedReason, null);

  // Positive: alias-only snake_case resolves identically to canonical
  {
    const { record, warnings } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        print_shipping_country: "US",
      },
      0
    );
    assert.equal(record.shipping_country, "US");
    assert.equal(
      warnings.some((w) => w.includes("print_shipping_country")),
      false,
      "alias must not be stripped as unknown"
    );
    const estimate = estimateRecordContribution(record, feeConfig, {});
    assert.equal(estimate.resolved, true);
    assert.equal(estimate.shippingCostCents, canonicalEstimate.shippingCostCents);
    assert.equal(estimate.contributionCents, canonicalEstimate.contributionCents);
    assert.equal(classifyProductGroup(record).groupKey, "print:poster_framed");
  }

  // Positive: camelCase / PascalCase aliases
  for (const key of ["printShippingCountry", "PrintShippingCountry"]) {
    const { record, warnings } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        [key]: "us",
      },
      0
    );
    assert.equal(record.shipping_country, "US", key);
    assert.equal(
      warnings.some((w) => w.toLowerCase().includes("printshippingcountry")),
      false,
      key
    );
    const estimate = estimateRecordContribution(record, feeConfig, {});
    assert.equal(estimate.contributionCents, canonicalEstimate.contributionCents, key);
  }

  // Positive: matching canonical + alias (case-insensitive after normalize)
  {
    assert.equal(
      resolveCanonicalShippingCountryWithAlias({ shipping_country: "US", printShippingCountry: "us" }, 0),
      "US"
    );
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        shipping_country: "US",
        print_shipping_country: "US",
      },
      0
    );
    assert.equal(record.shipping_country, "US");
    assert.equal(
      estimateRecordContribution(record, feeConfig, {}).contributionCents,
      canonicalEstimate.contributionCents
    );
  }

  // Negative: conflicting canonical + alias fails closed
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 9900,
          order_type: "print",
          print_variant: "poster_framed",
          shipping_country: "US",
          print_shipping_country: "CA",
        },
        0
      ),
    /conflicting values for shipping_country and print_shipping_country/
  );
  assert.throws(
    () =>
      resolveCanonicalShippingCountryWithAlias({ shipping_country: "US", print_shipping_country: "GB" }, 4),
    /records\[4\]: conflicting values for shipping_country and print_shipping_country/
  );

  // CLI positive: alias-only contributes (not missing_shipping_country)
  {
    const io = createIo();
    const tmpOk = path.join(path.dirname(FIXTURE_PATH), `.ship-alias-ok-${process.pid}.json`);
    fs.writeFileSync(
      tmpOk,
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 9900,
            order_type: "print",
            print_variant: "poster_framed",
            print_shipping_country: "US",
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmpOk, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 0, io.getStderr());
      const parsed = JSON.parse(io.getStdout());
      const section = parsed.currency_sections[0];
      assert.equal(section.unresolved_count, 0);
      const framed = section.groups.find((g) => g.group_key === "print:poster_framed");
      assert.ok(framed);
      assert.equal(framed.paid_order_count, 1);
      assert.equal(framed.unresolved_count, 0);
      assert.equal(framed.estimated_pre_fixed_cost_contribution_cents, canonicalEstimate.contributionCents);
    } finally {
      fs.unlinkSync(tmpOk);
    }
  }

  // CLI negative: conflict → nonzero, empty stdout, no leakage of country codes as conflict payload
  {
    const io = createIo();
    const tmpBad = path.join(path.dirname(FIXTURE_PATH), `.ship-alias-conflict-${process.pid}.json`);
    fs.writeFileSync(
      tmpBad,
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 9900,
            order_type: "print",
            print_variant: "poster_framed",
            shipping_country: "US",
            print_shipping_country: "CA",
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmpBad, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1);
      assert.equal(io.getStdout().trim(), "");
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.doesNotMatch(io.getStdout(), /print:poster_framed/);
      assert.match(io.getStderr(), /conflicting values|Product contribution failed/);
      // Must not echo conflicting country values from the export.
      assert.doesNotMatch(io.getStdout() + io.getStderr(), /"CA"/);
      assert.doesNotMatch(io.getStdout() + io.getStderr(), /"US"/);
      assert.equal(containsSensitiveOperatorText(io.getStdout() + io.getStderr()), false);
    } finally {
      fs.unlinkSync(tmpBad);
    }
  }
});

test("Codex regression: preserve Stripe print_shipping_charge/subsidy cents aliases", () => {
  assert.equal(CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_charge_cents, "print_shipping_charge_cents");
  assert.equal(CHECKOUT_SHIPPING_ALIAS_NORMALIZED.shipping_subsidy_cents, "print_shipping_subsidy_cents");
  for (const key of [
    "print_shipping_charge_cents",
    "printShippingChargeCents",
    "PrintShippingChargeCents",
    "print_shipping_subsidy_cents",
    "printShippingSubsidyCents",
    "PrintShippingSubsidyCents",
  ]) {
    assert.equal(isCheckoutShippingAliasKey(key), true, key);
    assert.equal(isCheckoutMetadataAliasKey(key), true, key);
    assert.equal(isSensitiveRecordFieldKey(key), false, `must not hit /charge/ or strip: ${key}`);
  }

  const feeConfig = getStripeFeeConfig({});
  const canonicalBase = {
    currency: "usd",
    amount_total: 9900,
    order_type: "print",
    print_variant: "poster_framed",
    shipping_country: "US",
    shipping_charge_cents: 0,
    shipping_subsidy_cents: 977,
  };
  const { record: canonicalRecord } = sanitizeRecord(canonicalBase, 0);
  const canonicalEstimate = estimateRecordContribution(canonicalRecord, feeConfig, {});
  assert.equal(canonicalRecord.shipping_charge_cents, 0);
  assert.equal(canonicalRecord.shipping_subsidy_cents, 977);
  assert.equal(canonicalEstimate.resolved, true);
  // Informational only — contribution arithmetic unchanged vs omitting these fields.
  const { record: bareRecord } = sanitizeRecord(
    {
      currency: "usd",
      amount_total: 9900,
      order_type: "print",
      print_variant: "poster_framed",
      shipping_country: "US",
    },
    0
  );
  assert.equal(
    estimateRecordContribution(bareRecord, feeConfig, {}).contributionCents,
    canonicalEstimate.contributionCents
  );

  // Positive: alias-only parity with canonical
  {
    const { record, warnings } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        shipping_country: "US",
        print_shipping_charge_cents: 0,
        print_shipping_subsidy_cents: 977,
      },
      0
    );
    assert.equal(record.shipping_charge_cents, 0);
    assert.equal(record.shipping_subsidy_cents, 977);
    assert.equal(
      warnings.some((w) => /print_shipping_(charge|subsidy)_cents/.test(w)),
      false,
      "aliases must not be stripped"
    );
    const estimate = estimateRecordContribution(record, feeConfig, {});
    assert.equal(estimate.shippingChargeCents, canonicalEstimate.shippingChargeCents);
    assert.equal(estimate.shippingSubsidyCents, canonicalEstimate.shippingSubsidyCents);
    assert.equal(estimate.contributionCents, canonicalEstimate.contributionCents);
  }

  // Positive: camelCase / PascalCase charge+subsidy aliases
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        printShippingCountry: "US",
        printShippingChargeCents: 977,
        PrintShippingSubsidyCents: 0,
      },
      0
    );
    assert.equal(record.shipping_charge_cents, 977);
    assert.equal(record.shipping_subsidy_cents, 0);
  }

  // Positive: matching canonical + alias
  assert.equal(
    resolveCanonicalCentsWithAlias(
      { shipping_charge_cents: 500, printShippingChargeCents: 500 },
      0,
      "shipping_charge_cents",
      "print_shipping_charge_cents"
    ),
    500
  );
  {
    const { record } = sanitizeRecord(
      {
        currency: "usd",
        amount_total: 9900,
        order_type: "print",
        print_variant: "poster_framed",
        shipping_country: "US",
        shipping_subsidy_cents: 977,
        print_shipping_subsidy_cents: 977,
        shipping_charge_cents: 0,
        print_shipping_charge_cents: 0,
      },
      0
    );
    assert.equal(record.shipping_charge_cents, 0);
    assert.equal(record.shipping_subsidy_cents, 977);
  }

  // Negative: conflicting canonical + alias
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 9900,
          order_type: "print",
          print_variant: "poster_framed",
          shipping_country: "US",
          shipping_charge_cents: 0,
          print_shipping_charge_cents: 977,
        },
        0
      ),
    /conflicting values for shipping_charge_cents and print_shipping_charge_cents/
  );
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 9900,
          order_type: "print",
          print_variant: "poster_framed",
          shipping_country: "US",
          shipping_subsidy_cents: 100,
          printShippingSubsidyCents: 200,
        },
        1
      ),
    /conflicting values for shipping_subsidy_cents and print_shipping_subsidy_cents/
  );

  // Negative: malformed alias values (reuse canonical numeric validation; no broadening)
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 9900,
          order_type: "print",
          print_variant: "poster_framed",
          shipping_country: "US",
          print_shipping_charge_cents: "0",
        },
        2
      ),
    /print_shipping_charge_cents must be an integer minor-unit amount/
  );
  assert.throws(
    () =>
      sanitizeRecord(
        {
          currency: "usd",
          amount_total: 9900,
          order_type: "print",
          print_variant: "poster_framed",
          shipping_country: "US",
          print_shipping_subsidy_cents: -1,
        },
        3
      ),
    /print_shipping_subsidy_cents must be a non-negative integer/
  );

  // CLI positive: alias-only reports informational aggregates; contribution unchanged
  {
    const io = createIo();
    const tmpOk = path.join(path.dirname(FIXTURE_PATH), `.ship-cents-alias-ok-${process.pid}.json`);
    fs.writeFileSync(
      tmpOk,
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 9900,
            order_type: "print",
            print_variant: "poster_framed",
            print_shipping_country: "US",
            print_shipping_charge_cents: 0,
            print_shipping_subsidy_cents: 977,
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmpOk, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 0, io.getStderr());
      const parsed = JSON.parse(io.getStdout());
      const section = parsed.currency_sections[0];
      assert.equal(section.unresolved_count, 0);
      assert.equal(section.shipping_charge_cents, 0);
      assert.equal(section.shipping_subsidy_cents, 977);
      const framed = section.groups.find((g) => g.group_key === "print:poster_framed");
      assert.ok(framed);
      assert.equal(framed.estimated_pre_fixed_cost_contribution_cents, canonicalEstimate.contributionCents);
    } finally {
      fs.unlinkSync(tmpOk);
    }
  }

  // CLI negative: conflict → nonzero, empty stdout, no value leakage
  {
    const io = createIo();
    const tmpBad = path.join(path.dirname(FIXTURE_PATH), `.ship-cents-conflict-${process.pid}.json`);
    fs.writeFileSync(
      tmpBad,
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 9900,
            order_type: "print",
            print_variant: "poster_framed",
            shipping_country: "US",
            shipping_charge_cents: 0,
            print_shipping_charge_cents: 4242,
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmpBad, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1);
      assert.equal(io.getStdout().trim(), "");
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.doesNotMatch(io.getStdout(), /print:poster_framed/);
      assert.match(io.getStderr(), /conflicting values|Product contribution failed/);
      assert.doesNotMatch(io.getStdout() + io.getStderr(), /4242/);
      assert.equal(containsSensitiveOperatorText(io.getStdout() + io.getStderr()), false);
    } finally {
      fs.unlinkSync(tmpBad);
    }
  }

  // CLI negative: malformed alias → nonzero, empty stdout, no leakage
  {
    const io = createIo();
    const tmpBad = path.join(path.dirname(FIXTURE_PATH), `.ship-cents-malformed-${process.pid}.json`);
    fs.writeFileSync(
      tmpBad,
      JSON.stringify({
        schema_version: 1,
        records: [
          {
            currency: "usd",
            amount_total: 9900,
            order_type: "print",
            print_variant: "poster_framed",
            shipping_country: "US",
            print_shipping_subsidy_cents: "977",
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmpBad, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1);
      assert.equal(io.getStdout().trim(), "");
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.match(io.getStderr(), /integer minor-unit amount|Product contribution failed/);
      assert.doesNotMatch(io.getStdout() + io.getStderr(), /"977"/);
      assert.equal(containsSensitiveOperatorText(io.getStdout() + io.getStderr()), false);
    } finally {
      fs.unlinkSync(tmpBad);
    }
  }
});

test("invalid JSON exits nonzero", () => {
  const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-json-${process.pid}.json`);
  fs.writeFileSync(tmp, "{ not json");
  const io = createIo();
  try {
    const code = runProductContribution({
      argv: ["--input", tmp],
      stdout: io.stdout,
      stderr: io.stderr,
      env: {},
    });
    assert.equal(code, 1);
    assert.match(io.getStderr(), /Invalid JSON/);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test("Codex regression: invalid schema_version errors never echo the supplied value", () => {
  const cases = [
    {
      label: "sensitive-looking-string",
      schema_version: "sk_live_fake_schema_token\nalice.buyer@example.com\nAuthorization: Bearer leakprobe",
      leaks: [
        /sk_live_fake_schema_token/,
        /alice\.buyer@example\.com/,
        /Authorization:\s*Bearer/,
        /leakprobe/,
      ],
    },
    {
      label: "nested-object",
      schema_version: {
        customer_name: "Ada Lovelace",
        api_key: "rk_test_nested_secret_value",
        nested: { email: "nested.pii@example.org" },
      },
      leaks: [
        /Ada Lovelace/,
        /rk_test_nested_secret_value/,
        /nested\.pii@example\.org/,
        /customer_name/,
        /api_key/,
        /"nested"/,
      ],
    },
    {
      label: "nested-array",
      schema_version: ["token_array_leak_xyz", { phone: "+1-555-0100" }],
      leaks: [/token_array_leak_xyz/, /\+1-555-0100/, /phone/],
    },
    {
      label: "unsupported-numeric",
      schema_version: 99,
      leaks: [/\b99\b/, /"99"/, /\(got/, /JSON\.stringify/i],
    },
  ];

  for (const { label, schema_version, leaks } of cases) {
    assert.throws(
      () =>
        parseSanitizedDocument({
          schema_version,
          records: [],
        }),
      (err) => {
        const message = String(err?.message ?? "");
        assert.match(message, /schema_version is invalid or unsupported/);
        assert.doesNotMatch(message, /got /i);
        for (const pattern of leaks) {
          assert.doesNotMatch(message, pattern, `${label} unit message must not leak ${pattern}`);
        }
        return true;
      },
      label
    );

    const io = createIo();
    const tmp = path.join(path.dirname(FIXTURE_PATH), `.bad-schema-${label}-${process.pid}.json`);
    fs.writeFileSync(
      tmp,
      JSON.stringify({
        schema_version,
        records: [
          {
            currency: "usd",
            amount_total: 2900,
            order_type: "digital",
            plan: "single",
          },
        ],
      })
    );
    try {
      const code = runProductContribution({
        argv: ["--input", tmp, "--format", "json"],
        stdout: io.stdout,
        stderr: io.stderr,
        env: {},
      });
      assert.equal(code, 1, `cli exit ${label}`);
      assert.equal(io.getStdout().trim(), "", `empty stdout ${label}`);
      assert.doesNotMatch(io.getStdout(), /estimated_pre_fixed_cost_contribution_cents/);
      assert.doesNotMatch(io.getStdout(), /digital:single/);
      assert.match(io.getStderr(), /schema_version is invalid or unsupported|Product contribution failed/);
      const combined = io.getStdout() + io.getStderr();
      assert.doesNotMatch(combined, /got /i);
      for (const pattern of leaks) {
        assert.doesNotMatch(combined, pattern, `${label} cli must not leak ${pattern}`);
      }
      assert.equal(containsSensitiveOperatorText(combined), false, label);
    } finally {
      fs.unlinkSync(tmp);
    }
  }
});

test("contribution is not gross-revenue-only (negative control on numbers)", () => {
  const feeConfig = getStripeFeeConfig({});
  const digital = estimateRecordContribution(
    { currency: "usd", amount_total: 2900, order_type: "digital", plan: "single" },
    feeConfig,
    {}
  );
  assert.ok(digital.resolved);
  assert.ok(digital.contributionCents < 2900);
  assert.equal(digital.contributionCents, 2900 - estimateStripeFeeCents(2900, feeConfig));

  const print = estimateRecordContribution(
    {
      currency: "usd",
      amount_total: 9900,
      order_type: "print",
      print_variant: "poster_framed",
      shipping_country: "US",
    },
    feeConfig,
    {}
  );
  assert.ok(print.resolved);
  assert.ok(print.productCostCents > 0);
  assert.ok(print.shippingCostCents > 0);
  assert.ok(print.contributionCents < 9900 - print.stripeFeeCents);
});
