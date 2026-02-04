export const HERO_CHECKOUT_EXPERIMENT = "hero_checkout_cta_v1";
export const PAYWALL_COPY_EXPERIMENT = "paywall_copy_v1";

export type HeroCheckoutVariant = "control" | "value";
export type PaywallCopyVariant = "control" | "value_anchor";

const EXPERIMENT_STORAGE_PREFIX = "exp:variant:";

function randomInt(max: number) {
  if (max <= 1) return 0;
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bucket = new Uint32Array(1);
    crypto.getRandomValues(bucket);
    return bucket[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function getStickyVariant<T extends string>(
  experiment: string,
  variants: readonly T[],
  fallback: T,
): T {
  if (!variants.length) return fallback;
  if (typeof window === "undefined") return fallback;
  const storageKey = `${EXPERIMENT_STORAGE_PREFIX}${experiment}`;

  try {
    const stored = localStorage.getItem(storageKey);
    if (stored && variants.includes(stored as T)) {
      return stored as T;
    }
  } catch {
    // Continue with runtime assignment.
  }

  const chosen = variants[randomInt(variants.length)] ?? fallback;
  try {
    localStorage.setItem(storageKey, chosen);
  } catch {
    // Ignore storage failures.
  }
  return chosen;
}

export function getHeroCheckoutVariant(): HeroCheckoutVariant {
  return getStickyVariant<HeroCheckoutVariant>(
    HERO_CHECKOUT_EXPERIMENT,
    ["control", "value"],
    "control",
  );
}

export function getPaywallCopyVariant(): PaywallCopyVariant {
  return getStickyVariant<PaywallCopyVariant>(
    PAYWALL_COPY_EXPERIMENT,
    ["control", "value_anchor"],
    "control",
  );
}
