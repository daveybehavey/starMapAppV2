/**
 * paywallModal.harness.mjs
 *
 * Pure-function extracts from PaywallModal.tsx for unit testing without React.
 * Mirrors the logic in the component — keep in sync when editing.
 */

/**
 * @param {"digital"|"print"} activeIntent
 * @returns {string[]}
 */
export function getBullets(activeIntent) {
  if (activeIntent === "print") {
    return [
      "Printed and shipped to your door — framed or unframed",
      "Production reviewed before fulfillment",
      "Secure checkout — card, Apple Pay, Google Pay",
      "HD digital file available to add at checkout",
    ];
  }
  return [
    "6,000 px high resolution — poster-quality print",
    "No watermark on your downloaded file",
    "Secure checkout — card, Apple Pay, Google Pay",
    "Instant download after payment",
  ];
}

/**
 * @param {"digital"|"print"} purchaseIntent
 * @returns {{ id: "digital"|"print"; label: string }[]}
 */
export function getTabOrder(purchaseIntent) {
  if (purchaseIntent === "print") {
    return [
      { id: "print", label: "Printed gift" },
      { id: "digital", label: "Digital HD" },
    ];
  }
  return [
    { id: "digital", label: "Digital HD" },
    { id: "print", label: "Printed gift" },
  ];
}

/**
 * @param {boolean} hasPrintOptions
 * @param {"digital"|"print"} purchaseIntent
 * @returns {"digital"|"print"}
 */
export function getInitialActiveIntent(hasPrintOptions, purchaseIntent) {
  return hasPrintOptions && purchaseIntent === "print" ? "print" : "digital";
}
