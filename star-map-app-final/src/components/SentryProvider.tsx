"use client";

/**
 * SQ-58 / issue #429 — initializes @sentry/react exactly once.
 *
 * Inert unless NEXT_PUBLIC_SENTRY_DSN was set at build time (mirrors the
 * PosthogProvider pattern). Privacy posture comes from the SQ-58 plan and the
 * shared policy in @/lib/sentryScrub: no default PII, no traces, no replay,
 * no breadcrumbs, no console capture — only the allowlisted integrations run,
 * and every event is rebuilt by the deny-by-default scrubber before send.
 */
import { useEffect } from "react";
import {
  filterSentryIntegrationsByName,
  resolveSentryConfig,
  safeScrubSentryEvent,
  SENTRY_DATA_COLLECTION_OFF,
} from "@/lib/sentryScrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
const release = process.env.NEXT_PUBLIC_SENTRY_RELEASE;
const environment = process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;

export default function SentryProvider() {
  useEffect(() => {
    const config = resolveSentryConfig({ dsn, release, environment });
    if (!config) return;
    let active = true;
    void import("@sentry/react")
      .then((Sentry) => {
        if (!active || Sentry.getClient()) return;
        Sentry.init({
          dsn: config.dsn,
          release: config.release,
          environment: config.environment,
          dataCollection: SENTRY_DATA_COLLECTION_OFF,
          // Errors only: full error sampling, zero performance tracing.
          // The Sentry plan's pay-as-you-go is capped at $0, so events the
          // plan allowance cannot absorb are dropped by Sentry — acceptable.
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
      })
      .catch(() => {
        // Telemetry must never break the page.
      });
    return () => {
      active = false;
    };
  }, []);

  return null;
}
