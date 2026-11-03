/**
 * The store under test never sends alerts (the scheduled entry point
 * does, and is not exercised here); these stubs only satisfy the
 * runtime module's imports.
 */
export async function sendPrintOrderHoldAlert() {
  return { delivered: false, provider: "none", error: "not_configured" };
}

export async function sendPrintOrderHoldEscalationAlert() {
  return { delivered: false, provider: "none", error: "not_configured" };
}
