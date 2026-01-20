import posthog from "posthog-js";

type EventProps = Record<string, string | number | boolean | undefined>;

// Type declarations for third-party analytics on window
type GtagFunction = (command: string, eventName: string, params?: Record<string, unknown>) => void;
type VercelAnalytics = { track?: (name: string, data?: Record<string, unknown>) => void };

declare global {
  interface Window {
    gtag?: GtagFunction;
    va?: VercelAnalytics;
  }
}

export function track(event: string, props?: EventProps) {
  if (typeof window === "undefined") return;
  const payload = {
    ...props,
    route: window.location.pathname,
  };
  try {
    if (posthog?.capture) {
      posthog.capture(event, payload);
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", event, payload);
    }
    if (window.va?.track) {
      window.va.track(event, payload);
    }
  } catch {
    // silently ignore tracking errors
  }
}
