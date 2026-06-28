export const FUNNEL_STEPS = [
  "landing_view",
  "hero_plan_click",
  "preview_started",
  "editor_reveal",
  "preview_checkout_nudge_shown",
  "preview_checkout_nudge_clicked",
  "checkout_started",
  "checkout_request_received",
  "checkout_session_created",
  "checkout_redirected",
  "checkout_expired",
  "payment_verified",
  "download_started",
  "download_completed",
  "download_failed",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

const STEP_SET = new Set<string>(FUNNEL_STEPS);

export function isFunnelStep(step: string): step is FunnelStep {
  return STEP_SET.has(step);
}
