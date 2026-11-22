# Etsy already-paid customization — design / specification (draft)

Status: local specification + mock prototype only.  
Not authorized for production payment, auth, fulfillment, listing edits, or customer messaging.  
Muse owns live order readiness. Do not include real customer PII in commits or proofs.

## Problem

Etsy buyers who already paid for a framed print still land in the ordinary editor, which shows purchase/checkout actions. Staff currently guide them through Save & Remix over Etsy Messages. That path works but is error-prone (wrong size, accidental checkout, unclear unknown-time handling, no versioned proof record).

## Goals

1. Order-specific access for an already-paid Etsy purchase (tokenized invitation; sample data in the mock).
2. Purchased square size locked (14×14 framed in the sample).
3. No checkout / purchase / HD paywall buttons in this flow.
4. Explicit unknown-time choice (distinct from clearing the time field).
5. Versioned proof + buyer approval before any print prep.
6. One fulfillment attempt per original Etsy order id.
7. Staff cost review gate before supplier order (out of mock scope beyond UI stub).

## Non-goals (this prototype)

- Live Etsy / Printful / Stripe integration
- Real auth, secrets, or customer data
- Production discounts, 100% coupons, or a second checkout representing the Etsy sale
- Automatic printing, messaging, or deployment

## Sample order (synthetic)

| Field | Sample value |
| --- | --- |
| Invitation token | `mock-etsy-invite-001` |
| Etsy order ref | `SAMPLE-ETS-0000` |
| Product | 14×14 framed print (square locked) |
| Frame color | pending buyer choice (sample: black) |
| Occasion date | 2026-02-25 |
| Place | Redwood City, CA (sample coords only) |
| Time | unknown → buyer must choose explicit time or “I do not know the time” |
| Status | `awaiting_design` |

Unknown-time product rule for this prepaid flow (proposal): when the buyer selects “I do not know the time”, store an explicit `timeUnknown: true` flag and apply the **listing-agreed fallback** (Etsy listing currently says 10 PM; editor default elsewhere is 9 PM). Do not silently equate “cleared time field” with “unknown.” Owner must approve the fallback rule before implementation.

## Flow

```
Invitation link
  → Already paid banner + locked size
  → Date / place / time (or explicit unknown)
  → Customize design (square only; no checkout)
  → Submit design for approval (creates proof vN)
  → Buyer reviews watermarked proof
  → Approve / request changes
  → Staff: verify proof, cost, frame, one fulfillment
```

## UI requirements

- Persistent “Already paid — Etsy order SAMPLE-…” banner
- Size control disabled / locked to square 14×14
- Primary CTA: **Submit design for approval** (not purchase)
- Hide: checkout, HD unlock/pay, pack offers, print add-to-cart
- Time UI: clock input **or** checkbox/radio “I do not know the time”
- Proof history: v1, v2… with timestamps and approve/reject
- After approval: read-only buyer view; staff-only fulfillment panel (mock)

## Local mock

Static mock (sample data only):

`docs/proofs/etsy-prepaid-mock/index.html`

Open the file in a browser. No server, secrets, or network writes required.

## Acceptance for a future implementation PR (not this draft)

- Isolated route/feature flag; noindex
- Unit tests for locked size, hidden checkout, unknown-time flag, proof versioning
- Synthetic fixtures only
- Separate human approval before any production wiring
- Muse sign-off on order-readiness gates; owner approval before print

## Decision needed from owner

1. Unknown-time fallback for prepaid Etsy: keep listing **10 PM**, align editor to 10 PM for this flow only, or change listing to 9 PM?
2. Approve proceeding to an isolated implementation branch after mock review (still no production wiring)?
