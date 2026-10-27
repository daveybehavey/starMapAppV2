/**
 * SQ-58 / issue #429 — browser-side Sentry reporting helper.
 *
 * Client components only. Lazily loads @sentry/react so the SDK never enters
 * the initial bundle, and captures with a fixed operation code (the shared
 * `beforeSend` scrubber in sentryScrub.ts replaces the raw message and strips
 * everything else). A no-op until SentryProvider has initialized the SDK with
 * a DSN — telemetry must never break the page, so every failure here is
 * swallowed.
 */
import type { SentryOperationCode } from "./sentryScrub";

export function reportBrowserError(error: unknown, operation: SentryOperationCode): void {
  void import("@sentry/react")
    .then((Sentry) => {
      Sentry.captureException(error, { tags: { operation } });
    })
    .catch(() => {
      // Telemetry is best-effort only.
    });
}
