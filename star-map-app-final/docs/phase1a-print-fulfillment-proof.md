# Phase 1A print fulfillment — canonical proof record

**Status (2026-06-11):** `Historically proven + current pre-payment proof passed`

No additional paid print test is required at this stage. Watch the in-process framed order below rather than placing another order.

## Conclusion

The store can sell and fulfill prints. Post-payment automation is proven on live paid orders for both variants. Current checkout wiring (variants, shipping metadata, Printful store, manual confirm) matches the historical success path.

**Not yet symmetric:** the current framed proof order is in Printful production / shipment started but not yet `fulfilled` with a delivered tracking number. That gap does not block Phase 1A sign-off.

---

## Accepted proof — unframed (strongest)

Paid customer order, end-to-end fulfilled and shipped.

| Field | Value |
|-------|-------|
| Stripe Checkout session | `cs_live_b1SMZnwizGDOHJAlX86rCGxyH2b2au2pNugxoHTfu9gyOhAoB4t2JJzIrh` |
| Paid | 2026-06-04 — **$53.62** USD ($49.00 + $4.62 US shipping) |
| Stripe webhook | `checkout.session.completed` — `evt_1TeQx3LWqD0o9865POccWpLx` |
| KV print order | `status: sent` |
| Print variant | `poster_unframed` → Printful **6242** |
| Printful order ID | **161064930** |
| Printful status | **fulfilled** (manually approved under `PRINTFUL_AUTO_CONFIRM=false`) |
| Shipment | DHL Globalmail — tracking **9261290389122501484125** |
| Ops alert | Resend — success |

Verify anytime:

```bash
npm run qa:print-ops -- --hours 8760 --limit 200
# or admin:
# GET /api/print/orders/status?session_id=cs_live_b1SMZnwizGDOHJAlX86rCGxyH2b2au2pNugxoHTfu9gyOhAoB4t2JJzIrh
```

---

## Accepted proof — framed (post-payment path)

Paid customer order through Printful production; fulfillment still in progress.

| Field | Value |
|-------|-------|
| Stripe Checkout session | `cs_live_b1OukUkmbrE4VT2xE3az7TJGBDkeMlLL2vYXwUCOSMoOdJ0kiDt4H6YvUL` |
| Paid | 2026-06-05 — **$115.77** USD (framed $99 + $9.77 shipping + digital add-on) |
| Stripe webhook | `checkout.session.completed` — `evt_1Tez7WLWqD0o9865mBfUyrf0` |
| KV print order | `status: sent` |
| Print variant | `poster_framed` → Printful **4654** |
| Printful order ID | **161276125** |
| Printful status | **inprocess** — printed, shipment **started** (no tracking yet) |
| Ops alert | Resend — success |

**Action:** monitor Printful order **161276125** until `fulfilled` + tracking appears. Do not place another paid framed test for Phase 1A.

Secondary framed references (not primary paid-customer proof):

- QA $0 framed draft: session `cs_live_a1EnKJwaib17lZjV8I0xOkVx9u3csBHY3AiD2DWNR16rmPzMgp8YSdXWZK` → Printful **160067183** (manifest proof image source)
- Manifest unframed catalog proof order: Printful **150176377** (draft; no Stripe session)

---

## Current config (matches historical path)

| Setting | Production value |
|---------|------------------|
| Printful store | **17779767** (StarMapCo) |
| Unframed variant | **6242** (18″×18″ poster) |
| Framed variant | **4654** (14″×14″ black frame) |
| `PRINTFUL_AUTO_CONFIRM` | **`false`** — draft → manual approve in Printful |
| `PRINT_ORDER_SUBMISSION_ENABLED` | **`true`** |
| US unframed shipping (checkout metadata) | **462¢** |
| US framed shipping (checkout metadata) | **977¢** |

Source of truth: `wrangler.toml` + live checks below.

---

## Current pre-payment proof (no charge)

Run after env is loaded (`STRIPE_SECRET_KEY`, Printful vars):

```bash
npm run qa:printful
node scripts/phase1a-2b-unframed-proof.mjs
```

**Last verified (2026-06-11):**

- `qa:printful` — PASS (store + variants 6242 / 4654)
- `phase1a-2b-unframed-proof.mjs` — **18/18 PASS** (checkout session, metadata, shipping; no payment)

This proves checkout → Stripe session wiring. Post-payment is covered by historical orders above.

---

## Config drift check (2026-06-11)

No material drift in the print submission path since the Jun 4–7 successful orders:

- Webhook → `queuePrintOrder()` unchanged in substance
- Print asset route `/api/print/assets?id=` served 200 on recent orders
- Variant IDs and auto-confirm unchanged in `wrangler.toml`

---

## Do not do (Phase 1A print)

- Do **not** create another paid print order unless a regression is found
- Do **not** change Printful settings or enable auto-confirm
- Do **not** change pricing or checkout for proof purposes

---

## StarMapCo status snapshot

```text
Homepage: done
Policies/shipping truth: done
Digital checkout/download: live proven
Unframed print: historically fulfilled + current pre-payment proof passed
Framed print: historically post-payment proven + in production
Another paid print test: not needed right now
```

---

## Next Phase 1 focus

**Customer communication + print order status visibility** — implemented in Layer A+B+C1 (success timeline, confirmation email, tracking webhook index). Layer C2 (public order-status page) deferred.

Related runbooks: `docs/print-ops-runbook.md`, `docs/operator-quick-reference.md`.
