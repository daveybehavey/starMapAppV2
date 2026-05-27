import type Stripe from "stripe";
import type { CheckoutOrderType, CheckoutPlan, PrintVariant } from "./pricing";
import { isPrintVariant } from "./printCatalog";
import type { Ga4PurchaseInput } from "./ga4MeasurementProtocol";
import {
  applyMarketingAttributionMetadata,
  isQaStripeSession,
} from "./commerceAnalyticsQa.mjs";

export { applyMarketingAttributionMetadata, isQaStripeSession };

export function getOrderTypeFromStripeSession(session: Stripe.Checkout.Session): CheckoutOrderType {
  return session.metadata?.order_type === "print" ? "print" : "digital";
}

export function getPrintVariantFromStripeSession(session: Stripe.Checkout.Session): PrintVariant | null {
  const raw = session.metadata?.print_variant;
  return isPrintVariant(raw) ? raw : null;
}

export function getPlanFromStripeSession(session: Stripe.Checkout.Session): CheckoutPlan | null {
  const raw = session.metadata?.plan;
  if (raw === "single" || raw === "pack3" || raw === "subscription") return raw;
  return null;
}

export function stripeSessionPaidValueDollars(session: Stripe.Checkout.Session): number | undefined {
  if (typeof session.amount_total !== "number" || !Number.isFinite(session.amount_total)) return undefined;
  return session.amount_total / 100;
}

export function buildGa4PurchaseFromStripeSession(session: Stripe.Checkout.Session): Ga4PurchaseInput {
  const orderType = getOrderTypeFromStripeSession(session);
  const printVariant = getPrintVariantFromStripeSession(session);
  const includeDigitalAddOn = session.metadata?.print_include_digital === "true";
  return {
    transactionId: session.id,
    plan: getPlanFromStripeSession(session),
    orderType,
    printVariant,
    includeDigitalAddOn,
    value: stripeSessionPaidValueDollars(session),
    currency: typeof session.currency === "string" ? session.currency : undefined,
  };
}
