# Accessibility notes

## Current posture (high level)

**Unverified by automated a11y scan in this doc cycle.** Treat statements as **review checklist**, not certification.

## Likely focus areas (inferred from product)

1. **Editor controls** — sliders, color/style pickers, drag handles for text: need keyboard alternatives or documented limitations with equitable fallbacks.
2. **Checkout / paywall modals** — focus trap, `aria-modal`, return focus on close, error announcements (`aria-live`).
3. **Marketing pages** — heading hierarchy, contrast on gold-on-navy palettes, motion reduction (`prefers-reduced-motion`) for star animations if any.

## Verification commands (suggested)

- Add or run **axe** / Playwright a11y assertions on critical paths (`/`, `/editor` or primary editor route, checkout modal if testable without real payment).
- Manual: VoiceOver (macOS) or NVDA (Windows) smoke on **purchase + download** path quarterly.

## Tracking

When issues are found, log here with **route**, **WCAG criterion**, **severity**, **fix PR link**.
