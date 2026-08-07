/**
 * Read-only Google Merchant free-listing eligibility diagnosis helpers.
 * Uses fixed Merchant API paths only; no mutations and no secret logging.
 */

export const FREE_LISTINGS_CONTEXT = "FREE_LISTINGS";

export const MERCHANT_DIAGNOSTIC_PATHS = Object.freeze({
  productsList: (accountId) => `products/v1/accounts/${accountId}/products`,
  accountIssuesList: (accountId) => `accounts/v1/accounts/${accountId}/issues`,
  aggregateProductStatusesList: (accountId) =>
    `issueresolution/v1/accounts/${accountId}/aggregateProductStatuses`,
});

const ACCOUNT_ID_IN_PATH = /accounts\/\d+/g;
const SECRETISH_KEYS = new Set([
  "authorization",
  "access_token",
  "accessToken",
  "private_key",
  "privateKey",
  "client_email",
  "clientEmail",
  "refresh_token",
  "refreshToken",
  "id_token",
  "idToken",
  "client_secret",
  "clientSecret",
]);

/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function redactSensitive(value) {
  if (typeof value === "string") {
    return value.replace(ACCOUNT_ID_IN_PATH, "accounts/[redacted]");
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactSensitive(entry));
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (SECRETISH_KEYS.has(key) || /token|secret|private.?key|authorization/i.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactSensitive(entry);
    }
    return out;
  }
  return value;
}

/**
 * @param {string} xml
 * @returns {string[]}
 */
export function extractFeedOfferIds(xml) {
  if (typeof xml !== "string" || !xml) return [];
  const ids = [];
  const regex = /<g:id>([\s\S]*?)<\/g:id>/gi;
  let match = regex.exec(xml);
  while (match) {
    const id = String(match[1] || "")
      .trim()
      .replace(/\s+/g, " ");
    if (id) ids.push(id);
    match = regex.exec(xml);
  }
  return Array.from(new Set(ids));
}

/**
 * @param {unknown} countries
 * @returns {string[]}
 */
function normalizeCountries(countries) {
  if (!Array.isArray(countries)) return [];
  return countries
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => /^[A-Z]{2}$/.test(value));
}

/**
 * @param {object | null | undefined} product
 */
export function summarizeProductFreeListing(product) {
  const offerId = String(product?.offerId || "").trim();
  const title = String(product?.productAttributes?.title || "").trim();
  const destinationStatuses = Array.isArray(product?.productStatus?.destinationStatuses)
    ? product.productStatus.destinationStatuses
    : [];
  const freeListingStatuses = destinationStatuses.filter(
    (status) => String(status?.reportingContext || "") === FREE_LISTINGS_CONTEXT,
  );

  const approvedCountries = [];
  const pendingCountries = [];
  const disapprovedCountries = [];
  for (const status of freeListingStatuses) {
    approvedCountries.push(...normalizeCountries(status.approvedCountries));
    pendingCountries.push(...normalizeCountries(status.pendingCountries));
    disapprovedCountries.push(...normalizeCountries(status.disapprovedCountries));
  }

  const itemLevelIssues = Array.isArray(product?.productStatus?.itemLevelIssues)
    ? product.productStatus.itemLevelIssues
    : [];
  const freeListingIssues = itemLevelIssues
    .filter((issue) => {
      const ctx = String(issue?.reportingContext || "");
      return !ctx || ctx === FREE_LISTINGS_CONTEXT;
    })
    .map((issue) => ({
      code: String(issue?.code || "").trim() || "unknown",
      severity: String(issue?.severity || "SEVERITY_UNSPECIFIED"),
      attribute: String(issue?.attribute || "").trim() || null,
      reportingContext: String(issue?.reportingContext || "").trim() || null,
      description: String(issue?.description || "").trim() || null,
      detail: String(issue?.detail || "").trim() || null,
      documentation: String(issue?.documentation || "").trim() || null,
      applicableCountries: normalizeCountries(issue?.applicableCountries),
      resolution: String(issue?.resolution || "").trim() || null,
    }));

  const hasFreeListingContext = freeListingStatuses.length > 0;
  let freeListingState = "MISSING_CONTEXT";
  if (hasFreeListingContext) {
    if (approvedCountries.length > 0 && disapprovedCountries.length === 0 && pendingCountries.length === 0) {
      freeListingState = "APPROVED";
    } else if (approvedCountries.length > 0) {
      freeListingState = "PARTIAL";
    } else if (pendingCountries.length > 0 && disapprovedCountries.length === 0) {
      freeListingState = "PENDING";
    } else if (disapprovedCountries.length > 0) {
      freeListingState = "DISAPPROVED";
    } else {
      freeListingState = "UNKNOWN";
    }
  }

  return {
    offerId,
    title: title || null,
    freeListingState,
    approvedCountries: Array.from(new Set(approvedCountries)).sort(),
    pendingCountries: Array.from(new Set(pendingCountries)).sort(),
    disapprovedCountries: Array.from(new Set(disapprovedCountries)).sort(),
    issues: freeListingIssues,
  };
}

