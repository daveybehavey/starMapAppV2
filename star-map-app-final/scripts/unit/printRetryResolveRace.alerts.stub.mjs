/** Operator-alert stubs: delivered, no email side effects. */
export async function sendPrintOrderApprovalAlert() {
  return { delivered: true, provider: "resend" };
}

export async function sendPrintOrderFailureAlert() {
  return { delivered: true, provider: "resend" };
}

export async function sendPrintOrderHoldAlert() {
  return { delivered: true, provider: "resend" };
}

export async function sendPrintOrderHoldEscalationAlert() {
  return { delivered: true, provider: "resend" };
}
