import { after } from "next/server";
import { recordPaymentVerifiedOnce } from "./funnel";

export const PAYMENT_ANALYTICS_TIMEOUT_MS = 1500;
type PaymentAnalyticsInput = Parameters<typeof recordPaymentVerifiedOnce>[0];

/** Bound the whole optional task, including KV calls; abort outbound provider fetches.
 * This is best effort, not a durable delivery queue or an exactly-once guarantee.
 */
export async function runOptionalPaymentAnalytics(input: PaymentAnalyticsInput): Promise<void> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve();
    }, PAYMENT_ANALYTICS_TIMEOUT_MS);
  });
  const work = Promise.resolve()
    .then(() => recordPaymentVerifiedOnce({ ...input, signal: controller.signal }))
    .catch(() => {
      console.warn("Optional payment analytics failed");
    });
  try {
    await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/** Schedule only after the essential response/fulfillment path finishes.
 * A missing request context must skip analytics, never fail a paid operation.
 */
export function schedulePaymentAnalytics(input: PaymentAnalyticsInput): void {
  try {
    after(() => runOptionalPaymentAnalytics(input));
  } catch {
    console.warn("Optional payment analytics scheduling unavailable");
  }
}
