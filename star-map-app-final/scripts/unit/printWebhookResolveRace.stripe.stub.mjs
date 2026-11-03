/**
 * Stripe stub for printWebhookResolveRace.test.mjs. The webhook route
 * constructs `new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() })`
 * at module load and verifies events through
 * `stripe.webhooks.constructEvent`. The stub's constructEvent parses
 * the payload JSON (signature verification is the real SDK's job and
 * is exercised by the signed-POST suites; these tests pin the
 * fulfillment pass downstream of it). Session retrieves delegate to
 * the handler the test installs on `globalThis.__whStripeRetrieve`;
 * the fixtures carry complete recipients, so a retrieve is not
 * expected on the print path.
 */
export default class StripeStub {
  static createFetchHttpClient() {
    return {};
  }

  constructor() {
    this.webhooks = {
      constructEvent: (payload) => JSON.parse(payload),
    };
    this.checkout = {
      sessions: {
        retrieve: async (id, options) => {
          const handler = globalThis.__whStripeRetrieve;
          if (typeof handler !== "function") {
            throw new Error("printWebhookResolveRace: no Stripe retrieve handler installed");
          }
          return handler(id, options);
        },
      },
    };
    this.paymentIntents = {
      // Settlement maps the PI's latest charge to the session; the
      // fixtures carry no charge, so the mapping write is skipped.
      retrieve: async (id) => ({ id, object: "payment_intent", latest_charge: null }),
    };
    this.coupons = {
      retrieve: async () => {
        throw new Error("printWebhookResolveRace: unexpected coupon retrieve");
      },
    };
    this.promotionCodes = {
      retrieve: async () => {
        throw new Error("printWebhookResolveRace: unexpected promotion code retrieve");
      },
    };
  }
}
