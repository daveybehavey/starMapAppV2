import type { FunnelStep } from "./funnelSteps";

export type EventProps = Record<string, string | number | boolean | undefined | null>;

export const ANALYTICS_STORAGE_KEY = "analytics-consent";

let posthogPromise: Promise<typeof import("posthog-js").default> | null = null;

export const loadPosthogClient = async () => {
  if (!posthogPromise) {
    posthogPromise = import("posthog-js").then((mod) => mod.default);
  }
  return posthogPromise;
};

// Type declarations for third-party analytics on window
type GtagFunction = (command: string, eventName: string, params?: Record<string, unknown>) => void;

declare global {
  interface Window {
    gtag?: GtagFunction;
  }
}

function canTrackAnalytics() {
  if (typeof window === "undefined") return false;
  if (!hasAnalyticsConsent()) return false;
  if (isDoNotTrackEnabled()) return false;
  return true;
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): T {
  const out = {} as T;
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) {
      (out as Record<string, unknown>)[key] = field;
    }
  }
  return out;
}

export function runWhenIdle(task: () => void, timeout = 1200) {
  if (typeof window === "undefined") return;
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(() => task(), { timeout });
  } else {
    window.setTimeout(task, timeout);
  }
}

export function track(event: string, props?: EventProps) {
  if (!canTrackAnalytics()) return;
  const payload = removeUndefinedValues({
    ...props,
    route: window.location.pathname,
  });
  try {
    void loadPosthogClient().then((posthog) => {
      posthog.capture?.(event, payload);
    });
    if (typeof window.gtag === "function") {
      window.gtag("event", event, payload);
    }
  } catch {
    // silently ignore tracking errors
  }
}

function postFunnelCounter(payload: {
  step: FunnelStep;
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
}) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(removeUndefinedValues(payload));
  try {
    if (typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/analytics/funnel", blob);
      return;
    }
  } catch {
    // Fallback to fetch below.
  }
  void fetch("/api/analytics/funnel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

type FunnelEventProps = EventProps & {
  source?: string;
  plan?: string;
  experiment?: string;
  variant?: string;
};

export function trackFunnelStep(step: FunnelStep, props?: FunnelEventProps) {
  if (!canTrackAnalytics()) return;
  const payload = removeUndefinedValues({
    step,
    ...props,
  });
  track("funnel_step", payload);
  postFunnelCounter({
    step,
    source: typeof payload.source === "string" ? payload.source : undefined,
    plan: typeof payload.plan === "string" ? payload.plan : undefined,
    experiment: typeof payload.experiment === "string" ? payload.experiment : undefined,
    variant: typeof payload.variant === "string" ? payload.variant : undefined,
  });
}

export function trackExperimentExposure(
  experiment: string,
  variant: string,
  props?: EventProps,
) {
  if (!canTrackAnalytics()) return;
  const dedupeKey = `exp:${experiment}:${variant}:seen`;
  try {
    if (sessionStorage.getItem(dedupeKey) === "true") return;
    sessionStorage.setItem(dedupeKey, "true");
  } catch {
    // Ignore storage failures and continue tracking.
  }
  track("experiment_exposure", {
    experiment,
    variant,
    ...props,
  });
}

export function isDoNotTrackEnabled() {
  if (typeof window === "undefined") return false;
  const dnt =
    window.navigator.doNotTrack ||
    (window as typeof window & { doNotTrack?: string }).doNotTrack ||
    (window.navigator as typeof window.navigator & { msDoNotTrack?: string }).msDoNotTrack;
  return dnt === "1" || dnt === "yes";
}

export function hasAnalyticsConsent() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ANALYTICS_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}
