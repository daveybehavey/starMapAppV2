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
  getConfiguredVsPublicCatalogBaseDeltas,
  getStripeFeeConfig,
} from "../lib/commerceCostEstimates.mjs";
import {
  PRODUCT_CONTRIBUTION_CONTRACT,
  SENSITIVE_RECORD_FIELDS,
  assertAggregateOnly,
  assertScriptIsNotNoOp,
  buildProductContributionReport,
  classifyProductGroup,
  containsSensitiveOperatorText,
  estimateRecordContribution,
  formatJsonReport,
  formatTableReport,
  parseArgs,
  parseSanitizedDocument,
  runProductContribution,
  sanitizeRecord,
} from "../product-contribution.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../product-contribution.mjs", import.meta.url));
const FIXTURE_PATH = fileURLToPath(
  new URL("./fixtures/product-contribution/synthetic-paid-sessions.json", import.meta.url),
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

  const grossOnly = path.join(
    path.dirname(SCRIPT_PATH),
    `.product-contribution-gross-${process.pid}.mjs`,
  );
  fs.writeFileSync(
    grossOnly,
    `
export const estimated_pre_fixed_cost_contribution_cents = true;
export function estimateStripeFeeCents() { return 0; }
--input
collected_revenue_cents only
`,
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
      `defaultCogsCents drift for ${variant}`,
    );
    assert.ok(
      source.includes(`shippingProfile: "${row.shippingProfile}"`),
      `shippingProfile drift for ${variant}`,
    );
    assert.ok(
      source.includes(`printfulVariantId: ${row.printfulVariantId}`),
      `printfulVariantId drift for ${variant}`,
    );
    assert.equal(getConfiguredProductCostCents(variant, {}), row.defaultCogsCents);
  }
});

test("public catalog base reference is offline footnote only and stays above/at catalog for defaults", () => {
  const deltas = getConfiguredVsPublicCatalogBaseDeltas({});
  assert.equal(deltas.used_in_contribution_math, false);
  assert.equal(deltas.currency, "USD");
  assert.ok(deltas.rows.length >= 5);

  const byVariant = Object.fromEntries(deltas.rows.map((row) => [row.print_variant, row]));
  assert.equal(byVariant.poster_unframed.public_catalog_base_cents, 1239);
  assert.equal(byVariant.poster_framed.public_catalog_base_cents, 3315);
  assert.equal(byVariant.canvas_wrap.public_catalog_base_cents, 1372);
  assert.equal(byVariant.mug_11oz.public_catalog_base_cents, 795);
  assert.equal(byVariant.card_4x6.public_catalog_base_cents, 250);

  for (const row of deltas.rows) {
    assert.ok(
      row.configured_cogs_cents >= row.public_catalog_base_cents,
      `${row.print_variant} configured COGS should not undercut public catalog base snapshot`,
    );
  }

  const report = buildProductContributionReport([], { env: {} });
  assert.equal(report.public_catalog_base_reference.used_in_contribution_math, false);
  assert.equal(report.public_catalog_base_reference.rows.length, deltas.rows.length);
  // Contribution math still uses configured estimates — reference must not replace fees/COGS
  assert.equal(report.disclaimer.product_cogs, "configured_estimate");
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
    "print:poster_unframed",
  );
  assert.equal(
    classifyProductGroup({
      order_type: "print",
      print_variant: "poster_framed",
      include_digital: true,
    }).groupKey,
    "print:poster_framed+digital",
  );
  assert.equal(
    classifyProductGroup({
      order_type: "print",
      print_variant: "poster_framed",
      include_card: true,
    }).groupKey,
    "print:poster_framed+card",
  );
  assert.equal(
    classifyProductGroup({ order_type: "print", print_variant: "mystery_sku" }).groupKey,
    "unknown",
  );
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

test("mixed currencies produce separate sections and are never summed together", () => {
  const records = [
    { currency: "usd", amount_total: 1000, order_type: "digital", plan: "single" },
    { currency: "eur", amount_total: 2000, order_type: "digital", plan: "single" },
    { currency: "usd", amount_total: 3000, order_type: "digital", plan: "single" },
  ];
  const report = buildProductContributionReport(records, { env: {} });
  assert.deepEqual(
    report.currency_sections.map((s) => s.currency),
    ["eur", "usd"],
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
    {},
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
    { env: {} },
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
    {},
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
    {},
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
    /non-negative/,
  );
  assert.throws(
    () => sanitizeRecord({ currency: "usd", amount_total: 10.5, order_type: "digital", plan: "single" }, 0),
    /integer/,
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
        0,
      ),
    /integer/,
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
        0,
      ),
    /non-negative/,
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
          0,
        ),
      /sensitive|row-identifying/,
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
        0,
      ),
    /cannot include print_variant/,
  );
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

test("contribution is not gross-revenue-only (negative control on numbers)", () => {
  const feeConfig = getStripeFeeConfig({});
  const digital = estimateRecordContribution(
    { currency: "usd", amount_total: 2900, order_type: "digital", plan: "single" },
    feeConfig,
    {},
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
    {},
  );
  assert.ok(print.resolved);
  assert.ok(print.productCostCents > 0);
  assert.ok(print.shippingCostCents > 0);
  assert.ok(print.contributionCents < 9900 - print.stripeFeeCents);
});