/**
 * @param {object | null | undefined} issue
 */
export function summarizeAccountIssue(issue) {
  const impactedDestinations = Array.isArray(issue?.impactedDestinations)
    ? issue.impactedDestinations.map((destination) => ({
        reportingContext: String(destination?.reportingContext || "").trim() || null,
        impacts: Array.isArray(destination?.impacts)
          ? destination.impacts.map((impact) => ({
              regionCode: String(impact?.regionCode || "").trim() || null,
              severity: String(impact?.severity || "SEVERITY_UNSPECIFIED"),
            }))
          : [],
      }))
    : [];

  const impactsFreeListings = impactedDestinations.some(
    (destination) => destination.reportingContext === FREE_LISTINGS_CONTEXT,
  );

  return {
    id: String(issue?.name || "")
      .replace(ACCOUNT_ID_IN_PATH, "accounts/[redacted]")
      .split("/")
      .pop() || null,
    title: String(issue?.title || "").trim() || null,
    severity: String(issue?.severity || "SEVERITY_UNSPECIFIED"),
    detail: String(issue?.detail || "").trim() || null,
    documentationUri: String(issue?.documentationUri || "").trim() || null,
    impactsFreeListings,
    impactedDestinations,
  };
}

/**
 * @param {object | null | undefined} aggregate
 */
export function summarizeAggregateStatus(aggregate) {
  const stats = aggregate?.statistics || {};
  return {
    reportingContext: String(aggregate?.reportingContext || "").trim() || null,
    countryCode: String(aggregate?.countryCode || "").trim().toUpperCase() || null,
    statistics: {
      approvedCount: Number(stats.approvedCount || 0),
      pendingCount: Number(stats.pendingCount || 0),
      disapprovedCount: Number(stats.disapprovedCount || 0),
    },
    issues: Array.isArray(aggregate?.issues)
      ? aggregate.issues.map((issue) => ({
          issueType: String(issue?.issueType || "").trim() || "unknown",
          severity: String(issue?.severity || "SEVERITY_UNSPECIFIED"),
          numProducts: Number(issue?.numProducts || 0),
          sampleOfferIds: Array.isArray(issue?.sampleProducts)
            ? issue.sampleProducts
                .map((name) => {
                  const parts = String(name || "").split("~");
                  return parts.length ? String(parts[parts.length - 1] || "").trim() : "";
                })
                .filter(Boolean)
            : [],
        }))
      : [],
  };
}

/**
 * @param {{
 *   products?: object[],
 *   accountIssues?: object[],
 *   aggregateStatuses?: object[],
 *   feedOfferIds?: string[],
 * }} input
 */
