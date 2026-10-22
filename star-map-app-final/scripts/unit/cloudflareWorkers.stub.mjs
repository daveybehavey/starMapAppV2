/**
 * Minimal `cloudflare:workers` stub for plain-Node unit tests that import a
 * Durable Object class for real (see entitlementAuthority.test.mjs). Only
 * the DurableObject base class is provided; tests inject a fake
 * DurableObjectState (in-memory SQL) through the constructor.
 */
export class DurableObject {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
}
