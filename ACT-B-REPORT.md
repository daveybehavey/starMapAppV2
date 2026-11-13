# ACT-B — StarMapCo DARK wiring

Base: 62e82b74d0b86ffe98039935b7d389409d7ef149. Branch: feat/shared-send-cap-worker.

The combined final report, cross-brand concurrency proof, failure-name comparisons,
confirmation byte checks and Step C/D handoff are in the companion send-cap repo's
ACT-B-REPORT.md, included in qactb-sendcap.bundle.

The existing reserve/release/commit contract now uses SEND_CAP_SERVICE (future
StarMapCo service entrypoint), without a local fallback or a brand-side H.
Remote cap preflights precede the unchanged default-off activation fence.
The #644 post-reservation permission recheck remains; provider invocation always
charges the attempt. A fence closing during reservation releases before invocation.
The old in-Worker counter RPC is retained as dormant compatibility code: its null
constant still refuses, and no production counter client routes to it.

Final local commands (from star-map-app-final):

- npm run test:unit: 3121 tests, 3102 pass, 19 fail; failure NAME set exactly matches the recorded baseline.
- node --test scripts/unit/sharedSendCap.test.mjs scripts/unit/sharedSendCapNull.test.mjs scripts/unit/promotionSendCapUnset.test.mjs scripts/unit/promotionDispatchGuard.test.mjs scripts/unit/emailR03StageA.test.mjs: 75/75 pass.
- npm run lint: exit 0, 17 warnings, no errors.
- npm run typecheck: exit 0.
- npm run build: exit 0.
- npm run qa:smoke:commerce: 32/32 pass.
- npm run qa:smoke:render: 9/9 pass.
- npm run qa:smoke: final result is recorded in the combined report.

Environment: Windows PowerShell, Node 26.13.0 / npm 11.20.0, matching the recorded
baseline environment. Node 26 is outside this app's supported range; no GitHub
Actions run is claimed. #627 fence pins were unchanged; the pinned checkout and
promotion-policy blob test passes. Build-generated feed changes are excluded.

Local-only operator-authorized delivery. No push, PR, issue, merge, deployment,
production configuration/secret access, cap setting, fence activation or email send.
