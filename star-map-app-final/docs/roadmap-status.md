# StarMapCo Roadmap Status

Updated: 2026-04-12

This is the canonical operating roadmap for StarMapCo.

Use it to decide what to work on next without re-litigating priorities every time a new idea appears.

## North Star

Grow revenue by:

1. getting more qualified people into the funnel
2. converting more of them cleanly
3. adding adjacent revenue lanes only after the core path is working

## Decision Rules

When priorities conflict, use this order:

1. traffic
2. conversion
3. measurement
4. trust
5. adjacent revenue lanes
6. expansion

Only run three active lanes at once:

1. traffic lane
2. product and conversion lane
3. ops and measurement lane

Everything else stays queued unless it directly improves one of those lanes.

## Current State

- Product path is live: preview, digital checkout, print route, recovery, referral, lifecycle, ops
- Core measurement is live: funnel reports, commerce digest, loop scorecard, promo-source reporting
- Bulk lane exists but is intentionally dark
- Merchant feed exists and the Merchant API confirms both print offers are present and approved
- Traffic execution docs are ready, but posting has not started
- Real buyer volume is still low, so proof and lifecycle optimization are underpowered

## Active Now

### 1. Traffic activation

Why now:
- still the biggest bottleneck

Current assets:
- `docs/traffic-sprint-14-day.md`
- `docs/social-command-center.md`
- `docs/traffic-sprint-tracker.csv` (plan rows are pre-filled; add `date_posted` and metrics as each asset goes live)
- day-by-day post packs through day 14
- social promo offers and post pack

Definition of done:
- the first 14-day sprint is actually being executed
- posting is logged
- first winner and loser calls can be made from real data

### 2. Capture and source measurement

Why now:
- traffic only matters if capture surfaces and attribution are working

Current assets:
- homepage inline promo signup
- homepage promo jump CTA
- editor promo invite
- promo subscriber source reporting in ops and funnel views

Definition of done:
- new subscriber counts move above the current near-zero baseline
- top capture source is visible from reports, not guessed

### 3. Checkout quality monitoring

Why now:
- session inflation and anonymous Stripe noise were a real issue

Current assets:
- map-first checkout
- checkout intent gating
- replay protection
- live smoke coverage for the intent handshake

Definition of done:
- 3 to 7 clean days of post-fix production data
- a believable ratio between preview, checkout session creation, and paid verification

### 4. Inbound B2B handling

Why now:
- a single good bulk order matters more than many low-intent consumer visitors

Current assets:
- manual email workflow
- dark bulk quote route
- bulk quote intake API
- alerting and ops reporting

Definition of done:
- B2B inbound is handled cleanly
- the dark bulk lane is operationally ready to enable when needed

## Next Up

### 5. Merchant Center activation

Why next:
- Merchant feed, Merchant API checks, and `PRINT10` are ready
- the remaining step is manual promotion setup and account-side workflow discipline

Definition of done:
- `merchant:products:status` stays clean
- `PRINT10` can be run as the first US print promotion
- operator workflow is explicit enough that GMC is not a guess-based lane

### 6. Bulk lane soft launch

Why next:
- already built
- strong reuse of the existing product
- manual quoting preserves control and margin

Launch posture:
- enable route with `BULK_EVENT_ORDERS_ENABLED=true`
- keep `noindex`
- keep it out of navigation at first
- use it as a selective sales tool, not a homepage pitch

Definition of done:
- route is enabled intentionally
- alerting works
- one real request is processed end to end

### 7. Proof and trust publishing

Why next:
- trust compounds once real buyers exist

Definition of done:
- first approved proof items are published
- proof handling becomes repeatable, not ad hoc

### 8. Print merchandising refinement

Why next:
- print is already live
- framed vs unframed still needs stronger merchandising and buyer clarity

Definition of done:
- print options feel easier to understand
- print-specific confidence improves

## Later

### 9. Add-on and upsell expansion

Best-fit early expansion:

1. acrylic block or desk display
2. mini framed print
3. ornament
4. greeting card or insert
5. postcard or keepsake card set
6. keychain if quality is genuinely good

Current scored candidates:

- `Canvas (entry size)` currently scores `launch_ready`
- `Acrylic ornament (circle)` currently scores `test_limited` as a US-only seasonal candidate
- `Luggage tag` currently scores `test_limited`, but with weaker thematic fit
- `Greeting card (4x6)` currently stays `bundle_only`

Why later:
- expansion without traffic and conversion just adds surface area and ops load

Definition of done:
- one adjacent SKU is selected based on fit, margin, and fulfillment simplicity

### 10. Product line expansion

Rule:
- expand with emotionally coherent keepsake products first
- do not start with generic apparel
- do not force keychains or apparel into the roadmap before a strong supplier-quality and fit case exists

Lower-priority examples:

1. T-shirts
2. mugs
3. broad novelty merchandise

Definition of done:
- first expansion SKU is validated before broader catalog thinking

### 11. Paid amplification

Why later:
- paid should amplify proven winners, not subsidize confusion

Definition of done:
- at least two organic winners are clear enough to support paid tests

### 12. Partner and creator seeding

Why later:
- useful once there is clearer proof, better conversion, and stable fulfillment positioning

Definition of done:
- partner lane has an intentional target list and offer structure

## Much Later

### 13. Shop and catalog expansion

This means:

1. multiple physical SKUs
2. broader merchandising
3. more complex store structure

Do not do this before:

1. traffic is working
2. core conversion is working
3. at least one expansion SKU proves demand

### 14. App-store wrapper

Possible:
- yes

Priority:
- low

Reason:
- billing and store review complexity are real
- web still has more obvious unfinished leverage

### 15. Country expansion

Do not prioritize until:

1. current core market shows cleaner demand
2. fulfillment and channel performance are more predictable

## Not Now

Do not spend cycles on these right now:

1. fake testimonials
2. more referral plumbing
3. broad new feature lanes
4. generic apparel
5. country expansion
6. app-store work
7. paid ads without organic winners
8. random SEO work that ignores page-intent discipline

## Trigger Rules

Use these to move items forward.

### Move Merchant Center up when:

1. traffic posting has started
2. Merchant Center product approval is verified and `PRINT10` is ready to be activated

### Move bulk lane live when:

1. `npm run qa:bulk-launch-readiness` passes
2. there is a real inbound lead or deliberate outbound reason to use it

### Move proof publishing up when:

1. there are real approved proof assets to publish

### Move SKU expansion up when:

1. traffic is no longer near-zero
2. print and digital conversion are better understood
3. one expansion SKU has a clear fit and margin case

### Move paid ads up when:

1. at least two organic posts clearly outperform
2. landing page and checkout quality are stable enough to support spend

## Immediate Work Queue

This is the current order.

1. start traffic execution next week
2. read capture-source and checkout-quality data
3. activate `PRINT10` in Merchant Center when you are ready to use it
4. keep GMC checks on the operator path with `merchant:products:status`
5. keep the bulk lane dark but operationally ready
6. soft-launch the bulk lane when there is reason
7. publish proof when real approved assets exist

## Reference Files

- `docs/social-command-center.md`
- `docs/traffic-sprint-14-day.md`
- `docs/social-promo-offers-playbook.md`
- `docs/google-merchant-center-promotions-playbook.md`
- `docs/bulk-event-orders-playbook.md`
- `docs/loop-marketing-playbook.md`
- `docs/operator-quick-reference.md`
