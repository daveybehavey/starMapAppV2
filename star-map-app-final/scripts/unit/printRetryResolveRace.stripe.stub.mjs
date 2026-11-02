/**
 * Stripe stub for printRetryResolveRace.test.mjs. The retry route
 * constructs `new Stripe(secret, { httpClient: Stripe.createFetchHttpClient() })`
 * at module load and later calls `stripe.checkout.sessions.retrieve`.
 * Every retrieve delegates to the handler the test installs on
 * `globalThis.__f1StripeRetrieve`, which is how the tests land an
 * operator resolve DURING the payment-gate / hydration awaits.
 */
export default class StripeStub {
  static createFetchHttpClient() {
    return {};
  }

  constructor() {
    this.checkout = {
      sessions: {
        retrieve: async (id, options) => {
          const handler = globalThis.__f1StripeRetrieve;
          if (typeof handler !== "function") {
            throw new Error("printRetryResolveRace: no Stripe retrieve handler installed");
          }
          return handler(id, options);
        },
      },
    };
  }
}
