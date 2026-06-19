/**
 * Pure functions from checkoutRecoveryAlerts.ts ported for Node unit tests.
 * Keep in sync with the TypeScript source — only test the deterministic parts.
 */

/** @param {string | null | undefined} variant */
function getVariantLabel(variant) {
  switch (variant) {
    case "poster_framed":
      return "Framed print";
    case "poster_unframed":
      return "Unframed print";
    case "canvas_wrap":
      return "Canvas wrap";
    default:
      return "Print";
  }
}

/**
 * @param {{ orderType: string; printVariant?: string | null; plan?: string | null; includesDigitalAddOn?: boolean }} input
 * @returns {string}
 */
export function getOfferLabel(input) {
  if (input.orderType === "print") {
    const printLabel = input.printVariant ? getVariantLabel(input.printVariant).toLowerCase() : "print";
    return input.includesDigitalAddOn ? `${printLabel} + HD download` : printLabel;
  }
  if (input.plan === "pack3") return "3 HD export credits";
  if (input.plan === "subscription") return "unlimited HD access";
  return "HD download";
}

/**
 * @param {{ orderType: string; printVariant?: string | null; plan?: string | null }} input
 * @returns {string}
 */
export function getSubject(input) {
  if (input.orderType === "print") {
    if (input.printVariant === "poster_framed") {
      return "Your framed star map design is saved — pick up where you left off";
    }
    if (input.printVariant === "poster_unframed") {
      return "Your star map print design is saved — pick up where you left off";
    }
    if (input.printVariant) {
      return `Your ${getVariantLabel(input.printVariant)} design is saved — pick up where you left off`;
    }
    return "Your star map design is saved — pick up where you left off";
  }
  if (input.plan === "subscription") return "Your StarMapCo subscription is one step away";
  return "Your star map download is waiting — complete in seconds";
}

/**
 * @param {{ orderType: string; printVariant?: string | null; includesDigitalAddOn?: boolean }} input
 * @returns {string[]}
 */
export function getIncludesBullets(input) {
  if (input.orderType !== "print") return [];
  const bullets = [];
  if (input.printVariant) {
    bullets.push(getVariantLabel(input.printVariant));
  } else {
    bullets.push("Printed star map");
  }
  if (input.includesDigitalAddOn) {
    bullets.push("HD digital download (unlocked instantly after payment)");
  }
  bullets.push("Your custom text, date, and location — all saved");
  return bullets;
}
