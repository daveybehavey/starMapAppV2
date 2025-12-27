import posthog from "posthog-js";

type EventProps = Record<string, string | number | boolean | undefined>;

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
    const gtag = (window as any).gtag as ((...args: any[]) => void) | undefined;
    if (typeof gtag === "function") {
      gtag("event", event, payload);
    }
    const va = (window as any).va as { track?: (name: string, data?: Record<string, unknown>) => void } | undefined;
    if (va?.track) {
      va.track(event, payload);
    }
  } catch {
    // silently ignore tracking errors
  }
}
