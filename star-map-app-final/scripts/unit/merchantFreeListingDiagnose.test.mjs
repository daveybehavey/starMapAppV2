import assert from "node:assert/strict";
import test from "node:test";
import {
  buildEligibilityReport,
  credentialsSetupMessage,
  diagnoseFreeListingEligibility,
  extractFeedOfferIds,
  formatConsoleSummary,
  listAllPages,
  redactSensitive,
  summarizeAccountIssue,
  summarizeAggregateStatus,
  summarizeProductFreeListing,
} from "../merchant-free-listing-diagnose-lib.mjs";
import { hasMerchantServiceAccountConfigured } from "../merchant-api.mjs";

const FEED_XML = `<?xml version="1.0"?><rss><channel>
<item><g:id>print_poster_unframed</g:id><g:title>Unframed</g:title></item>
<item><g:id>print_poster_framed</g:id><g:title>Framed</g:title></item>
</channel></rss>`;

function approvedProduct(offerId, title = offerId) {
  return {
    offerId,
    productAttributes: { title },
    productStatus: {
      destinationStatuses: [
        {
          reportingContext: "FREE_LISTINGS",
          approvedCountries: ["US"],
        },
      ],
      itemLevelIssues: [],
    },
  };
}

function disapprovedProduct(offerId) {
  return {
    offerId,
    productAttributes: { title: offerId },
    productStatus: {
      destinationStatuses: [
        {
          reportingContext: "FREE_LISTINGS",
          disapprovedCountries: ["US"],
        },
      ],
      itemLevelIssues: [
        {
          code: "missing_image",
          severity: "DISAPPROVED",
          reportingContext: "FREE_LISTINGS",
          description: "Missing image",
          documentation: "https://support.google.com/merchants/answer/6324350",
          applicableCountries: ["US"],
        },
      ],
    },
  };
}

function officialAggregateStatus(overrides = {}) {
  return {
    name: "accounts/123/aggregateProductStatuses/FREE_LISTINGS~US",
    reportingContext: "FREE_LISTINGS",
    country: "US",
    stats: {
      activeCount: "2",
      pendingCount: "0",
      disapprovedCount: "0",
      expiringCount: "0",
    },
    itemLevelIssues: [],
    ...overrides,
  };
}

test("extractFeedOfferIds reads unique g:id values", () => {
  assert.deepEqual(extractFeedOfferIds(FEED_XML), [
    "print_poster_unframed",
    "print_poster_framed",
  ]);
});

test("redactSensitive strips account ids and secret-like keys", () => {
  const redacted = redactSensitive({
    name: "accounts/5702040685/products/en~US~sku",
    authorization: "Bearer secret-token",
    private_key: "-----BEGIN PRIVATE KEY-----",
    nested: { access_token: "abc", ok: "fine" },
  });
  assert.equal(redacted.name, "accounts/[redacted]/products/en~US~sku");
  assert.equal(redacted.authorization, "[redacted]");
  assert.equal(redacted.private_key, "[redacted]");
  assert.equal(redacted.nested.access_token, "[redacted]");
  assert.equal(redacted.nested.ok, "fine");
});

test("summarizeProductFreeListing reports approved destination", () => {
  const summary = summarizeProductFreeListing(approvedProduct("print_poster_unframed", "Unframed"));
  assert.equal(summary.freeListingState, "APPROVED");
  assert.deepEqual(summary.approvedCountries, ["US"]);
  assert.equal(summary.issues.length, 0);
});

test("summarizeProductFreeListing reports disapproved issue details", () => {
  const summary = summarizeProductFreeListing(disapprovedProduct("print_poster_framed"));
  assert.equal(summary.freeListingState, "DISAPPROVED");
  assert.equal(summary.issues[0].code, "missing_image");
  assert.equal(summary.issues[0].severity, "DISAPPROVED");
  assert.equal(summary.issues[0].documentation, "https://support.google.com/merchants/answer/6324350");
  assert.deepEqual(summary.issues[0].applicableCountries, ["US"]);
});

