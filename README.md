# StarMapCo

**Custom star-map e-commerce application for creating personalized night-sky artwork and ordering digital or physical prints.**

StarMapCo combines a custom star-map editor with production e-commerce, fulfillment, recovery flows, SEO, and automated QA. The project is designed around a real customer journey: configure a map, preview the result, complete checkout, and receive a digital or fulfilled physical product.

## Highlights

- Interactive personalized star-map creation flow
- Customer-configurable location, date, styling, and print options
- E-commerce checkout and payment handling
- Printful fulfillment integration for physical products
- Checkout/session recovery and lifecycle handling
- Automated rendering, commerce, recovery, and unit-test coverage
- Pull-request based development with CI checks
- Accessibility and SEO hardening
- Structured product/shipping expectations and customer-facing ETA logic
- Production bug-fix and reliability work across the editor and checkout experience

## Engineering Focus

StarMapCo is more than a storefront. A significant part of the project focuses on making a highly stateful customization experience reliable in production.

Examples of engineering work include:

- preserving and recovering editor state
- validating render output
- protecting checkout and recovery flows with automated tests
- handling payment-session lifecycle events
- improving accessibility assertions and regression coverage
- maintaining CI checks for critical rendering and commerce paths
- adding structured SEO content and internal-linking improvements

## Quality & Testing

The project uses automated tests and CI to protect high-risk customer flows, including:

- editor state and recovery behavior
- commerce and checkout flows
- star-map rendering
- accessibility behavior
- webhook/session lifecycle handling

The repository also uses issues and pull requests to track production fixes, reliability improvements, and incremental feature work.

## Product

**Live site:** https://starmapco.com

StarMapCo supports personalized star-map products with both digital and physical fulfillment options.

## Project Status

Active production project. This repository demonstrates e-commerce development, stateful UI engineering, payment/fulfillment integration, automated QA, CI, accessibility, SEO, and production maintenance.
