/** Operator-alert stubs for printWriterSlateFollowup.test.mjs: delivered, no email side effects, with a call log for assertions. */
export const alertCalls = [];

export async function sendPrintOrderApprovalAlert(record) {
  alertCalls.push({ kind: "approval", sessionId: record?.sessionId });
  return { delivered: true, provider: "resend" };
}

export async function sendPrintOrderFailureAlert(record) {
  alertCalls.push({ kind: "failure", sessionId: record?.sessionId });
  return { delivered: true, provider: "resend" };
}

export async function sendPrintOrderHoldAlert(record) {
  alertCalls.push({ kind: "hold", sessionId: record?.sessionId });
  return { delivered: true, provider: "resend" };
}

export async function sendPrintOrderHoldEscalationAlert(record) {
  alertCalls.push({ kind: "hold_escalation", sessionId: record?.sessionId });
  return { delivered: true, provider: "resend" };
}
