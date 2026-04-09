# Bulk & Event Orders Playbook

## Status
- Route: `/bulk-event-orders`
- Launch state: dark
- Public gate: `BULK_EVENT_ORDERS_ENABLED=true`
- Current safety posture:
  - route 404s unless the env flag is enabled
  - page metadata is `noindex, nofollow`
  - route is not linked in navigation
  - route is not added to `sitemap.ts`

## Offer
Use one clear lane:

`Bulk & Event Orders`

Subline:

`Custom star maps for corporate events, memorials, weddings, and milestone gifting — quoted manually for 25+ pieces.`

Core promise:
- custom date and location setup
- subtle logo placement when needed
- one proof before production
- one revision round
- manual quote based on quantity, version count, and timing

## Positioning Rules
- Keep this as an assisted-sales lane, not a self-serve product.
- Lead with unframed for margin and fulfillment safety.
- Offer framed only by request.
- Support multiple versions, but quote them manually.
- Do not advertise instant bulk pricing.

## Page Structure
1. Hero
- manual sales lane
- headline focused on events, teams, memorials, and milestone gifting
- CTA: `Request a custom quote`

2. Best-fit use cases
- corporate events
- memorial keepsakes
- wedding runs
- milestone events

3. Included scope
- custom date and location setup
- subtle logo placement
- manual quote
- proof before production
- unframed-first recommendation

4. Quote request form
- name
- email
- company / organization
- order type
- quantity
- distinct versions
- event dates
- map location
- preferred format
- size
- deadline
- shipping destination
- branding request
- notes

5. FAQ
- minimum quantity
- multiple versions
- logo placement
- framed vs unframed

## Pricing Guardrails
For manual quoting, use this as the internal ladder for unframed projects:

- Anchor: `$32 each + shipping`
- Target: `$29 each + shipping`
- Floor for multiple-version runs: `$26 each + shipping`

Do not quote below the floor unless there is a deliberate strategic reason.

Always confirm:
- quantity
- version count
- size
- final destination
- deadline

before giving a hard final quote.

## Operational Rules
- Store requests in KV under the `bulk:quote:` prefix.
- Send an alert to support when a request is received.
- Default internal status progression:
  - `new`
  - `contacted`
  - `quoted`
  - `won`
  - `lost`
  - `archived`

## Ops Commands
- `npm run ops:bulk-quotes`
- `npm run ops:bulk-quotes -- --json`
- `npm run ops:bulk-quotes -- --limit 100`

## Response Templates
- `docs/bulk-quote-email-templates.md`

## Launch Checklist
Before enabling the route:
- confirm `BULK_QUOTE_ALERT_FROM` and `BULK_QUOTE_ALERT_TO`
- confirm Resend or SendGrid is configured
- test one request in a non-production environment
- decide whether to keep `noindex` for soft launch or remove it for full launch
- add navigation or CTA entry only when ready
