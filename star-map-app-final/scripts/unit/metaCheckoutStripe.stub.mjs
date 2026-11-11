export default class Stripe {
  constructor() {
    globalThis.metaCheckoutStripeCalls = (globalThis.metaCheckoutStripeCalls ?? 0) + 1;
    throw new Error("Meta adapter must never instantiate Stripe");
  }
}
