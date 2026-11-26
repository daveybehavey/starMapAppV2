# Merchandise safety release plan (#669)

Draft implementation only. No merge, deployment, provider setting mutation, order, charge, email or ad-budget change is authorized by this document.

## Behavior
- Checkout requires a successful STANDARD USD quote and a region for US/CA/AU. Invalid amounts/currencies, missing rates and timeout cannot become free shipping. Country remains locked in hosted Checkout. A changed province at Stripe is held for operator resolution before fulfillment.
- Merchandise sessions expire within 31–32 minutes (minute-bucketed for stable retry identity); recovery and hosted arbitrary promotion entry are disabled for merchandise because both bypass the original price/quote checks. Request reuse includes a merchandise version and separate region. Variant, country, currency and product options remain in existing identity.
- Merchandise contribution is checked at checkout, paid webhook and retry; actual Printful total is checked immediately before confirmation. Collected tax is excluded, processing/FX and replacement reserves are deducted. Existing catalog selling prices are unchanged.
- Provider draft ID is separate from confirmed printfulOrderId. A successful create is never proof of production. New drafts may confirm only when existing auto-confirm policy permits, provider identity/recipient agree, costs are done, and contribution passes. Confirmation is followed by GET readback. HTTP 200 alone does not indicate production.
- An unresolved/cost-pending/manual-review draft is retained and alerted as an operator problem; it is not marked sent or emailed as production-confirmed. No background polling job is added. Existing drafts are GET-reconciled only; they are never blindly re-created or auto-confirmed. After explicit operator review and manual confirmation, retry can bind the same observed confirmed identity. Existing dispatch claims and markers are never cleared by this patch.

## Required reviewed cost configuration before release
MERCH_VARIANT_COSTS_JSON is a JSON object keyed by exact Printful catalog variant ID. Each profile must explicitly contain USD cents productCents, providerTaxCents, processingFixedCents, replacementReserveCents and integer basis points processingBps, fxBps. Obtain conservative destination-appropriate figures from actual provider quotes and processor fees; include garment-size premiums. Zero values must be deliberate, not unknowns. Missing/malformed profiles block checkout. No real configuration or secrets are included here. Existing MERCH_MIN_MARGIN_CENTS floor is retained. The existing fixed CAD reference rate is used conservatively (revenue down, fees up); review its suitability before release.

Do not deploy this branch with an empty cost configuration and call merchandise sale-ready. It would deliberately close merchandise checkout. Verify each offered variant/destination with its reviewed configuration, and verify known paid legacy orders separately; missing quote/tax data is held, not invented.

## Stripe delayed payment event correction — separate approval gate
The handlers already support checkout.session.async_payment_succeeded and checkout.session.async_payment_failed. The audit reported that live subscriptions omit these events. The PR does not alter the live endpoint.
1. Export ONLY the existing endpoint event names into a local JSON string array (no keys or customer data).
2. Run node scripts/stripe-commerce-webhook-plan.mjs <event-list.json>. This is offline, has no credential loading and no mutation mode. It preserves existing refund/dispute/subscription events and adds missing checkout events.
3. After provider-setting approval, add the two delayed outcome events to the correct StarMapCo endpoint; do not replace its full subscription list or rotate its signing secret.
4. In an isolated test environment, deliver completed-unpaid, later success/failure, duplicate and out-of-order events. Verify no unpaid entitlement/production, one paid order, and preserved refund/revocation gates. Run existing printPaymentGate and printRetryPaymentGate tests first.
5. Verify signed deliveries and paid-to-order reconciliation after separately approved deployment. Do not replay real historical events or create test purchases in production under this task.

References: https://developers.printful.com/docs/v2-preview/ (create/confirm and asynchronous costs); https://docs.stripe.com/checkout/fulfillment.

## Review and remaining release gates
- Independent exact-head review, hosted CI and controlled staging proof required.
- Confirm operator alert destination and draft reconciliation procedure; manual attention is required when provider costs are not ready. This patch does not promise unattended completion of such drafts.
- Confirm v2 provider verification and status mapping against a nonproduction fixture. No physical proof was purchased.
- Check state-input usability on desktop/mobile, especially region changes and hosted cancellation; no live customer edits.
- Rollback must not re-enable unsafe merchandise selling. Disable merchandise offer availability through an approved config rollback before reverting safety guards; retain all draft identity/dispatch evidence for reconciliation.
