# Issue #188 — Post-preview CTA inventory (before)

Captured against production (`https://starmapco.com/editor`) and local `main` at `5d057e3` (includes merged #180).

## Access notes

- Production editor: read-only browser session succeeded (sample moment → preview).
- PostHog MCP: **needsAuth** — funnel/analytics evidence for CTA competition rates was not available. Decision proceeded from production visual inventory + code inspection.
- TierZero MCP: **error / unavailable** — no production telemetry assist for this task.

## Competing primary problem (before)

At mobile 375 and desktop 1280, both **Unlock HD** and **Customize more** used solid/gradient gold primary treatments. Free preview and Share used neutral secondary treatments. Print & frame (desktop) used amber-soft secondary. Physical gift panel CTAs use amber recommendation styling below the action row.

### Mobile post-preview (in-flow)

| Order | Label | Treatment (before) | Handler / outcome | Sticky duplicate |
| --- | --- | --- | --- | --- |
| 1 | Free preview | neutral secondary | `onExport("preview")` | no |
| 2 | Unlock HD | **primary gold** | `onExport("hd")` → paywall when unpaid | yes, when Customize more opens (`mobile-sticky-unlock-hd`) |
| 3 | Customize more | **primary gold (competes)** | toggles advanced drawer | Less options in sticky bar |
| 4 | Share | neutral secondary | `onShareImage` | no |
| — | Save & Remix | neutral secondary (when advanced open) | `onShare` | no |

### Desktop post-preview

| Order | Label | Treatment (before) | Handler / outcome |
| --- | --- | --- | --- |
| 1 | Free preview | neutral secondary | `handleExport("preview")` |
| 2 | Unlock HD | **primary gold** | `handleExport("hd")` |
| 3 | Print & frame | amber-soft secondary (when print enabled) | opens print paywall intent |
| 4 | Customize more | **primary gold (competes)** | `handleCustomizeMore` |
| 5 | Share | neutral secondary | `handleShareImage` |
| 6 | Save & Remix | neutral secondary (after customize) | `handleShare` |

## Evidence

- `/opt/cursor/artifacts/issue-188-before/prod-mobile-375-initial.png`
- `/opt/cursor/artifacts/issue-188-before/prod-mobile-375-customize.png`
- `/opt/cursor/artifacts/issue-188-before/prod-desktop-1280-initial.png`
- `/opt/cursor/artifacts/issue-188-before/prod-desktop-1280-full.png`

## Intended after hierarchy

1. Sole digital primary: Unlock HD / HD download (gradient gold + `data-cta-priority="primary"`).
2. Customize more / Less options / Free preview / Share / Save & Remix: neutral secondary (`bg-white/10`).
3. Print & frame remains amber-soft secondary (`data-cta-kind="print-purchase"`), not digital primary.
4. When mobile customize drawer is open, only sticky Unlock HD carries `data-cta-priority="primary"`; in-flow purchase row is `inert`.

## Related fix included

Unpaid HD export opened the paywall via an early return that left `hdExportInFlight` stuck `true`, so a second Unlock HD click was a no-op. The in-flight flag now clears in `finally` so the dominant purchase CTA remains repeatable (handlers/analytics unchanged).
