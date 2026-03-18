const DEFAULT_PROMOTION_TARGET_LABEL = "your first single HD digital checkout";
const DEFAULT_PROMOTION_TARGET_SCOPE = "single_digital";

function normalizeLabel(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeScope(value: string | undefined) {
  const normalized = value?.trim().toLowerCase();
  switch (normalized) {
    case "single_digital":
    case "print_framed":
    case "print_unframed":
    case "any_print":
    case "any":
      return normalized;
    default:
      return null;
  }
}

export type PromotionTargetScope = "single_digital" | "print_framed" | "print_unframed" | "any_print" | "any";

export function getPromotionTargetScope(): PromotionTargetScope {
  return (
    normalizeScope(process.env.NEXT_PUBLIC_PROMOTION_TARGET_SCOPE) ||
    normalizeScope(process.env.PROMOTION_TARGET_SCOPE) ||
    DEFAULT_PROMOTION_TARGET_SCOPE
  );
}

export function getPromotionTargetLabel() {
  return (
    normalizeLabel(process.env.NEXT_PUBLIC_PROMOTION_TARGET_LABEL) ||
    normalizeLabel(process.env.PROMOTION_TARGET_LABEL) ||
    DEFAULT_PROMOTION_TARGET_LABEL
  );
}

export function getPromotionOfferName() {
  const explicit =
    normalizeLabel(process.env.NEXT_PUBLIC_PROMOTION_OFFER_NAME) ||
    normalizeLabel(process.env.PROMOTION_OFFER_NAME);
  if (explicit) return explicit;

  switch (getPromotionTargetScope()) {
    case "print_framed":
      return "framed print code";
    case "print_unframed":
      return "unframed print code";
    case "any_print":
      return "print offer code";
    case "any":
      return "offer code";
    case "single_digital":
    default:
      return "HD starter code";
  }
}