test("summarizeAggregateStatus reads official country/stats/itemLevelIssues fields", () => {
  const summarized = summarizeAggregateStatus(
    officialAggregateStatus({
      stats: {
        activeCount: "10",
        pendingCount: "2",
        disapprovedCount: "3",
        expiringCount: "1",
      },
      itemLevelIssues: [
        {
          code: "missing_image",
          severity: "DISAPPROVED",
          documentationUri: "https://support.google.com/merchants/answer/6324350",
          productCount: "3",
        },
      ],
    }),
  );
  assert.equal(summarized.country, "US");
  assert.equal(summarized.stats.activeCount, 10);
  assert.equal(summarized.stats.pendingCount, 2);
  assert.equal(summarized.stats.disapprovedCount, 3);
  assert.equal(summarized.stats.expiringCount, 1);
  assert.equal(summarized.itemLevelIssues.length, 1);
  assert.equal(summarized.itemLevelIssues[0].code, "missing_image");
  assert.equal(summarized.itemLevelIssues[0].documentationUri, "https://support.google.com/merchants/answer/6324350");
  // Legacy/incorrect field names must not be treated as present.
  assert.equal(summarized.countryCode, undefined);
  assert.equal(summarized.statistics, undefined);
  assert.equal(summarized.issues, undefined);
});

test("summarizeAggregateStatus does not invent values from legacy countryCode/statistics/issues", () => {
  const summarized = summarizeAggregateStatus({
    reportingContext: "FREE_LISTINGS",
    countryCode: "US",
    statistics: { approvedCount: "99", pendingCount: "5", disapprovedCount: "7" },
    issues: [{ issueType: "missing_image", severity: "ERROR", numProducts: "7" }],
  });
  assert.equal(summarized.country, null);
  assert.equal(summarized.stats.activeCount, 0);
  assert.equal(summarized.stats.pendingCount, 0);
  assert.equal(summarized.stats.disapprovedCount, 0);
  assert.deepEqual(summarized.itemLevelIssues, []);
});

test("buildEligibilityReport PASS when feed SKUs approved and no blockers", () => {
  const report = buildEligibilityReport({
    products: [
      approvedProduct("print_poster_unframed"),
      approvedProduct("print_poster_framed"),
    ],
    accountIssues: [],
    aggregateStatuses: [officialAggregateStatus()],
    feedOfferIds: ["print_poster_unframed", "print_poster_framed"],
  });
  assert.equal(report.verdict, "PASS");
  assert.equal(report.counts.processedProducts, 2);
  assert.equal(report.counts.approvedForFreeListings, 2);
  assert.equal(report.counts.aggregateActive, 2);
  assert.deepEqual(report.feedCoverage.missingFromMerchant, []);
  assert.match(formatConsoleSummary(report), /active=2/);
});

test("buildEligibilityReport BLOCKED when products disapproved", () => {
  const report = buildEligibilityReport({
    products: [disapprovedProduct("print_poster_unframed")],
    accountIssues: [],
    aggregateStatuses: [],
    feedOfferIds: ["print_poster_unframed"],
  });
  assert.equal(report.verdict, "BLOCKED");
  assert.ok(report.blockers.some((line) => /disapproved/i.test(line)));
  assert.match(formatConsoleSummary(report), /BLOCKED/);
});

test("buildEligibilityReport BLOCKED on critical free-listing account issue", () => {
  const report = buildEligibilityReport({
    products: [approvedProduct("print_poster_unframed")],
    accountIssues: [
      {
        name: "accounts/5702040685/issues/website-claimed",
        title: "Website not claimed",
        severity: "CRITICAL",
        detail: "Claim your website",
        documentationUri: "https://support.google.com/merchants/answer/176793",
        impactedDestinations: [
          {
            reportingContext: "FREE_LISTINGS",
            impacts: [{ regionCode: "US", severity: "CRITICAL" }],
          },
        ],
      },
    ],
    feedOfferIds: ["print_poster_unframed"],
  });
  assert.equal(report.verdict, "BLOCKED");
  assert.equal(report.counts.blockingAccountIssues, 1);
  assert.equal(report.accountIssues[0].id, "website-claimed");
  assert.ok(!JSON.stringify(report).includes("5702040685"));
});

test("buildEligibilityReport PARTIAL when some feed SKUs missing but others approved", () => {
  const report = buildEligibilityReport({
    products: [approvedProduct("print_poster_unframed")],
    accountIssues: [],
    aggregateStatuses: [],
    feedOfferIds: ["print_poster_unframed", "print_poster_framed"],
  });
  assert.equal(report.verdict, "PARTIAL");
  assert.deepEqual(report.feedCoverage.missingFromMerchant, ["print_poster_framed"]);
});

