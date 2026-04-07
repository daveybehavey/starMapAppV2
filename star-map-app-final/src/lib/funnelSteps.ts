export const FUNNEL_STEPS = [
  "landing_view",
  "hero_plan_click",
  "preview_started",
  "editor_reveal",
  "preview_download_started",
  "preview_download_completed",
  "checkout_started",
  "checkout_request_received",
  "checkout_session_created",
  "checkout_redirected",
  "checkout_expired",
  "payment_verified",
  "download_started",
  "download_completed",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

export const SERVER_CANONICAL_FUNNEL_STEPS = [
  "checkout_started",
  "checkout_request_received",
  "checkout_session_created",
  "checkout_redirected",
  "checkout_expired",
  "payment_verified",
] as const satisfies readonly FunnelStep[];

export type ServerCanonicalFunnelStep = (typeof SERVER_CANONICAL_FUNNEL_STEPS)[number];

const STEP_SET = new Set<string>(FUNNEL_STEPS);
const SERVER_CANONICAL_STEP_SET = new Set<string>(SERVER_CANONICAL_FUNNEL_STEPS);

export function isFunnelStep(step: string): step is FunnelStep {
  return STEP_SET.has(step);
}

export function isServerCanonicalFunnelStep(step: string): step is ServerCanonicalFunnelStep {
  return SERVER_CANONICAL_STEP_SET.has(step);
}
