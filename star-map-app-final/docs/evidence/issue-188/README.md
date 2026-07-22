# Issue #188 — Post-preview CTA hierarchy evidence

## Parent

- Issue: #188
- Baseline: `main` @ `befa3db464a3fd39237c6ec4741cb52988897f6c` (#180 / PR #187 merged)

## Before inventory (print disabled)

See `inventory-before.md` and screenshots under `before/`.

### Finding

At every required viewport after preview, **two** primary-weight controls competed:

| Control | Treatment |
| --- | --- |
| Unlock HD / HD download | gold gradient (`from-amber-400 via-amber-500`) — intended primary |
| Customize more | solid amber (`bg-amber-400 text-midnight`) — competing primary-like |

Already secondary (unchanged): Free preview, Share, sticky Less options (neutral outline).

Sticky purchase footer (width &lt; 768 only; `EditorDrawer` is `md:hidden`): Less options (secondary) + Unlock HD / HD download (primary), inside `role="dialog"` / `aria-modal`.

### Sticky vs in-flow

| Context | Primary digital CTA | Notes |
| --- | --- | --- |
| Drawer closed | In-flow Unlock HD | Customize more competed visually |
| Drawer open (&lt;768) | Sticky Unlock HD inside dialog | #180 reachability model preserved |
| 768+ mobile force | No sticky drawer | Customize more still competed in-flow |
| Desktop | In-flow Unlock HD | Customize more competed in-flow |

## After change

Demote **Customize more / Less options (in-flow)** to the same neutral secondary treatment as Free preview / Share. Mark digital purchase CTAs with `data-cta-priority="primary"` and secondary actions with `data-cta-priority="secondary"`. No handler, pricing, analytics, checkout, or sticky a11y changes.

See `inventory-after.md` and screenshots under `after/`.

After inventory confirms **no competing primary-like controls** — Customize more is `neutral-secondary` at all required viewports; only Unlock HD / HD download uses gold-gradient primary.

## Handlers preserved

| Action | Handler / outcome |
| --- | --- |
| Free preview | `onExport("preview")` / `handleExport("preview")` → PNG download |
| Unlock HD (unpaid) | `onExport("hd")` / `handleExport("hd")` → paywall |
| HD download (paid) | same export path with credits/paid entitlement |
| Customize more | opens advanced / mobile `EditorDrawer` |
| Less options (sticky) | closes drawer; restores focus to in-flow Unlock HD (#180) |
| Share | `onShareImage` / `handleShareImage` |
| Save & Remix | `onShare` / `handleShare` (when advanced open) |
| Print & frame | existing paywall print intent (when print enabled) |
