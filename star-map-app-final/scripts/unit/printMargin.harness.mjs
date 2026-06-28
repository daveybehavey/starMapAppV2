/** Keep in sync with printMargin guard decision boundary in src/lib/printMargin.ts */

export function parseBool(value, fallback = false) {
  if (!value || !String(value).trim()) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no"].includes(normalized)) return false;
  return fallback;
}

export function evaluateMarginGuard({ enabled, minMarginCents, marginCents, hasEstimate }) {
  const enforced = enabled && minMarginCents > 0;
  if (!enforced) return { allowed: true, enforced: false };
  if (!hasEstimate || marginCents === null) {
    return { allowed: false, enforced: true, code: "margin_estimate_unavailable" };
  }
  if (marginCents < minMarginCents) {
    return { allowed: false, enforced: true, code: "margin_below_threshold" };
  }
  return { allowed: true, enforced: true };
}
