// @ts-expect-error `.open-next/worker.js` is generated at OpenNext build time
import { default as handler } from "./.open-next/worker.js";
import * as Sentry from "@sentry/cloudflare";
import { runScheduledReviewRequestTick } from "./src/lib/reviewRequestRuntime";
import { resolveSentryConfig, safeScrubSentryEvent, SENTRY_DATA_COLLECTION_OFF } from "./src/lib/sentryScrub";
import { PrintOrderAuthorityDO as PrintOrderAuthorityDOBase } from "./src/durable-objects/PrintOrderAuthorityDO";
import { ReviewRequestLedgerDO as ReviewRequestLedgerDOBase } from "./src/durable-objects/ReviewRequestLedgerDO";
import { ReviewRequestSuppressionDO as ReviewRequestSuppressionDOBase } from "./src/durable-objects/ReviewRequestSuppressionDO";
import { EntitlementAuthorityDO as EntitlementAuthorityDOBase } from "./src/durable-objects/EntitlementAuthorityDO";
import { ConsistencyCoordinatorDO as ConsistencyCoordinatorDOBase } from "./src/durable-objects/ConsistencyCoordinatorDO";
import { ReferralDiscoveryDO as ReferralDiscoveryDOBase } from "./src/durable-objects/ReferralDiscoveryDO";

/**
 * SQ-58 / issue #429 — Sentry wiring for the Worker surface.
 *
 * Inert unless SENTRY_DSN is set in the Worker environment (dashboard-owned
 * activation, like REVIEW_REQUESTS_ENABLED). SENTRY_RELEASE pins events to
 * the same `starmapco@<commit-sha>` release as the browser SDK when set.
 * Every event passes the shared deny-by-default scrubber in
 * src/lib/sentryScrub.ts: fixed operation codes and sanitized frames only —
 * no request data, no identifiers, no provider payloads. Errors only:
 * sampleRate 1.0, tracesSampleRate 0 (pay-as-you-go is capped at $0, so
 * allowance overflow drops events rather than billing).
 */
function sentryOptionsFromEnv(env: CloudflareEnv) {
  const record = env as unknown as Record<string, unknown>;
  const config = resolveSentryConfig({
    dsn: record.SENTRY_DSN,
    release: record.SENTRY_RELEASE,
    environment: record.SENTRY_ENVIRONMENT,
  });
  return {
    dsn: config?.dsn,
    release: config?.release,
    environment: config?.environment ?? "production",
    enabled: config !== null,
    dataCollection: SENTRY_DATA_COLLECTION_OFF,
    sampleRate: 1.0,
    tracesSampleRate: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => {
      const scrubbed = safeScrubSentryEvent(event);
      return scrubbed === null ? null : (scrubbed as unknown as typeof event);
    },
    initialScope: { tags: { runtime: "worker" } },
  };
}

const sentryOptions = (env: unknown) => sentryOptionsFromEnv(env as CloudflareEnv);

export const PrintOrderAuthorityDO = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  PrintOrderAuthorityDOBase
);
export const ReviewRequestLedgerDO = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  ReviewRequestLedgerDOBase
);
export const ReviewRequestSuppressionDO = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  ReviewRequestSuppressionDOBase
);
export const EntitlementAuthorityDO = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  EntitlementAuthorityDOBase
);
export const ConsistencyCoordinatorDO = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  ConsistencyCoordinatorDOBase
);
export const ReferralDiscoveryDO = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  ReferralDiscoveryDOBase
);

const workerHandler = {
  fetch: handler.fetch,
  // Review-request engine tick (T1). INERT unless REVIEW_REQUESTS_ENABLED is
  // set to "true" in the Worker environment at activation time — the flag is
  // deliberately not in wrangler.toml [vars]. The tick is total (per-record
  // isolation, counts-only logging); the catch here is belt-and-braces so a
  // scheduling failure can never surface as a Worker error.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runScheduledReviewRequestTick(env).catch((error: unknown) => {
        // Fixed-code capture through the scrubbed pipeline; the raw error
        // message is replaced by the operation code in beforeSend.
        Sentry.captureException(error, {
          tags: { operation: "review_tick_failed" },
        });
        console.error(
          JSON.stringify({
            event: "review_requests",
            status: "tick_error",
            error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
            cron: event.cron,
          })
        );
      })
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;

export default Sentry.withSentry(sentryOptions, workerHandler);