test("stale approved Merchant product must not mask current-feed disapproval as PARTIAL", () => {
  const report = buildEligibilityReport({
    products: [
      approvedProduct("legacy_stale_sku"),
      disapprovedProduct("print_poster_unframed"),
      disapprovedProduct("print_poster_framed"),
    ],
    accountIssues: [],
    aggregateStatuses: [
      officialAggregateStatus({
        stats: { activeCount: "1", pendingCount: "0", disapprovedCount: "2", expiringCount: "0" },
      }),
    ],
    feedOfferIds: ["print_poster_unframed", "print_poster_framed"],
  });
  assert.equal(report.verdict, "BLOCKED");
  assert.equal(report.counts.approvedForFreeListings, 0);
  assert.equal(report.counts.disapprovedForFreeListings, 2);
  assert.equal(report.counts.unexpectedProducts, 1);
  assert.deepEqual(
    report.unexpectedProducts.map((product) => product.offerId),
    ["legacy_stale_sku"],
  );
  assert.ok(
    report.reportOnlyWarnings.some((line) => /excluded from eligibility/i.test(line)),
    "unexpected products should be reported separately",
  );
  assert.ok(!report.products.some((product) => product.offerId === "legacy_stale_sku"));
});

test("all current-feed approved with stale Merchant product remains PASS with report-only warning", () => {
  const report = buildEligibilityReport({
    products: [
      approvedProduct("print_poster_unframed"),
      approvedProduct("print_poster_framed"),
      approvedProduct("legacy_stale_sku"),
    ],
    accountIssues: [],
    aggregateStatuses: [
      officialAggregateStatus({
        stats: { activeCount: "3", pendingCount: "1", disapprovedCount: "1", expiringCount: "0" },
        itemLevelIssues: [
          {
            code: "legacy_policy",
            severity: "DISAPPROVED",
            productCount: "1",
            documentationUri: "https://support.google.com/merchants/answer/1",
          },
        ],
      }),
    ],
    feedOfferIds: ["print_poster_unframed", "print_poster_framed"],
  });
  assert.equal(report.verdict, "PASS");
  assert.equal(report.counts.approvedForFreeListings, 2);
  assert.equal(report.counts.eligibilityWarnings, 0);
  assert.ok(report.reportOnlyWarnings.length >= 1);
  assert.ok(
    report.reportOnlyWarnings.some((line) => /legacy_stale_sku/.test(line)),
    "stale offer remains visible as report-only",
  );
  assert.ok(report.reportOnlyWarnings.some((line) => /Aggregate FREE_LISTINGS pending/i.test(line)));
  assert.ok(report.reportOnlyWarnings.some((line) => /Aggregate FREE_LISTINGS disapproved/i.test(line)));
  assert.match(formatConsoleSummary(report), /Report-only notes/);
  assert.doesNotMatch(formatConsoleSummary(report), /Eligibility warnings:/);
});

test("genuine current-feed gap still downgrades to PARTIAL", () => {
  const report = buildEligibilityReport({
    products: [
      approvedProduct("print_poster_unframed"),
      approvedProduct("legacy_stale_sku"),
    ],
    accountIssues: [],
    aggregateStatuses: [],
    feedOfferIds: ["print_poster_unframed", "print_poster_framed"],
  });
  assert.equal(report.verdict, "PARTIAL");
  assert.ok(report.eligibilityWarnings.some((line) => /print_poster_framed/.test(line)));
  assert.ok(report.reportOnlyWarnings.some((line) => /legacy_stale_sku/.test(line)));
});

test("genuine free-listing account issue still downgrades to BLOCKED", () => {
  const report = buildEligibilityReport({
    products: [
      approvedProduct("print_poster_unframed"),
      approvedProduct("print_poster_framed"),
      approvedProduct("legacy_stale_sku"),
    ],
    accountIssues: [
      {
        name: "accounts/5702040685/issues/misrepresentation",
        title: "Misrepresentation",
        severity: "ERROR",
        impactedDestinations: [{ reportingContext: "FREE_LISTINGS", impacts: [] }],
      },
    ],
    aggregateStatuses: [],
    feedOfferIds: ["print_poster_unframed", "print_poster_framed"],
  });
  assert.equal(report.verdict, "BLOCKED");
  assert.equal(report.counts.blockingAccountIssues, 1);
  assert.ok(report.reportOnlyWarnings.some((line) => /legacy_stale_sku/.test(line)));
});