export function buildEligibilityReport(input = {}) {
  const products = Array.isArray(input.products) ? input.products : [];
  const accountIssues = Array.isArray(input.accountIssues) ? input.accountIssues : [];
  const aggregateStatuses = Array.isArray(input.aggregateStatuses) ? input.aggregateStatuses : [];
  const feedOfferIds = Array.isArray(input.feedOfferIds) ? input.feedOfferIds.filter(Boolean) : [];

  const productSummaries = products.map((product) => summarizeProductFreeListing(product));
  const accountIssueSummaries = accountIssues.map((issue) => summarizeAccountIssue(issue));
  const freeListingAggregates = aggregateStatuses
    .filter((entry) => String(entry?.reportingContext || "") === FREE_LISTINGS_CONTEXT)
    .map((entry) => summarizeAggregateStatus(entry));

  const processedOfferIds = productSummaries.map((product) => product.offerId).filter(Boolean);
  const processedOfferIdSet = new Set(processedOfferIds);
  const missingFromMerchant = feedOfferIds.filter((id) => !processedOfferIdSet.has(id));
  const unexpectedInMerchant = processedOfferIds.filter((id) => feedOfferIds.length && !feedOfferIds.includes(id));

  const approvedProducts = productSummaries.filter((p) => p.freeListingState === "APPROVED");
  const pendingProducts = productSummaries.filter((p) => p.freeListingState === "PENDING");
  const partialProducts = productSummaries.filter((p) => p.freeListingState === "PARTIAL");
  const disapprovedProducts = productSummaries.filter((p) => p.freeListingState === "DISAPPROVED");
  const missingContextProducts = productSummaries.filter((p) => p.freeListingState === "MISSING_CONTEXT");

  const blockingAccountIssues = accountIssueSummaries.filter(
    (issue) =>
      issue.impactsFreeListings &&
      (issue.severity === "CRITICAL" || issue.severity === "ERROR"),
  );
  const criticalAccountIssues = accountIssueSummaries.filter((issue) => issue.severity === "CRITICAL");

  const aggregateApproved = freeListingAggregates.reduce(
    (sum, entry) => sum + (entry.statistics.approvedCount || 0),
    0,
  );
  const aggregatePending = freeListingAggregates.reduce(
    (sum, entry) => sum + (entry.statistics.pendingCount || 0),
    0,
  );
  const aggregateDisapproved = freeListingAggregates.reduce(
    (sum, entry) => sum + (entry.statistics.disapprovedCount || 0),
    0,
  );

  const productIssueCount = productSummaries.reduce((sum, product) => sum + product.issues.length, 0);
  const disapprovedIssueCount = productSummaries.reduce(
    (sum, product) => sum + product.issues.filter((issue) => issue.severity === "DISAPPROVED").length,
    0,
  );

  const blockers = [];
  if (products.length === 0) {
    blockers.push("No processed Merchant products were returned.");
  }
  if (missingFromMerchant.length) {
    blockers.push(
      `Feed SKU(s) missing from processed Merchant products: ${missingFromMerchant.join(", ")}.`,
    );
  }
  if (blockingAccountIssues.length) {
    blockers.push(
      `Account issue(s) impacting free listings: ${blockingAccountIssues
        .map((issue) => issue.title || issue.id || issue.severity)
        .join("; ")}.`,
    );
  }
  if (disapprovedProducts.length && approvedProducts.length === 0 && partialProducts.length === 0) {
    blockers.push("All observed products are disapproved for FREE_LISTINGS.");
  }
  if (
    products.length > 0 &&
    approvedProducts.length === 0 &&
    partialProducts.length === 0 &&
    pendingProducts.length === 0 &&
    aggregateApproved === 0
  ) {
    blockers.push("No products are approved for FREE_LISTINGS in any reporting country.");
  }

  const warnings = [];
  if (pendingProducts.length) {
    warnings.push(`${pendingProducts.length} product(s) pending FREE_LISTINGS approval.`);
  }
  if (partialProducts.length) {
    warnings.push(`${partialProducts.length} product(s) partially approved for FREE_LISTINGS.`);
  }
  if (disapprovedProducts.length && approvedProducts.length > 0) {
    warnings.push(`${disapprovedProducts.length} product(s) disapproved for FREE_LISTINGS.`);
  }
  if (missingContextProducts.length) {
    warnings.push(
      `${missingContextProducts.length} product(s) lack a FREE_LISTINGS destination status.`,
    );
  }
  if (unexpectedInMerchant.length) {
    warnings.push(
      `Processed Merchant offer ID(s) not in local feed: ${unexpectedInMerchant.join(", ")}.`,
    );
  }
  if (aggregatePending > 0) {
    warnings.push(`Aggregate FREE_LISTINGS pending count: ${aggregatePending}.`);
  }
  if (aggregateDisapproved > 0 && approvedProducts.length > 0) {
    warnings.push(`Aggregate FREE_LISTINGS disapproved count: ${aggregateDisapproved}.`);
  }

  let verdict = "PASS";
  if (
    products.length === 0 ||
    (approvedProducts.length === 0 &&
      partialProducts.length === 0 &&
      aggregateApproved === 0) ||
    blockingAccountIssues.length > 0 ||
    (disapprovedProducts.length > 0 &&
      approvedProducts.length === 0 &&
      partialProducts.length === 0 &&
      pendingProducts.length === 0) ||
    (missingFromMerchant.length > 0 && approvedProducts.length === 0)
  ) {
    verdict = "BLOCKED";
  } else if (
    warnings.length > 0 ||
    missingFromMerchant.length > 0 ||
    disapprovedProducts.length > 0 ||
    pendingProducts.length > 0 ||
    partialProducts.length > 0 ||
    criticalAccountIssues.length > 0
  ) {
    verdict = "PARTIAL";
  }

  return {
    generatedAt: new Date().toISOString(),
    verdict,
    counts: {
      processedProducts: products.length,
      feedOfferIds: feedOfferIds.length,
      approvedForFreeListings: approvedProducts.length,
      pendingForFreeListings: pendingProducts.length,
      partialForFreeListings: partialProducts.length,
      disapprovedForFreeListings: disapprovedProducts.length,
      missingFreeListingContext: missingContextProducts.length,
      accountIssues: accountIssueSummaries.length,
      blockingAccountIssues: blockingAccountIssues.length,
      productIssues: productIssueCount,
      disapprovedProductIssues: disapprovedIssueCount,
      aggregateApproved,
      aggregatePending,
      aggregateDisapproved,
    },
    feedCoverage: {
      feedOfferIds,
      presentInMerchant: feedOfferIds.filter((id) => processedOfferIdSet.has(id)),
      missingFromMerchant,
      unexpectedInMerchant,
    },
    products: productSummaries,
    accountIssues: accountIssueSummaries,
    freeListingAggregates,
    blockers,
    warnings,
  };
}

