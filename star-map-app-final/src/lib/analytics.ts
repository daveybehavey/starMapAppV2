import posthog from "posthog-js";

type EventProps = Record<string, string | number | boolean | undefined>;

export function track(event: string, props?: EventProps) {
  if (typeof window === "undefined") return;
  if (!posthog?.capture) return;
  try {
    posthog.capture(event, {
      ...props,
      route: window.location.pathname,
    });
  } catch {
    // silently ignore tracking errors
  }
}
