#!/usr/bin/env node
/**
 * Verify a paid print checkout end-to-end: Stripe session, app fulfillment record, Printful order files.
 *
 * Usage:
 *   node scripts/verify-paid-print-order.mjs --session cs_live_...
 */
import { loadDotenv } from "./load-dotenv.mjs";
import { readWranglerVars } from "./wrangler-vars.mjs";

loadDotenv();
const wranglerVars = await readWranglerVars(process.cwd());
for (const [key, value] of Object.entries(wranglerVars)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

function parseArgs(argv) {
  const sessionId = argv.find((_, i) => argv[i - 1] === "--session")?.trim() || "";
  if (!sessionId) {
    console.error("Usage: node scripts/verify-paid-print-order.mjs --session cs_live_...");
    process.exit(1);
  }
  return {
    sessionId,
    site: (process.env.SITE_URL || "https://starmapco.com").replace(/\/+$/, ""),
  };
}

const args = parseArgs(process.argv.slice(2));
const token = process.env.PRINT_ADMIN_TOKEN?.trim();
const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();

if (!stripeSecret) {
  console.error("Missing STRIPE_SECRET_KEY");
  process.exit(1);
}

const Stripe = (await import("stripe")).default;
const stripe = new Stripe(stripeSecret);

const session = await stripe.checkout.sessions.retrieve(args.sessionId, {
  expand: ["line_items"],
});

const statusRes = await fetch(
  `${args.site}/api/print/orders/status?session_id=${encodeURIComponent(args.sessionId)}`,
  token ? { headers: { "x-print-admin-token": token } } : {},
);
const statusJson = await statusRes.json().catch(() => ({}));
const order = statusJson.order ?? null;

let printful = null;
const printfulToken = process.env.PRINTFUL_API_TOKEN?.trim();
if (printfulToken && order?.printfulOrderId) {
  const pfRes = await fetch(`https://api.printful.com/orders/${order.printfulOrderId}`, {
    headers: { Authorization: `Bearer ${printfulToken}` },
  });
  const pfJson = await pfRes.json().catch(() => ({}));
  const pfOrder = pfJson.result ?? null;
  if (pfOrder) {
    printful = {
      id: pfOrder.id,
      status: pfOrder.status,
      dashboardUrl: pfOrder.dashboard_url,
      fileStatuses: (pfOrder.items ?? []).flatMap((item) =>
        (item.files ?? []).map((file) => ({
          item: item.name,
          type: file.type,
          status: file.status,
          url: file.url,
        })),
      ),
    };
  }
}

const fileFailures =
  printful?.fileStatuses?.filter((f) => f.status && String(f.status).trim().toLowerCase() === "failed") ?? [];
const filePending =
  printful?.fileStatuses?.filter((f) => {
    const s = f.status ? String(f.status).trim().toLowerCase() : "";
    return s && s !== "ok" && s !== "failed";
  }) ?? [];
const fulfillmentOk =
  session.payment_status === "paid" &&
  order?.status === "sent" &&
  Boolean(order?.printfulOrderId) &&
  fileFailures.length === 0;

console.log(
  JSON.stringify(
    {
      sessionId: args.sessionId,
      stripe: {
        paymentStatus: session.payment_status,
        checkoutStatus: session.status,
        amountTotal: session.amount_total,
        currency: session.currency,
        metadata: session.metadata,
        lineItems: (session.line_items?.data ?? []).map((li) => li.description || li.price?.nickname),
      },
      fulfillment: order
        ? {
            status: order.status,
            printVariant: order.printVariant,
            includesCardAddOn: order.includesCardAddOn,
            merchFamily: order.printMerchFamily ?? session.metadata?.print_merch_family ?? null,
            printfulOrderId: order.printfulOrderId,
            shippingCountry: order.shippingDetails?.address?.country ?? session.metadata?.print_shipping_country,
            attempts: order.attempts,
            error: order.error ?? null,
          }
        : { error: statusJson.error ?? `HTTP ${statusRes.status}` },
      printful,
      verdict: fulfillmentOk
        ? "fulfillment_ok"
        : session.payment_status === "paid" && order?.status === "sent" && fileFailures.length
          ? "paid_and_submitted_printful_files_need_review"
          : session.payment_status === "paid" && order?.status === "sent"
            ? "paid_and_submitted"
            : session.payment_status === "paid"
              ? "paid_fulfillment_incomplete"
              : "not_paid",
      notes:
        fileFailures.length > 0
          ? "Printful accepted the order but one or more print files failed validation — use --asset proof in create-qa-ops-checkout.mjs for real fulfillment."
          : filePending.length > 0
            ? "Printful file status is waiting/unknown (pending) — not treated as confirmed failure."
            : undefined,
    },
    null,
    2,
  ),
);

process.exitCode = session.payment_status === "paid" && order?.status === "sent" ? 0 : 1;