test("listAllPages follows nextPageToken", async () => {
  const calls = [];
  const requestFn = async (path) => {
    calls.push(path);
    if (calls.length === 1) {
      assert.match(path, /pageSize=2/);
      return {
        products: [{ offerId: "a" }],
        nextPageToken: "page-2",
      };
    }
    assert.match(path, /pageToken=page-2/);
    return {
      products: [{ offerId: "b" }],
    };
  };

  const products = await listAllPages(requestFn, "products/v1/accounts/1/products", "products", {
    pageSize: 2,
  });
  assert.deepEqual(
    products.map((p) => p.offerId),
    ["a", "b"],
  );
  assert.equal(calls.length, 2);
  assert.ok(calls.every((path) => path.startsWith("products/v1/accounts/1/products?")));
});

test("aggregate filter uses reporting_context not reportingContext", async () => {
  const seen = [];
  const requestFn = async (path, options = {}) => {
    seen.push({ path, method: options.method || "GET" });
    if (path.startsWith("products/v1/")) {
      return {
        products: [
          approvedProduct("print_poster_unframed"),
          approvedProduct("print_poster_framed"),
        ],
      };
    }
    if (path.includes("/issues")) {
      return { accountIssues: [] };
    }
    if (path.includes("aggregateProductStatuses")) {
      const query = new URLSearchParams(path.split("?")[1] || "");
      const filter = query.get("filter") || "";
      assert.match(filter, /reporting_context\s*=\s*"FREE_LISTINGS"/);
      assert.doesNotMatch(filter, /reportingContext/);
      return { aggregateProductStatuses: [officialAggregateStatus()] };
    }
    throw new Error(`Unexpected path: ${path}`);
  };

  const report = await diagnoseFreeListingEligibility({
    requestFn,
    accountId: "123456",
    feedXml: FEED_XML,
  });
  assert.equal(report.verdict, "PASS");
  assert.ok(
    seen.some((entry) =>
      entry.path.startsWith("issueresolution/v1/accounts/123456/aggregateProductStatuses?"),
    ),
  );
});

test("diagnoseFreeListingEligibility uses fixed GET paths only", async () => {
  const seen = [];
  const requestFn = async (path, options = {}) => {
    seen.push({ path, method: options.method || "GET" });
    if (path.startsWith("products/v1/")) {
      return {
        products: [
          approvedProduct("print_poster_unframed"),
          approvedProduct("print_poster_framed"),
        ],
      };
    }
    if (path.includes("/issues")) {
      return { accountIssues: [] };
    }
    if (path.includes("aggregateProductStatuses")) {
      assert.match(path, /filter=/);
      return {
        aggregateProductStatuses: [officialAggregateStatus()],
      };
    }
    throw new Error(`Unexpected path: ${path}`);
  };

  const report = await diagnoseFreeListingEligibility({
    requestFn,
    accountId: "123456",
    feedXml: FEED_XML,
  });

  assert.equal(report.verdict, "PASS");
  assert.ok(seen.every((entry) => entry.method === "GET"));
  assert.ok(seen.some((entry) => entry.path.startsWith("products/v1/accounts/123456/products?")));
  assert.ok(seen.some((entry) => entry.path.startsWith("accounts/v1/accounts/123456/issues?")));
  assert.ok(
    seen.some((entry) =>
      entry.path.startsWith("issueresolution/v1/accounts/123456/aggregateProductStatuses?"),
    ),
  );
  assert.ok(!JSON.stringify(report).includes("Bearer"));
});

test("credentialsSetupMessage does not invent status and mentions setup", () => {
  const message = credentialsSetupMessage();
  assert.match(message, /^SKIP:/);
  assert.match(message, /GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH/);
  assert.match(message, /No status was invented/);
  assert.doesNotMatch(message, /PASS|BLOCKED|approved/i);
});

test("hasMerchantServiceAccountConfigured is false without env", () => {
  const previous = {
    GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON,
    GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH: process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH,
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  };
  try {
    delete process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON;
    delete process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    assert.equal(hasMerchantServiceAccountConfigured(), false);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("summarizeAccountIssue flags free-listing impact and redacts account id in name", () => {
  const summarized = summarizeAccountIssue({
    name: "accounts/999/issues/misrepresentation",
    title: "Policy issue",
    severity: "ERROR",
    impactedDestinations: [{ reportingContext: "FREE_LISTINGS", impacts: [] }],
  });
  assert.equal(summarized.impactsFreeListings, true);
  assert.equal(summarized.id, "misrepresentation");
});
