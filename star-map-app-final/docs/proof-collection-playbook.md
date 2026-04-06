# Proof Collection Playbook

Use this when moving from mockup-based proof into real buyer proof.

## Goal

Collect real, permissioned customer proof without publishing fake testimonials or unlabeled stock-style material.

## What counts as publishable proof

- buyer quote with explicit permission
- buyer photo with explicit image permission
- support email confirming safe delivery or print quality
- unboxing or wall photo tied to a real order

## Publish order

1. Keep live Printful mockups on public pages as baseline proof.
2. Add real buyer quotes to `src/data/testimonials.ts`.
3. Add real buyer photos to `public/testimonials/` only after written approval.
4. Place the approved testimonial on the matching money page:
   - `personalized`
   - `gift`
   - `wedding`
   - `anniversary`
   - `nightSkyGift`

## Recommended operator statuses

- `new`: buyer allowed review, no follow-up yet
- `contacted`: asked for quote/photo or clarified permission
- `approved`: usable proof confirmed internally
- `published`: quote/photo now live on-site
- `rejected`: not usable, withdrawn, or insufficient permission

## Recommended post-purchase proof asks

Ask for:

- direct opt-in if the buyer is comfortable letting StarMapCo review the exact map for website examples
- one short sentence about the occasion
- whether they chose digital, unframed, or framed
- one photo of the finished piece if they are willing
- explicit permission to publish quote and image

## In-app note capture

Paid buyers can now save a short internal note from `/success` or `/download`.

- use it as a raw quote candidate, not publish-ready copy
- treat it as internal until publication permission is explicit
- use the proof-consent report to review note text before follow-up

## Placement rules

- put proof near the highest-friction purchase decision, not buried in the footer
- use framed proof on gift-heavy pages first
- keep quotes concrete: occasion + format + outcome
- do not rewrite a customer quote beyond trimming obvious typos

## File locations

- Quotes: `src/data/testimonials.ts`
- Intake template: `docs/testimonial-intake-template.md`
- Buyer photos: `public/testimonials/`
- Physical mockups: `public/printproof/`

## Do not do

- no invented testimonials
- no AI-generated customer quotes
- no unapproved customer images
- no star ratings unless backed by a real source
- no automatic publishing just because a buyer allowed review of the map
