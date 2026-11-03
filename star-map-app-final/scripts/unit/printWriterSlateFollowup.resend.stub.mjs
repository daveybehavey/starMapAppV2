/**
 * Controllable Resend stub for printWriterSlateFollowup.test.mjs:
 * the shipping-notification sender (F-8 / PR #505 gate fix C) is
 * driven against this module via the suite's resolve hooks, so the
 * send outcome — and any mid-send side effect a test installs — is
 * deterministic and no network is touched.
 */
let behaviour = { configured: true, result: { ok: true, id: "msg_stub" }, onSend: null };
export const sendCalls = [];

export function __setResendBehaviour(next) {
  behaviour = { ...behaviour, ...next };
}

export function __resetResendStub() {
  behaviour = { configured: true, result: { ok: true, id: "msg_stub" }, onSend: null };
  sendCalls.length = 0;
}

export function isResendConfigured() {
  return behaviour.configured;
}

export async function sendResendEmail(input) {
  sendCalls.push(input);
  if (behaviour.onSend) await behaviour.onSend(input);
  return behaviour.result;
}
