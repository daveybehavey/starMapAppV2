# #222 — Print Checkout friction vs fulfillment requirements

**Lane:** Read-only conversion research  
**Date:** 2026-08-07  
**Guardrails honored:** No live Checkout sessions, no customer PII, no Stripe/Printful/production/code mutations.

## Goal

Determine whether physical-print Checkout collects more than Stripe payment + Printful fulfillment require, and identify the single safest friction reduction (or explicitly recommend no change).

## Implementation evidence (repo)

Primary sources:

- `star-map-app-final/src/app/api/checkout/route.ts` — `createCheckoutSession` session params
- `star-map-app-final/src/lib/printOrders.ts` — `getPrintRecipient`
- `star-map-app-final/src/app/api/stripe/webhook/route.ts` — shipping extract → Printful submit
- `star-map-app-final/scripts/create-qa-ops-checkout.mjs` — mirrors print collection params for QA

### Digital vs print (current code)

| Setting | Digital | Print |
| --- | --- | --- |
| `billing_address_collection` | `auto` | `required` |
| `shipping_address_collection` | off | on (`allowed_countries` from `PRINT_ALLOWED_COUNTRIES` / Printful shipping map) |
| `phone_number_collection.enabled` | `false` | `true` |
| `consent_collection.terms_of_service` | `required` | `required` (same) |
| `automatic_tax` | not enabled | not enabled |

Print also requires a shipping country before session creation (margin/shipping rate resolution). Product copy for print line items notes shipping address required.

### Fulfillment phone gap (critical)

`getPrintRecipient` builds the Printful recipient from Stripe shipping details but **hardcodes `phone: undefined`**. Print Checkout collects a required phone via Stripe, but the fulfillment path never forwards `customer_details.phone`.

## Provider evidence (official docs)

