/** Confirmation-email stub: the webhook fire-and-forgets this. */
export async function sendPrintOrderConfirmation() {
  return { ok: true, status: "sent" };
}
