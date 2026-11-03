# #512 — implementation gate finding

2026-11-03; inspected main `c77b47a2`. Status: **blocked by an explicit programme fence, not implemented**.

Issue #512 requests the merged #511 design exactly, editor/render scope only, including its full proof plan. ASTRA_PROGRAMME retains the HD download fence. The merged design `docs/design/508-letter-spacing.md`, “Persistence, hydration and archive identity,” explicitly requires a separately approved compatible binding/renderer contract before nonzero tracking ships.

Evidence:

- `star-map-app-final/src/lib/mapRecipeFingerprint.ts:10` enumerates text-box fingerprint fields: text, size, fontFamily, color, align. A new per-row letterSpacingEm field would not affect the binding.
- `star-map-app-final/src/lib/downloadArchiveIdentity.ts:24` freezes fingerprint contract v1 and requires a version change when its inputs change; renderer version is also part of identity.
- The merged design forbids conditional fields under frozen v1 and globally reminting legacy identities. Its proposed new contract must be server-derived and preserve old archive/entitlement identity.
- #512 has no follow-up comments approving that cross-programme work. Its editor/render-only scope cannot complete the archive/identity test requirements without the fenced lane's work.

Shipping only a control/renderer change could render differently under the same saved binding. Adding identity behavior here would violate the brief. A hidden partial implementation is not the requested tested feature and would add unapproved maintenance surface.

## Required handoff to Jack / DL-1 owner

Approve and implement a compatible server-derived new binding/renderer contract for nonzero tracking in the gated lane, with legacy vectors, archive replay, and entitlement compatibility proved. Record the dependency resolution on #512, then resume editor/render implementation and execute the full #511 test matrix. No approval is inferred from merging a design document while the programme expressly retains its fences.

No code, contract/version constants, flags, secrets, production systems or data were changed. Other independent programme items can proceed.

## Evidence commands and results

From repository root:

- `git fetch origin main` — exit 0; main advanced to c77b47a2, including #509/#510/#511.
- `Get-Content docs/design/508-letter-spacing.md | Select-Object -Skip 65 -First 37` — confirmed identity gate and future proof plan.
- `Get-Content star-map-app-final/src/lib/mapRecipeFingerprint.ts | Select-Object -First 21` — confirmed enumerated fields.
- `Get-Content star-map-app-final/src/lib/downloadArchiveIdentity.ts | Select-Object -Skip 20 -First 16` — confirmed frozen contract and renderer version.
- GitHub read tools: issue #512 and all comments — issue open; no comments.
- `git diff --cached --check` — recorded in PR after staging.

No implementation or runtime tests run. None of the #511 proof matrix is claimed executed for #512. Prior #506/#507 checks are not evidence for this unimplemented feature.
