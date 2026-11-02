/** Confirmation-email stub: the retry route fire-and-forgets this. */
export async function sendPrintOrderConfirmation() {
  return { ok: true, status: "sent" };
}
