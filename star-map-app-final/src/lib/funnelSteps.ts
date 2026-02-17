export const FUNNEL_STEPS = [
  "landing_view",
  "hero_plan_click",
  "preview_started",
  "editor_reveal",
  "checkout_started",
  "checkout_redirected",
  "payment_verified",
  "download_started",
  "download_completed",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

const STEP_SET = new Set<string>(FUNNEL_STEPS);

export function isFunnelStep(step: string): step is FunnelStep {
  return STEP_SET.has(step);
}
