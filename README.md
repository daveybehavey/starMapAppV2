<div align="center">

# StarMapCo

**Personalized star-map e-commerce application with a stateful editor, checkout, fulfillment, recovery flows, and automated QA.**

[Live Site](https://starmapco.com) · [EuroDigital Portfolio](https://eurodigital.ca)

</div>

---

## Overview

StarMapCo is a production e-commerce application for creating personalized night-sky artwork and ordering digital or physical prints.

The engineering challenge is not just the storefront: the product depends on a highly stateful customization flow that must preserve user choices, render reliably, survive navigation/recovery scenarios, and hand off correct data to checkout and fulfillment.

## Product Highlights

- Interactive personalized star-map editor
- Customer-configurable location, date, styling, and product options
- Digital and physical product workflows
- Checkout/payment integration
- Printful fulfillment integration
- Session and checkout-recovery handling
- Customer-facing shipping/ETA logic
- SEO and structured-content improvements
- Accessibility hardening
- Production bug fixes and reliability work

## Engineering Focus

A significant part of the project is dedicated to making the customization and commerce journey dependable.

- editor state preservation and draft recovery
- render-output validation
- checkout/session lifecycle handling
- recovery-email and abandoned-session behavior
- accessibility assertions and regression protection
- CI checks for critical rendering and commerce paths
- production incident fixes through issue/PR-driven development

## Quality & Testing

The repository maintains **100+ automated tests** across critical behavior, including:

| Area | Coverage focus |
| --- | --- |
| Editor | state, draft recovery, customer customization |
| Commerce | checkout and payment-related flows |
| Rendering | star-map output and smoke validation |
| Recovery | session lifecycle and recovery behavior |
| Accessibility | key interaction and regression assertions |

Pull requests and CI checks are used to protect production paths before changes are treated as ready.

## Customer Journey

1. Choose the date and location for the night sky.
2. Customize the visual design and product options.
3. Preview the resulting star map.
4. Complete checkout.
5. Receive a digital product or a physically fulfilled print.

## Production

**Live:** https://starmapco.com

The project demonstrates stateful UI engineering, e-commerce, payment/fulfillment integration, automated QA, CI, accessibility, SEO, and ongoing production maintenance.

---

<div align="center">

Built and maintained as part of **EuroDigital** product-development work.

</div>
