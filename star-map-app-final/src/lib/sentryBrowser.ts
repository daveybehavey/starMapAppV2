/**
 * SQ-58 / issue #429 — browser-side Sentry initialization + reporting.
 *
 * Client components only. The SDK is loaded lazily through ONE memoized
 * promise shared by SentryProvider (which kicks initialization off on mount)
 * and reportBrowserError (which awaits the same promise before capturing).
 * That ordering matters: an error boundary can catch during the very first
 * commit — before any passive effect has run — and captures made without an
 * initialized client are discarded, so boundary reports must be able to
 * trigger and await initialization themselves.
 *
 * Inert unless NEXT_PUBLIC_SENTRY_DSN was set at build time. Telemetry must
 * never break the page, so every failure here is swallowed.
 */
import {
  filterSentryIntegrationsByName,
  resolveSentryConfig,
  safeScrubSentryEvent,
  SENTRY_DATA_COLLECTION_OFF,
  type SentryOperationCode,
} from "./sentryScrub";

type SentryReactModule = typeof import("@sentry/react");

let initPromise: Promise<SentryReactModule | null> | null = null;

/** Load the SDK and initialize it once; resolves null on any failure. */
export function loadSentryBrowser(): Promise<SentryReactModule | null> {
  if (!initPromise) {
    initPromise = import("@sentry/react")
      .then((Sentry) => {
        if (!Sentry.getClient()) {
          const config = resolveSentryConfig({
            dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
            release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
            environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
          });
          if (config) {
            Sentry.init({
              dsn: config.dsn,
              release: config.release,
              environment: config.environment,
              dataCollection: SENTRY_DATA_COLLECTION_OFF,
              // Errors only: full error sampling, zero performance tracing.
              // The Sentry plan's pay-as-you-go is capped at $0, so events
              // the plan allowance cannot absorb are dropped by Sentry.
              sampleRate: 1.0,
              tracesSampleRate: 0,
              integrations: (defaults) => filterSentryIntegrationsByName(defaults),
              beforeBreadcrumb: () => null,
              beforeSend: (event) => {
                const scrubbed = safeScrubSentryEvent(event);
                return scrubbed === null ? null : (scrubbed as unknown as typeof event);
              },
              initialScope: { tags: { runtime: "browser" } },
            });
          }
        }
        return Sentry;
      })
      .catch(() => null);
  }
  return initPromise;
}

/** Fire-and-forget initialization (SentryProvider's mount effect). */
export function initSentryBrowser(): void {
  void loadSentryBrowser();
}

/**
 * Capture an error with a fixed operation code, awaiting initialization so
 * first-commit boundary crashes are not lost. The shared `beforeSend`
 * scrubber replaces the raw message and strips everything else.
 */
export function reportBrowserError(error: unknown, operation: SentryOperationCode): void {
  void loadSentryBrowser().then((Sentry) => {
    if (!Sentry || !Sentry.getClient()) return;
    Sentry.captureException(error, { tags: { operation } });
  });
}