| Provider | Topic | Source |
| --- | --- | --- |
| Stripe | Billing address: default/`auto` collects only when necessary; `required` always collects full billing | [Checkout Session create — `billing_address_collection`](https://docs.stripe.com/api/checkout/sessions/create); [Collect physical addresses](https://docs.stripe.com/payments/collect-addresses?payment-ui=stripe-hosted) |
| Stripe | Shipping address: enable `shipping_address_collection` + `allowed_countries` when you need ship-to | Same collect-addresses doc |
| Stripe | Phone: optional; when enabled, field is **required**; docs: *“Only collect phone numbers if you need them for the transaction.”* Retrieved as `customer_details.phone` | [Collect customer phone numbers](https://docs.stripe.com/payments/checkout/phone-numbers.md?payment-ui=stripe-hosted) |
| Stripe | ToS checkbox: optional via `consent_collection.terms_of_service=required` (Dashboard Public details ToS URL required) | [Checkout Session create — `consent_collection`](https://docs.stripe.com/api/checkout/sessions/create) |
| Printful | Orders API: `recipient` required; examples use name/address1/city/state/country/zip; `phone` present in examples but API treats phone as optional/nullable | [Printful Orders API](https://developers.printful.com/docs/#tag/Orders-API) |
| Printful | Support: recipient phone **required for smooth delivery**; some countries (e.g. BR/MX/CL) also need tax/national ID (often address2) + phone/email | [Shipping address requirements](https://support.printful.com/hc/en-us/articles/41396629887761-Are-there-any-specific-requirements-for-shipping-addresses) |

**Tax note:** Repo Checkout does **not** enable `automatic_tax`, so forcing `billing_address_collection: required` is not justified by Stripe Tax minimum-field collection.

**Country note:** `data/printful-shipping.json` includes BR, MX, CL among ~74 shippable countries. Tax-ID collection is a separate fulfillment risk, not a friction-reduction candidate under this audit.

## Evidence table

| Field | Current behavior | Provider requirement | Evidence / source | Friction assessment | Recommendation |
| --- | --- | --- | --- | --- | --- |
| **Shipping address** | Print only; allowed countries; fulfillment reads Stripe `shipping_details` → Printful `recipient` | **Required for Printful fulfillment.** Required in Stripe when collecting ship-to. | Stripe collect-addresses + Checkout create; Printful Orders `recipient`; repo `getPrintRecipient` fails closed without line1/city/country/zip/name | High, justified for physical goods | **Keep.** Do not remove or defer. |
| **Billing address** | Print: `required`. Digital: `auto`. Not passed to Printful. | **Not required by Stripe for payment** (default `auto`). **Not used by Printful.** Not justified by `automatic_tax` (disabled). | Stripe `billing_address_collection`; Printful Orders has no billing field; repo checkout + recipient builder | **Print-only extra step** vs converting digital path; largely redundant once shipping is collected | **Reduce:** print → `billing_address_collection: "auto"` |
| **Phone number** | Print: enabled (Stripe makes field required). Digital: off. | Stripe: optional feature. Printful API: optional. Printful **support**: needed for smooth delivery / several country rules. | Stripe phone-numbers docs; Printful API + support article; repo hardcodes `phone: undefined` on recipient | Medium print friction; **collected but unused** by fulfillment | **Keep collecting.** Do **not** remove as a conversion lever. Separately wire phone → Printful. |
| **Terms acceptance** | Required on **both** digital and print | Not required by Stripe/Printful for payment/fulfillment; optional compliance control | Stripe `consent_collection.terms_of_service` | Low–medium; shared with digital (which converts) | **Keep for now.** Not the highest-confidence print-specific lever. |
| **Country tax/ID fields** | Not collected; BR/MX/CL still in shipping map | Printful support: required for some destinations | Printful support; `printful-shipping.json` | Fulfillment risk, not friction cut | Track separately if those destinations stay enabled |
| **Email / name** | Collected by Checkout; passed when present | Baseline for receipts/support; Printful email optional | Stripe `customer_details`; repo webhook | Not print-only | Keep |

## Non-claims

- No abandonment-rate causality from historical unpaid/expired print sessions (contaminated/ambiguous traffic per #222).
- Lower friction is not always better; shipping and phone remain justified for fulfillment.

## Digital vs print comparison (friction delta)

Print adds vs digital:

1. Shipping address — **necessary**
2. Phone — **justified for Printful/carriers** (but currently unused downstream)
3. Full billing (`required` vs `auto`) — **not necessary** for payment or Printful given current config
4. ToS — **same** as digital

## One ranked next action

**#1 (only high-confidence friction reduction):** Change print Checkout `billing_address_collection` from `"required"` to `"auto"` so Stripe collects billing only when necessary, matching digital. Leave shipping, phone, and ToS unchanged in that change.

**Do not recommend** removing phone or shipping as a conversion lever.

---

## Draft child implementation issue (description only — do not implement under #222)

### Title

Print Checkout: set `billing_address_collection` to `auto`

### Risk

Medium (customer-facing Checkout behavior). Human approval before merge.

### Why

#222 evidence — full billing is not required for Stripe payment (default/`auto`), not consumed by Printful, and is the clearest print-only redundant field vs digital. Repo does not enable `automatic_tax`.

### In scope

- In `star-map-app-final/src/app/api/checkout/route.ts`, for print sessions set `billing_address_collection: "auto"` (same as digital).
- Mirror in `scripts/create-qa-ops-checkout.mjs` if it must match production print params.
- Add/adjust unit or commerce-smoke coverage that asserts print session params use `auto` (no live Checkout creation beyond existing patterns).
- Document exact CI commands/results in the PR.

### Out of scope

- Removing phone collection or ToS checkbox.
- Pricing, shipping rates, Stripe/Printful Dashboard mutations, production deploy.
- Country tax-ID collection UX.
- Wiring phone → Printful (separate follow-up; keeps friction, fixes fulfillment).

### Acceptance

- Print Checkout sessions created by app code use `billing_address_collection: "auto"`.
- Shipping address + phone collection + ToS consent unchanged.
- Required CI validation passes; no production deploy from the child issue alone.

### Suggested separate follow-up (not this child)

Pass Stripe `customer_details.phone` through `getPrintRecipient` into Printful `recipient.phone` so collected phone is actually used for delivery.

---

## Issue comment delivery

Posting this table directly onto GitHub issue #222 failed with `GraphQL: Resource not accessible by integration (addComment)` using the Cloud Agent token. Please paste this README (or the evidence table + ranked next action sections) onto [#222](https://github.com/daveybehavey/starMapAppV2/issues/222), or provide `GH_ISSUE_COMMENT_TOKEN` with `issues:write`.
