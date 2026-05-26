# Proof intake runbook

How to handle real customer photos and quotes submitted after purchase (email, support inbox, or the in-app **PostPurchaseProofRequest** flow on `/success` and `/download`).

## Intake sources

1. **Post-purchase UI** — Customer clicks “Email support” or copies the draft from `PostPurchaseProofRequest` (includes order reference when available).
2. **Direct email** — `support@starmapco.com` (or the address in `getBusinessProfile()`).
3. **Blog / marketing** — Occasional replies to guides that invite proof (e.g. Valentine’s post); same rules apply.

## Triage checklist (every submission)

- [ ] Real buyer (order reference or Stripe session id when possible)
- [ ] Photo is theirs (not stock, not AI-generated without disclosure)
- [ ] **Written permission** to publish quote and/or image
- [ ] Occasion + product format clear (framed print, unframed, HD digital, etc.)
- [ ] No medical, legal, or misleading claims; no fake star ratings

Use the field checklist in [`docs/testimonial-intake-template.md`](./testimonial-intake-template.md) before adding anything to `src/data/testimonials.ts`.

## Response template (acknowledge)

```text
Thanks for sharing your StarMapCo map—we received your photo and note.

To feature it on the site we need your explicit OK to publish your quote and/or image with your first name (or initials) and occasion. Reply “yes, you may publish” with any name spelling you prefer.

We never publish without that confirmation.
```

## Publish workflow

1. Save permission email/thread (internal only).
2. Add approved quote to `src/data/testimonials.ts` per the template.
3. Add buyer photo under `public/testimonials/` only if image usage was approved.
4. Optionally add **permissioned buyer photos** to `public/testimonials/` or dedicated proof slots (never placeholder quotes).

## Marketing proof (no permission needed)

- **Printful catalog mockups**, **draft-order preview PNGs**, and synced files under `public/printproof/` are the default money-page proof (`FramedProofSection`, shop, homepage offer stack).
- Label them honestly (“mockup”, “preview render”) — this is preferred until permissioned customer photos exist.
- Refresh after catalog or artwork changes: `npm run assets:printproof` (requires Printful API env).

## Do not

- Fabricate quotes or attribute stories without permission.
- Publish full addresses, tracking numbers, or payment details from proof emails.
- Present Printful mockups or draft previews as **customer-submitted** or “verified buyer” photos.

## Related

- Component: `src/components/PostPurchaseProofRequest.tsx`
- Testimonial template: [`docs/testimonial-intake-template.md`](./testimonial-intake-template.md)
- Product queue: [`docs/PRODUCT_EXECUTION_QUEUE.md`](./PRODUCT_EXECUTION_QUEUE.md)
