# Programme queue

## 2026-11-10 — Email R-03 Stage A, U1–U3

- Authorization: Jack's 2026-11-10 job setup; governing ratified spec 2026-11-06.
- Branch: `feat/email-r03-stage-a`; implementation revision `155ce082dc63650952ae71ee1a3b84136270cbb2`; no PR per operator instruction.
- Gate evidence: [Stage A report](docs/evidence/email-r03-stage-a-2026-11-10/REPORT.md).
- Stage A: implementation and offline AT-5 harness built; receipt delivery held. Independent review / merge gates remain pending. Final suite: 2790 tests, 2774 pass, the same 16 baseline failures; 12 new Stage A tests pass. Lint/typecheck/build pass. See report for before/after and retained failed runs.
- Stop-the-line: RB-1 NOT PASSED. AT-1–AT-4 and AT-6 NOT RUN because later stages are blocked. No reliance or sends authorized. Receipt credential and live delivery integration are unavailable until U4/activation.
- Existing blocker: source lacks the specified H-unset dispatch check. Spec §1.2 forbids changing the fence; direction requested, fence unmodified. Do not treat the required GC-2 invariant as proven.
- Next stage: Stage B / U4 awaits David's Q-D2 lookup-scope decision. U5–U7 remain out of scope; no retention or erasure acceptance assumed.
- Legacy 68: untouched; no access, migration, backfill, reissue or reliance.