/**
 * @param {object} report
 * @returns {string}
 */
export function formatConsoleSummary(report) {
  const lines = [];
  lines.push(`Free-listing eligibility: ${report.verdict}`);
  lines.push(
    `Processed products: ${report.counts.processedProducts} | approved=${report.counts.approvedForFreeListings} pending=${report.counts.pendingForFreeListings} partial=${report.counts.partialForFreeListings} disapproved=${report.counts.disapprovedForFreeListings}`,
  );
  if (report.counts.feedOfferIds > 0) {
    lines.push(
      `Feed SKU coverage: ${report.feedCoverage.presentInMerchant.length}/${report.counts.feedOfferIds} present in Merchant` +
        (report.feedCoverage.missingFromMerchant.length
          ? ` (missing: ${report.feedCoverage.missingFromMerchant.join(", ")})`
          : ""),
    );
  }
  if (report.freeListingAggregates.length) {
    for (const aggregate of report.freeListingAggregates) {
      lines.push(
        `Aggregate FREE_LISTINGS ${aggregate.countryCode || "?"}: approved=${aggregate.statistics.approvedCount} pending=${aggregate.statistics.pendingCount} disapproved=${aggregate.statistics.disapprovedCount}`,
      );
    }
  }
  if (report.accountIssues.length) {
    lines.push(`Account issues: ${report.accountIssues.length} (blocking free listings: ${report.counts.blockingAccountIssues})`);
    for (const issue of report.accountIssues.slice(0, 10)) {
      lines.push(
        `- [${issue.severity}] ${issue.title || issue.id || "account issue"}` +
          (issue.impactsFreeListings ? " (impacts FREE_LISTINGS)" : ""),
      );
      if (issue.documentationUri) lines.push(`  docs: ${issue.documentationUri}`);
    }
  } else {
    lines.push("Account issues: none reported");
  }

  const issueProducts = report.products.filter((product) => product.issues.length > 0);
  if (issueProducts.length) {
    lines.push(`Product issues (${issueProducts.length} product(s)):`);
    for (const product of issueProducts.slice(0, 20)) {
      lines.push(`- ${product.offerId || "(unknown offer)"} [${product.freeListingState}]`);
      for (const issue of product.issues.slice(0, 5)) {
        lines.push(
          `  • [${issue.severity}] ${issue.code}` +
            (issue.applicableCountries.length ? ` countries=${issue.applicableCountries.join(",")}` : "") +
            (issue.documentation ? ` docs=${issue.documentation}` : ""),
        );
      }
    }
  }

  if (report.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  if (report.warnings.length) {
    lines.push("Warnings:");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }
  return lines.join("\n");
}

/**
 * @param {(path: string, options?: object) => Promise<object>} requestFn
 * @param {string} pathPrefix
 * @param {string} itemsKey
 * @param {{ pageSize?: number, query?: Record<string, string> }} [options]
 */
export async function listAllPages(requestFn, pathPrefix, itemsKey, options = {}) {
  const pageSize = options.pageSize ?? 250;
  const query = options.query || {};
  const items = [];
  let pageToken = "";
  let pages = 0;
  const maxPages = 100;

  do {
    const params = new URLSearchParams({ pageSize: String(pageSize), ...query });
    if (pageToken) params.set("pageToken", pageToken);
    const path = `${pathPrefix}?${params.toString()}`;
    const response = await requestFn(path, { method: "GET" });
    pages += 1;
    const batch = Array.isArray(response?.[itemsKey]) ? response[itemsKey] : [];
    items.push(...batch);
    pageToken = String(response?.nextPageToken || "");
  } while (pageToken && pages < maxPages);

  return items;
}

/**
 * @param {(path: string, options?: object) => Promise<object>} requestFn
 * @param {string} accountId
 */
export async function fetchProcessedProducts(requestFn, accountId) {
  return listAllPages(requestFn, MERCHANT_DIAGNOSTIC_PATHS.productsList(accountId), "products", {
    pageSize: 250,
  });
}

/**
 * @param {(path: string, options?: object) => Promise<object>} requestFn
 * @param {string} accountId
 */
export async function fetchAccountIssues(requestFn, accountId) {
  return listAllPages(
    requestFn,
    MERCHANT_DIAGNOSTIC_PATHS.accountIssuesList(accountId),
    "accountIssues",
    { pageSize: 100 },
  );
}

/**
 * @param {(path: string, options?: object) => Promise<object>} requestFn
 * @param {string} accountId
 */
export async function fetchFreeListingAggregateStatuses(requestFn, accountId) {
  return listAllPages(
    requestFn,
    MERCHANT_DIAGNOSTIC_PATHS.aggregateProductStatusesList(accountId),
    "aggregateProductStatuses",
    {
      pageSize: 250,
      query: { filter: 'reportingContext = "FREE_LISTINGS"' },
    },
  );
}

/**
 * @param {{
 *   requestFn: (path: string, options?: object) => Promise<object>,
 *   accountId: string,
 *   feedXml?: string,
 *   includeAggregate?: boolean,
 * }} options
 */
export async function diagnoseFreeListingEligibility(options) {
  const { requestFn, accountId, feedXml = "", includeAggregate = true } = options;
  if (!accountId || !/^\d+$/.test(String(accountId))) {
    throw new Error("Merchant account id is required and must be numeric");
  }
  if (typeof requestFn !== "function") {
    throw new Error("requestFn is required");
  }

  const [products, accountIssues, aggregateStatuses] = await Promise.all([
    fetchProcessedProducts(requestFn, accountId),
    fetchAccountIssues(requestFn, accountId),
    includeAggregate
      ? fetchFreeListingAggregateStatuses(requestFn, accountId).catch((error) => {
          // Aggregate endpoint is helpful but optional if unavailable for the account.
          if (error && typeof error === "object" && "status" in error && Number(error.status) === 404) {
            return [];
          }
          throw error;
        })
      : Promise.resolve([]),
  ]);

  const report = buildEligibilityReport({
    products,
    accountIssues,
    aggregateStatuses,
    feedOfferIds: extractFeedOfferIds(feedXml),
  });

  return redactSensitive(report);
}

export function credentialsSetupMessage() {
  return [
    "SKIP: Merchant free-listing diagnosis requires service-account credentials.",
    "Set one of:",
    "- GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH=/absolute/path/to/service-account.json",
    "- GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json",
    "- GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON=<inline JSON> (not recommended in shells)",
    "Also set GOOGLE_MERCHANT_ACCOUNT_ID=<numeric account id>.",
    "See docs/merchant-api-setup.md. No status was invented.",
  ].join("\n");
}
