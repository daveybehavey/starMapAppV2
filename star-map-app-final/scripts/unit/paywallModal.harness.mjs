/**
 * paywallModal.harness.mjs
 *
 * Pure-function extracts from PaywallModal.tsx for unit testing without React.
 * Mirrors the logic in the component — keep in sync when editing.
 */

import { getPaywallDigitalBullets, getPaywallPrintBullets } from "./commerceFacts.harness.mjs";

/**
 * @param {"digital"|"print"} activeIntent
 * @returns {string[]}
 */
export function getBullets(activeIntent) {
  return activeIntent === "print" ? getPaywallPrintBullets() : getPaywallDigitalBullets();
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
