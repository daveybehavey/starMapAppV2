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
 * Official AggregateProductStatus fields (issueresolution/v1):
 * reportingContext, country, stats.{activeCount,pendingCount,disapprovedCount,expiringCount},
 * itemLevelIssues[].
 * @param {object | null | undefined} aggregate
 */
export function summarizeAggregateStatus(aggregate) {
  const stats = aggregate?.stats || {};
  const country = String(aggregate?.country || "").trim().toUpperCase();
  return {
    reportingContext: String(aggregate?.reportingContext || "").trim() || null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    stats: {
      activeCount: Number(stats.activeCount || 0),
      pendingCount: Number(stats.pendingCount || 0),
      disapprovedCount: Number(stats.disapprovedCount || 0),
      expiringCount: Number(stats.expiringCount || 0),
    },
    itemLevelIssues: Array.isArray(aggregate?.itemLevelIssues)
      ? aggregate.itemLevelIssues.map((issue) => ({
          code: String(issue?.code || "").trim() || "unknown",
          severity: String(issue?.severity || "SEVERITY_UNSPECIFIED"),
          resolution: String(issue?.resolution || "").trim() || null,
          attribute: String(issue?.attribute || "").trim() || null,
          description: String(issue?.description || "").trim() || null,
          detail: String(issue?.detail || "").trim() || null,
          documentationUri: String(issue?.documentationUri || "").trim() || null,
          productCount: Number(issue?.productCount || 0),
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
  const feedScoped = feedOfferIds.length > 0;
  const feedOfferIdSet = new Set(feedOfferIds);

  const productSummaries = products.map((product) => summarizeProductFreeListing(product));
  const accountIssueSummaries = accountIssues.map((issue) => summarizeAccountIssue(issue));
  const freeListingAggregates = aggregateStatuses
    .filter((entry) => String(entry?.reportingContext || "") === FREE_LISTINGS_CONTEXT)
    .map((entry) => summarizeAggregateStatus(entry));

  const processedOfferIds = productSummaries.map((product) => product.offerId).filter(Boolean);
  const processedOfferIdSet = new Set(processedOfferIds);
  const missingFromMerchant = feedOfferIds.filter((id) => !processedOfferIdSet.has(id));
  const unexpectedInMerchant = processedOfferIds.filter((id) => feedScoped && !feedOfferIdSet.has(id));

  // Eligibility verdicts are scoped to current local feed offer IDs when available.
  // Stale/unexpected Merchant products are reported separately and must not dilute feed blockers.
  const eligibilityProducts = feedScoped
    ? productSummaries.filter((product) => feedOfferIdSet.has(product.offerId))
    : productSummaries;
  const unexpectedProducts = feedScoped
    ? productSummaries.filter((product) => product.offerId && !feedOfferIdSet.has(product.offerId))
    : [];

  const approvedProducts = eligibilityProducts.filter((p) => p.freeListingState === "APPROVED");
  const pendingProducts = eligibilityProducts.filter((p) => p.freeListingState === "PENDING");
  const partialProducts = eligibilityProducts.filter((p) => p.freeListingState === "PARTIAL");
  const disapprovedProducts = eligibilityProducts.filter((p) => p.freeListingState === "DISAPPROVED");
  const missingContextProducts = eligibilityProducts.filter((p) => p.freeListingState === "MISSING_CONTEXT");
  const unknownProducts = eligibilityProducts.filter((p) => p.freeListingState === "UNKNOWN");

  const blockingAccountIssues = accountIssueSummaries.filter(
    (issue) =>
      issue.impactsFreeListings &&
      (issue.severity === "CRITICAL" || issue.severity === "ERROR"),
  );

  const aggregateActive = freeListingAggregates.reduce(
    (sum, entry) => sum + (entry.stats.activeCount || 0),
    0,
  );
  const aggregatePending = freeListingAggregates.reduce(
    (sum, entry) => sum + (entry.stats.pendingCount || 0),
    0,
  );
  const aggregateDisapproved = freeListingAggregates.reduce(
    (sum, entry) => sum + (entry.stats.disapprovedCount || 0),
    0,
  );
  const aggregateItemLevelIssues = freeListingAggregates.flatMap((entry) =>
    entry.itemLevelIssues.map((issue) => ({
      ...issue,
      country: entry.country,
    })),
  );

  const productIssueCount = eligibilityProducts.reduce((sum, product) => sum + product.issues.length, 0);
  const disapprovedIssueCount = eligibilityProducts.reduce(
    (sum, product) => sum + product.issues.filter((issue) => issue.severity === "DISAPPROVED").length,
    0,
  );

  const feedHasNoEligiblePresence =
    feedScoped && eligibilityProducts.length === 0 && missingFromMerchant.length === feedOfferIds.length;

  const blockers = [];
  if (products.length === 0) {
    blockers.push("No processed Merchant products were returned.");
  }
  if (feedHasNoEligiblePresence || (missingFromMerchant.length && approvedProducts.length === 0 && partialProducts.length === 0)) {
    blockers.push(
      `Feed SKU(s) missing from processed Merchant products: ${missingFromMerchant.join(", ") || feedOfferIds.join(", ")}.`,
    );
  } else if (missingFromMerchant.length) {
    // Covered as PARTIAL warning below when some feed SKUs remain approved.
  }
  if (blockingAccountIssues.length) {
    blockers.push(
      `Account issue(s) impacting free listings: ${blockingAccountIssues
        .map((issue) => issue.title || issue.id || issue.severity)
        .join("; ")}.`,
    );
  }
  if (
    eligibilityProducts.length > 0 &&
    disapprovedProducts.length > 0 &&
    approvedProducts.length === 0 &&
    partialProducts.length === 0
  ) {
    blockers.push(
      feedScoped
        ? "All current feed products are disapproved for FREE_LISTINGS."
        : "All observed products are disapproved for FREE_LISTINGS.",
    );
  }
  if (
    (eligibilityProducts.length > 0 || feedHasNoEligiblePresence) &&
    approvedProducts.length === 0 &&
    partialProducts.length === 0 &&
    pendingProducts.length === 0
  ) {
    // Do not let account-wide aggregate activeCount mask current-feed disapproval/absence.
    blockers.push(
      feedScoped
        ? "No current feed products are approved for FREE_LISTINGS."
        : "No products are approved for FREE_LISTINGS in any reporting country.",
    );
  }

  const eligibilityWarnings = [];
  const reportOnlyWarnings = [];

  if (missingFromMerchant.length && approvedProducts.length > 0) {
    eligibilityWarnings.push(
      `Feed SKU(s) missing from processed Merchant products: ${missingFromMerchant.join(", ")}.`,
    );
  }
  if (pendingProducts.length) {
    eligibilityWarnings.push(
      `${pendingProducts.length} current-feed product(s) pending FREE_LISTINGS approval.`,
    );
  }
  if (partialProducts.length) {
    eligibilityWarnings.push(
      `${partialProducts.length} current-feed product(s) partially approved for FREE_LISTINGS.`,
    );
  }
  if (disapprovedProducts.length && approvedProducts.length > 0) {
    eligibilityWarnings.push(
      `${disapprovedProducts.length} current-feed product(s) disapproved for FREE_LISTINGS.`,
    );
  }
  if (missingContextProducts.length) {
    eligibilityWarnings.push(
      `${missingContextProducts.length} current-feed product(s) lack a FREE_LISTINGS destination status.`,
    );
  }
  if (unknownProducts.length) {
    eligibilityWarnings.push(
      `${unknownProducts.length} current-feed product(s) have unresolved FREE_LISTINGS status (no approved/pending/disapproved countries).`,
    );
  }

  // Stale/unexpected Merchant products and account-wide aggregates are report-only:
  // they remain visible but must not downgrade an otherwise fully-approved current-feed PASS.
  if (unexpectedInMerchant.length) {
    reportOnlyWarnings.push(
      `Processed Merchant offer ID(s) not in local feed (excluded from eligibility verdict): ${unexpectedInMerchant.join(", ")}.`,
    );
  }
  if (aggregatePending > 0) {
    reportOnlyWarnings.push(`Aggregate FREE_LISTINGS pending count: ${aggregatePending}.`);
  }
  if (aggregateDisapproved > 0) {
    reportOnlyWarnings.push(`Aggregate FREE_LISTINGS disapproved count: ${aggregateDisapproved}.`);
  }
  if (aggregateItemLevelIssues.length) {
    reportOnlyWarnings.push(
      `Aggregate FREE_LISTINGS item-level issue types: ${Array.from(
        new Set(aggregateItemLevelIssues.map((issue) => issue.code)),
      ).join(", ")}.`,
    );
  }

  const uniqueBlockers = Array.from(new Set(blockers));
  const warnings = [...eligibilityWarnings, ...reportOnlyWarnings];

  let verdict = "PASS";
  if (
    products.length === 0 ||
    feedHasNoEligiblePresence ||
    blockingAccountIssues.length > 0 ||
    (eligibilityProducts.length > 0 &&
      approvedProducts.length === 0 &&
      partialProducts.length === 0 &&
      (disapprovedProducts.length > 0 || pendingProducts.length === 0)) ||
    (missingFromMerchant.length > 0 && approvedProducts.length === 0 && partialProducts.length === 0)
  ) {
    verdict = "BLOCKED";
  } else if (
    eligibilityWarnings.length > 0 ||
    missingFromMerchant.length > 0 ||
    disapprovedProducts.length > 0 ||
    pendingProducts.length > 0 ||
    partialProducts.length > 0 ||
    missingContextProducts.length > 0 ||
    unknownProducts.length > 0
  ) {
    // Only current-feed eligibility signals affect PARTIAL. Report-only stale/aggregate notes do not.
    verdict = "PARTIAL";
  }

  return {
    generatedAt: new Date().toISOString(),
    verdict,
    counts: {
      processedProducts: products.length,
      feedOfferIds: feedOfferIds.length,
      eligibilityProducts: eligibilityProducts.length,
      unexpectedProducts: unexpectedProducts.length,
      approvedForFreeListings: approvedProducts.length,
      pendingForFreeListings: pendingProducts.length,
      partialForFreeListings: partialProducts.length,
      disapprovedForFreeListings: disapprovedProducts.length,
      missingFreeListingContext: missingContextProducts.length,
      unknownForFreeListings: unknownProducts.length,
      accountIssues: accountIssueSummaries.length,
      blockingAccountIssues: blockingAccountIssues.length,
      productIssues: productIssueCount,
      disapprovedProductIssues: disapprovedIssueCount,
      aggregateActive,
      aggregatePending,
      aggregateDisapproved,
      aggregateItemLevelIssues: aggregateItemLevelIssues.length,
      eligibilityWarnings: eligibilityWarnings.length,
      reportOnlyWarnings: reportOnlyWarnings.length,
    },
    feedCoverage: {
      feedOfferIds,
      presentInMerchant: feedOfferIds.filter((id) => processedOfferIdSet.has(id)),
      missingFromMerchant,
      unexpectedInMerchant,
    },
    products: eligibilityProducts,
    unexpectedProducts,
    accountIssues: accountIssueSummaries,
    freeListingAggregates,
    blockers: uniqueBlockers,
    eligibilityWarnings,
    reportOnlyWarnings,
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
        `Aggregate FREE_LISTINGS ${aggregate.country || "?"}: active=${aggregate.stats.activeCount} pending=${aggregate.stats.pendingCount} disapproved=${aggregate.stats.disapprovedCount}`,
      );
      for (const issue of aggregate.itemLevelIssues.slice(0, 5)) {
        lines.push(
          `  • [${issue.severity}] ${issue.code}` +
            (issue.productCount ? ` products=${issue.productCount}` : "") +
            (issue.documentationUri ? ` docs=${issue.documentationUri}` : ""),
        );
      }
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
    lines.push(`Current-feed product issues (${issueProducts.length} product(s)):`);
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
  if (Array.isArray(report.unexpectedProducts) && report.unexpectedProducts.length) {
    lines.push(
      `Unexpected Merchant products excluded from eligibility: ${report.unexpectedProducts
        .map((product) => product.offerId)
        .filter(Boolean)
        .join(", ")}`,
    );
  }

  if (report.blockers.length) {
    lines.push("Blockers:");
    for (const blocker of report.blockers) lines.push(`- ${blocker}`);
  }
  const eligibilityWarnings = Array.isArray(report.eligibilityWarnings)
    ? report.eligibilityWarnings
    : [];
  const reportOnlyWarnings = Array.isArray(report.reportOnlyWarnings)
    ? report.reportOnlyWarnings
    : Array.isArray(report.warnings)
      ? report.warnings
      : [];
  if (eligibilityWarnings.length) {
    lines.push("Eligibility warnings:");
    for (const warning of eligibilityWarnings) lines.push(`- ${warning}`);
  }
  if (reportOnlyWarnings.length) {
    lines.push("Report-only notes (do not affect verdict):");
    for (const warning of reportOnlyWarnings) lines.push(`- ${warning}`);
  }
  return lines.join("\n");
}

/**
 * @param {(path: string, options?: object) => Promise<object>} requestFn
 * @param {string} pathPrefix
 * @param {string} itemsKey
 * @param {{ pageSize?: number, query?: Record<string, string>, maxPages?: number }} [options]
 */
export async function listAllPages(requestFn, pathPrefix, itemsKey, options = {}) {
  const pageSize = options.pageSize ?? 250;
  const query = options.query || {};
  const maxPages = options.maxPages ?? 100;
  const items = [];
  let pageToken = "";
  let pages = 0;

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

  if (pageToken) {
    throw new Error(
      `Indeterminate Merchant list result: pagination safety cap (${maxPages} pages) reached for ${pathPrefix} while nextPageToken remained. Refusing to diagnose from a truncated collection.`,
    );
  }

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
      // Filter field name per Merchant API filter syntax / Codex review: reporting_context.
      query: { filter: 'reporting_context = "FREE_LISTINGS"' },
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
