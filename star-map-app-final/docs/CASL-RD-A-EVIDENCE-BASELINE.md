# CASL RD-A — Evidence baseline, requirements model and gate reconciliation

**Slice:** RD-A (first slice of the RD-A…RD-K re-derived build plan, S49-6).
**Status:** Register filed with the RD build. This document is the
reviewable basis every later RD brief cites. It records what governs,
what superseded what, what has been decided, and what is still open —
without presenting missing material as recovered.
**Authorization on record:** David authorized the RD build on
2026-10-31. Build only: this register authorizes no subscriber send,
no activation, and no configuration change. Go-live remains behind
the later gates listed in §8.

## 1. Governing basis (PBO-13R)

PBO-13 (restore the truncated design sections and brief against the
restoration) was **retired as written** by the B1 amendment round §4
and replaced by **PBO-13R**: the build is briefed against the
replacement basis, which consists of —

| # | Basis element | Identity |
|---|---|---|
| (a) | Surviving design of record §§1–3 and §4 fragment | Preserved unmodified as evidence; the §4 fragment's SQLite-sketch model is **superseded** (see §3) |
| (b) | A1 as amended by A2 | A1: `starmap-email-design-amendment-2026-10-23.md` (sha256 `23dacbc3…`); A2: `starmap-email-design-amendment-v2-2026-10-23.md` (sha256 `ad3292c9…`) |
| (c) | B1 amendment round (AM-01…AM-20, B1A-MODEL) | `casl-b1-amendment-round-2026-10-30.md`, 2026-10-30 (sha256 `9fe5eb2b…`) |
| (d) | RD-A…RD-K re-derived slice plan | S49-6 (2026-10-29), explicitly a re-derivation, not a reconstruction of the lost §5 |
| (e) | Owner decisions | `casl-owner-decisions-2026-10-29.md` — all seven ANSWERED 2026-10-29 (§6) |

Later governing acts layered on that basis:

| Date | Act | Effect |
|---|---|---|
| 2026-10-31 | Finding 4 closure filing accepted (B2 repair round) | Review deadline composition is normative: `D_review = min(eligibilityEndsAt, firstDispatchAt + 23h)`, `D_flow = D_review`, `D_effective = min(D_review, D_window)`; `firstAttemptAt` is created once, atomically with the durable provider-invocation admission. **Review dispatching is never reclaimed; ambiguous outcomes are terminal-uncertain, never retried; reconciliation does not authorize another send.** |
| 2026-10-31 | CASL readiness ruling (gate chair) | The whole-round paper-readiness HOLD is closed. RA-4's **conservative branch is operative** (no receipt horizon assumed). The ruling authorizes no build/send/activation by itself; the six later gates in §8 stand. |
| 2026-10-31 | RD build authorization (David) | The build may proceed slice by slice under the programme's gates. Sends, activation and configuration flips toward live are **not** authorized. David reviews the first welcome email before any send (FW checkpoint, §8). |
| 2026-10-31 | Gate-1 fencing build (PR #454, draft) | Implementation evidence toward later gate 1: the shipped promotional transport now refuses at dispatch time without authority permission (see §5). |

**Governing order** (per S49-6): A2 → standing A1 → original design,
with the owner decisions updating decision status, AM-01…AM-20 and the
2026-10-31 rulings layered as recorded above. Where a later act
supersedes an earlier passage, §3 names the supersession; nothing in
this register silently resolves a conflict the sources leave open.

## 2. Requirements matrix

Every operative requirement below names its governing passage.
Clause identifiers are those of the basis documents (A1/A2 clause
numbers, B1 amendment numbers). "Owner" = the slice whose build must
satisfy the requirement (per S49-6's coverage cross-check and B1 §5).

### 2.1 Authority and identity

| Requirement | Governing passage | Owner |
|---|---|---|
| One per-email coordinator object is the sole ordering point for that identity's consent and projection; no second consent store, no KV authorization | A1 C-1…C-3; INV-1 | RD-B |
| Coordinator identity is `promotion:v1:<sha256(normalized address)>`; normalization is full-address trim + lowercase, dots and tags preserved; no alias folding, no consent transfer between addresses | A1 C-3; RD-B acceptance | RD-B |
| Every path that creates or re-creates a contact identity passes through the coordinator's creation transition, which consults tombstones first (GM-7D single creation gate) | AM-08 (GM-7D) | RD-C/RD-E |
| Address identity and message purpose are classified in the authority, not at call sites | A1 P-1/P-2; RD-B acceptance | RD-B |

### 2.2 Consent generations and tokens

| Requirement | Governing passage | Owner |
|---|---|---|
| Generation increments only on committed unsubscribe or completed re-consent; artefacts of older generations are inert | A1 G-1/G-2; INV-2 | RD-D |
| Confirmation (double opt-in) mail: transactional-class quota charge, frequency-exempt, exactly one live confirmation per pending request, dedupe per G-6; a pending request created after a global suppression is not created at all | AM-09 (A1 §5 table row); INV-11 | RD-D |
| Stale-token replay returns the recorded confirmed/expired/superseded result — without new consent, generation advancement, or welcome issuance (A1 T-1 behaviour stands; the readiness ruling confirms it governs) | A1 T-1; readiness ruling 2026-10-31 | RD-D |
| Once-ever welcome/coupon history survives generations | A1 G-4; AM-09 acceptance in readiness ruling | RD-D/RD-K |

### 2.3 Suppression, tombstones, retention

| Requirement | Governing passage | Owner |
|---|---|---|
| Global, review-only and deliverability suppressions are three distinct records; purchases and service actions cannot clear marketing suppression | A1 P-3; B1A-MODEL §3.1 | RD-B |
| Every unsubscribe entry point commits through the authority before reporting success; strict projection failure surfaces as a retryable failure without reversing the committed suppression | RD-B acceptance | RD-B |
| A tombstone contains exactly GM-7A's six fields (`keyedDigest`, `digestKeyVersion`, `generation`, `terminalEventClass`, `terminalAt`, `authorityId`) and nothing else — no address, token, content, or free-text reason | AM-05 (GM-7A) | RD-C |
| Tombstones are retained **without scheduled expiry**; deletion only by a recorded owner decision accepting resurrection risk; no automated expiry job | AM-06 (GM-7B(a)); OD decision 6; **period acceptance awaits GC-1 (§7)** | RD-C |
| Address and message content are deleted at the unsubscribe/erasure transition itself; erasure completes when the transition commits and the projection repair sweep converges | AM-06 (GM-7B(b)) | RD-C/RD-E |
| Digest-key lookup tries every non-retired key version, current first; rotation re-keys nothing in place; retirement only after a re-keying sweep or a recorded gate acceptance | AM-07 (GM-7C) | RD-C |
| Reconstruction consults tombstones before assigning generation 1; a hit creates the identity already-suppressed at tombstone generation + 1 | AM-08 (GM-7D); INV-7 | RD-C |

### 2.4 Allocator, quota and frequency

| Requirement | Governing passage | Owner |
|---|---|---|
| No commercial dispatch without both a U-3 coordinator claim and allocator quota + frequency reservations, joined by logical-send identity | A1 Q-3/Q-3C; INV-3 | RD-F/RD-I |
| Frequency caps: max one email per 72h, max 3 per 30 days, **per person**; the caps bind every frequency-counted P-2 class; transactional/service sends are exempt (the table the decisions were taken against); confirmation mail exempt per AM-09 | OD decision 2; AM-14 (P-2A); AM-09 | RD-I |
| Frequency subject: an identity by default; two identities share a subject only under a person link created from the three Q-3A evidences (same account ID ceremony, same Stripe customer ID on paid orders, express linking ceremony). Links move counts only — never consent, suppression, generations or eligibility | AM-13 (Q-3A…Q-3E); INV-8; **definition ratification awaits GC-2 (§7)** | RD-I |
| Until GC-2 ratifies Q-3A, no artefact may claim "per-person enforcement" (INV-12); the accurate claim is per-identity enforcement with evidenced person-link aggregation, ratification pending | AM-13 (Q-3E) | RD-I |
| Transactional headroom H is derived by the Q-4(e) formula from PBO-1/PBO-3 evidence, recorded with its inputs, a configuration value never a code constant; **until GC-2 adopts the formula, H stays unset and an unset H refuses all commercial admission (fail-closed) while transactional admission proceeds** | AM-15 (Q-4(e)) | RD-I |
| Exhaustion behaviour: queue silently — a queued send confers no authorization, re-runs full admission at the head of the queue, and ends in exactly one recorded terminal state (`sent` or `expired_not_sent`) | OD decision 7; AM-16 (Q-6/Q-7); INV-9/INV-10 | RD-I/RD-H |
| If the PBO-1 inventory finds any uncontrolled sender on the account, the allocator's guarantee degrades to a managed budget from the moment the inventory is recorded, and the degradation is surfaced to David before any commercial send relies on the allocator | AM-03 (Q-5); conditional gate GC-3 (§7) | RD-F |
| RA-4 accounting under the conservative branch: later possible consumption buckets, aggregate exposure, atomic boundary protection, no duplicate charging; execution evidence must cover multiple invocations, partial resolution, repeated boundary processing, and charge/debt coalescence | A2 RA-4 as repaired by the two-repair filing accepted 2026-10-31; readiness ruling gate 2 | RD-F/RD-H |

### 2.5 Provider-call fencing and retry identity

| Requirement | Governing passage | Owner |
|---|---|---|
| One provider key per logical send, minted once, never re-minted | FC-0/FC-5; INV-5 | RD-G |
| The fencing guarantee is expressly conditional on PBO-3 provider evidence (window W and payload-equality); the build reads W from the PBO-3 intake memo, never from the design's 24h assumption; if PBO-3 can establish no dedupe guarantee, no governed send path may be built until the gate rules on a replacement fence | AM-02 (FC-10) | RD-G |
| Call-start gate: immediately before invoking the provider, the driver re-evaluates on server time that its attempt is still current and `now < firstAttemptAt + W`; a driver delayed arbitrarily between check and call start records zero provider calls when the gate fails | AM-12 (FC-6A) | RD-G |
| The promotion path is retrofitted to attempt-bound completion in the same build that introduces lifecycle sends | AM-04 (FC-4 as replaced) | RD-G |
| Deadline composition: effective deadline = `min(D(flow), firstAttemptAt + W)`; the review flow's D is 23 hours; neither bound extends the other | AM-17 (FC-5A); Finding 4 closure (§1) | RD-G/RD-J |
| **Review dispatching is never reclaimed; ambiguous outcomes are terminal-uncertain and never retried; reconciliation supplies no send authority** | Finding 4 closure 2026-10-31 (normative for all RD slices) | RD-J/RD-G/RD-H |

### 2.6 Migration and projection

| Requirement | Governing passage | Owner |
|---|---|---|
| Legacy import is monotone and insert-if-absent against live coordinator state; import stays open until legacy facts are complete | A1 GM-3/GM-4 (as built in the shipped coordinator) | RD-E |
| Projection single-writer rule: for each identity, only that identity's coordinator object writes its KV projection key (committing transition or its own PR-2 repair sweep); the projection key prefix may be constructed only inside the coordinator module (FC-8-style source gate) | AM-10 (GM-5A) | RD-E |
| Projection versions strictly increase per identity; a delayed retry inside the same object is rejected by the version check against the object's own last-written version before the KV call | AM-10 (GM-5B); INV-6 | RD-E |
| The projection carries derived effective suppression, never a bare timestamp presented as state | B1A-MODEL §3.4 | RD-E |
| PBO-6 production-shaped rehearsal is RD-E's own acceptance evidence, produced during the build | B1 §5 (RD-E row) | RD-E |

### 2.7 Review integration

| Requirement | Governing passage | Owner |
|---|---|---|
| The review claim ledger and the suppression coordinator remain the review path's authorities; review sends occur only behind the suppression DO's single provider-call door (as shipped) | A1 C-4; shipped design (PR #368/#446) | RD-J |
| At build intake, file `intake/review-activation-evidence-<date>.md` linking the programme records of the 2026-10-26 activation, its flag states, the no-retry-on-ambiguity approval, and the §9 live-proof outcome — or recording per item that no record exists. A missing record blocks only the review-integration acceptance that relies on it | AM-18 | RD-J |
| Historical "review-inert" statements in the design documents are dated context only and are never cited as current state (§5 of this register) | AM-18; RD-A acceptance | RD-J |

### 2.8 Welcome and deferred flows

| Requirement | Governing passage | Owner |
|---|---|---|
| The welcome honours FIRST50 for early subscribers | OD decision 1 | RD-K |
| Homepage confirmation + exactly one welcome per identity ever | A1 L-1; S49-6 coverage | RD-D/RD-K |
| The first welcome is gated by the FW-CHECKPOINT (FW-1…FW-6): evidence pack, David's recorded review against the creative hash, no welcome send (including any list-address test) before that approval, 30-day/footer-change refiling | B1 §6; OD decision 5 | RD-K (go-live) |
| Jack owns every date stated in email, verified against Printful's real cutoffs; no artefact may state an unverified date | OD decision 4; INV-12 | All slices |
| No Christmas ceiling is required for the lean release (A1 L-2 excludes occasion/cross-sell/abandonment flows); before any later-flow brief is issued, DF-1 requires Jack to derive the then-current seasonal ceiling from PBO-3 facts, the PBO-1 inventory and Printful's verified cutoffs, recorded in that brief | AM-19 (DF-1) | Later flows |
| Gift/memorial capability, when built, must satisfy DF-2 (a)–(e) as acceptance criteria in its own brief: finished rendered creative; visual-check evidence pack filed before any send is enabled (for memorial creative the reviewer is David or his named reviewer); memorial content structurally unaddressable to the StarMapCo list and to any general sales blast; purpose classification fails a blast containing memorial content for a general audience; every stated date verified by Jack against Printful before the visual check | AM-20 (DF-2); OD decision 3 | Later flows |
| Gift-occasion messaging is approved; memorial messaging only on OurImprint's own list, gently, visually checked before any send; no memorial content in general sales blasts | OD decision 3 | Later flows |

## 3. Amendment supersessions (AM-01…AM-20)

Each B1 amendment replaced or inserted the cited passage; the
amended text governs. "Discharges" names the earlier open item the
amendment closed.

| AM | Subject (slice) | Operative effect | Discharges |
|---|---|---|---|
| AM-01 | Implementable model (RD-A) | B1A-MODEL (B1 §3) is the implementable model; a build brief cites it field-for-field; a field a builder believes missing is raised as a brief defect before coding, never invented in code | RD-A's INSUFFICIENT-model bullet (replaced) |
| AM-02 | Provider dedupe conditionality (RD-G) | FC-10: fencing guarantee conditional on PBO-3 evidence; W read from intake, never assumed | A2 residual R-1 |
| AM-03 | Uncontrolled account senders (RD-F) | Q-5: managed-budget degradation codified, triggered only by a PBO-1 finding | A2 residual R-3 (consequence codified; the ruling itself is conditional GC-3) |
| AM-04 | FC-4 retrofit scope (RD-G) | Promotion path retrofitted to attempt-bound completion in the RD-G build | A2 residual R-4 |
| AM-05 | Tombstone fields (RD-C) | GM-7A: exactly six fields, nothing more | RD-C proof-minimum INSUFFICIENT |
| AM-06 | Retention periods (RD-C) | GM-7B: tombstones without scheduled expiry; address/content deleted at the transition | RD-C periods INSUFFICIENT (rule set; **ratification = GC-1**) |
| AM-07 | Digest-key rotation (RD-C) | GM-7C: cross-version lookup, no in-place re-keying, guarded retirement; interval is an operational parameter, never hard-coded | RD-C rotation INSUFFICIENT |
| AM-08 | Deletion/reconstruction coordination (RD-C) | GM-7D: single creation gate with tombstone consultation, in order | RD-C coordination INSUFFICIENT |
| AM-09 | Confirmation classification (RD-D) | Confirmation mail: transactional-class quota, frequency-exempt, one live token per pending request | RD-D's only INSUFFICIENT item |
| AM-10 | Projection enforcement (RD-E) | GM-5A/GM-5B: single-writer serialization is the enforcement; source gate on the projection prefix | RD-E enforcement INSUFFICIENT |
| AM-11 | Sender inventory / provider facts (RD-F) | PBO-1 and PBO-3 become dated, fail-closed intake artifacts with named contents (≤30 days old at build start) | RD-F UNVERIFIED caveat (converted to intake gates) |
| AM-12 | Outside-window race (RD-G) | FC-6A: the enforceable instant is call start, re-evaluated on server time | RD-G outside-window INSUFFICIENT |
| AM-13 | Person vs identity (RD-I) | Q-3A…Q-3E: frequency subject, evidenced person links, atomic enforcement, shared-inbox floor, claim wording | RD-I person INSUFFICIENT (mechanism; **definition ratification = GC-2**) |
| AM-14 | Caps vs exemptions (RD-I) | P-2A: caps bind the counted classes; transactional/service exemption stands as the table the owner adopted against | RD-I wording reconciliation item |
| AM-15 | Numeric headroom (RD-I) | Q-4(e): H derived by formula from intake evidence; unset H refuses commercial admission fail-closed | RD-I headroom INSUFFICIENT (formula; **adoption = GC-2**) |
| AM-16 | Queue-silently semantics (RD-I) | Q-6/Q-7: queued is not authorized; exactly one recorded terminal state per queue entry | RD-I queue-vs-expiry INSUFFICIENT |
| AM-17 | Review deadline composition (RD-J) | FC-5A: `min(D(flow), firstAttemptAt + W)`; review D = 23h | RD-J deadline INSUFFICIENT |
| AM-18 | Activated-path evidence (RD-J) | Named intake artifact `intake/review-activation-evidence-<date>.md`; missing records block only the acceptance that relies on them | RD-J UNVERIFIED bullet (replaced) |
| AM-19 | Christmas ceiling (RD-K) | No ceiling required for the lean release; DF-1 re-homes the obligation to the first later-flow brief | RD-K later-flow INSUFFICIENT (as a blocker) |
| AM-20 | Gift/memorial creative (RD-K) | DF-2 (a)–(e) promoted to normative build requirements for any gift/memorial build | RD-K deferred-flow constraint line |

Superseded wholesale: the original design §4 SQLite-sketch data model
(superseded by A1 C-1…C-3's shipped per-email coordinator, extended in
place); the original §5 slice plan (replaced by S49-6's RD-A…RD-K
re-derivation); PBO-13 as written (retired, replaced by PBO-13R).

## 4. Architecture and model requirements map

The map distinguishes what is **shipped** (verified in source at
`main` c566fdef when this register was filed) from what the RD build
**adds**. Shipped state is evidence of existence, not of compliance
with the amended design; each slice's acceptance is judged against
§2, not against this map.

| Component | Role in the amended design | State |
|---|---|---|
| Per-email Consistency Coordinator (DO, `promotion:v1:<sha256(normalized address)>`) | The contact authority: sole ordering point for consent, suppression, generations, jobs (INV-1) | **Shipped** with subscription state + coupon/followup jobs; extended in place by RD-B/RD-D per B1A-MODEL §3.1 (`generation`, `consentEvents[]`, `pendingConsent`, `suppressions`, `welcomeState`, `frequencyReservations[]`, `projection`, `legacyImport`, `tombstoneRef?`) |
| Account allocator (account-scoped DO) | Quota + frequency reservations keyed by logical-send identity and frequency subject; boundary-debt annotation; scheduled obligations (B1A-MODEL §3.2/§3.6) | **To build** (RD-F/RD-H/RD-I). Does not exist in shipped code |
| Scheduler / drivers | Drive committed jobs; the coordinator DO alarm recovers stale claims. A scheduler never authorizes a send — admission happens at claim + reservation + dispatch-time checks | **Shipped** (route driver + DO alarm driver); RD slices extend, never grant it authority |
| Dispatch fence | Authority re-read at the dispatch decision before any provider leg (gate-1 fencing build) | **Shipped 2026-10-31** (PR #454, draft at filing): `deliverPromotionSend` refuses without permission; see §5 |
| Review claim ledger (DO) + ReviewRequestSuppressionDO | Review path authorities; the suppression DO's `dispatch` is the only provider-call door for review requests; terminal-uncertain rule (§2.5) governs | **Shipped** (engine activated 2026-10-26; hardening PR #446) |
| KV projection (`promotionStateView` under `promotions:email:`) | Non-authoritative projection for pre-coordinator readers (admin summary, review engine's promotions opt-out source); single-writer per GM-5A once RD-E lands | **Shipped** as best-effort/strict publish from the flows; versioned single-writer enforcement is RD-E |
| Tombstone store | GM-7A records consulted before any generation-1 assignment (GM-7D); retained without scheduled expiry (GM-7B) | **To build** (RD-C). No tombstone store exists in shipped code |
| Send queue | Q-6/Q-7 entries for exhaustion-refused sends: frozen payload ref, eligibility snapshot, flow expiry, exactly one terminal state | **To build** (RD-I/RD-H). No such queue exists in shipped code |
| Consent tombstones for review records | Terminal review records reduce to the review tombstone fields at lifecycle close (GM-7B(d)) | **To build** with RD-C/RD-J scope |

### 4.1 B1A-MODEL citation map

Per AM-01, build briefs cite B1A-MODEL (B1 §3) field-for-field; this
register maps its records to slices without reproducing the annex:

| B1A-MODEL record | § | Owning slice(s) |
|---|---|---|
| Coordinator document extension | 3.1 | RD-B (suppressions), RD-D (generation/consentEvents/pendingConsent/welcomeState), RD-E (projection/legacyImport), RD-C (tombstoneRef) |
| Allocator reservation record + boundary debts + scheduled obligations | 3.2 | RD-F, RD-H |
| Tombstone record | 3.3 | RD-C |
| Projection record | 3.4 | RD-E |
| Queue-entry record | 3.5 | RD-I/RD-H |
| Person-frequency records | 3.6 | RD-I |
| Invariants INV-1…INV-12 | 3.7 | All slices (each brief names the invariants it touches) |

## 5. Dated historical record (context, never current-state proof)

| Date | Record |
|---|---|
| 2026-10-23 | Design returned NOT SOUND at the B1 gate; A1/A2 amendments enumerated. Pre-amendment statements about the email system (including any "inert" or "not built" descriptions) date from this period |
| 2026-10-24/26 | Per-email Consistency Coordinator shipped for promotions (PR #371) — the authority A1 C-1…C-3 designates |
| 2026-10-26 | **Review engine activated** on David's GO (flag `REVIEW_REQUESTS_ENABLED` on; the no-retry-on-ambiguity approval and the digital/physical review-activation approvals were resolved by these events). Earlier "review-inert" statements are superseded history |
| 2026-10-29 | S49-6 re-derivation produced (RD-A…RD-K); all seven owner decisions answered (§6) |
| 2026-10-30 | B1 amendment round landed (AM-01…AM-20, B1A-MODEL, PBO-13R, verdicts §5 of that round); review-engine hardening merged (PR #446) |
| 2026-10-31 | Subscriber census settled by production reads: both Resend accounts' "General" audiences hold zero contacts; the deployed KV holds exactly 68 keys under `promotions:email:` (a key count — it includes any unsubscribed; the subscribed/unsubscribed split lives in the values) |
| 2026-10-31 | Gate-1 sender inventory performed at source scope (S90-3: 21 paths inventoried; unrestricted promotion surfaces found) and the fencing build filed as PR #454 (draft): the transport now performs a dispatch-time authority read and refuses without permission. Inventory residue: the AM-11 PBO-1 discharge artifact (account-level senders, dated ≤30 days at RD-F build start) is still owed at RD-F intake |

## 6. Dated decision ledger — owner decisions

All seven owner decisions were **ANSWERED by David on 2026-10-29**
(`casl-owner-decisions-2026-10-29.md`), adopted as recommended, one
with a condition:

| # | Decision | Answer |
|---|---|---|
| 1 | FIRST50 retention | **YES** — the welcome-code promise to early subscribers is honoured in the new system |
| 2 | Frequency caps | **ADOPTED** — max one email per 72h per person; max 3 per 30 days per person (reconciled with class exemptions by AM-14) |
| 3 | Gift / memorial messaging | **YES, WITH CONDITION** — gift-occasion approved; memorial only on OurImprint's own list, gently, creative produced to a high standard and visually checked before any send; no memorial content in general sales blasts (normative build form: DF-2, AM-20) |
| 4 | Cutoff-data owner | **JACK** — Jack owns every date stated in email, verified against Printful's real cutoffs before sending |
| 5 | Copy approval | **DELEGATED** — Jack approves routine copy under the truthful-marketing rules; David sees the FIRST welcome email before it goes live (FW checkpoint, B1 §6) |
| 6 | Consent-proof retention | **YES — tombstones** — a keyed-hash tombstone is retained on unsubscribe/erasure; the address itself and content are not retained for marketing. **This selects the tombstone branch for PBO-14** |
| 7 | Exhaustion behaviour | **QUEUE SILENTLY** — sends queue without customer-visible effect and without dropping (semantics fixed by AM-16: nothing vanishes without a terminal record) |

Effects recorded: **PBO-12 is DISCHARGED** (2026-10-29). **PBO-14 is
discharged as a decision** by decision 6; its mechanism is GM-7 as
completed by AM-05…AM-08.

## 7. Open ratifications and residuals

### 7.1 Gate-chair ratifications (B1 §7) — carried OPEN

| Item | What it asks | Blocks | State at filing |
|---|---|---|---|
| **GC-1** | Ratify GM-7B's retention rule (tombstones without scheduled expiry; deletion only by recorded owner decision accepting resurrection risk) + operational acceptance: necessity assessment, reassessment schedule, access controls, key-dependency inventory, scoped deletion/key-destruction procedures | RD-C's retention-period acceptance; GC-1 operational acceptance overall | **OPEN.** Partial progress recorded 2026-10-31: the retention schedule proposal (six-monthly reassessment, month-end rule, Jack assessor, David accountable owner, first periodic review 2027-04-30) was accepted by the chair as a proposal; the access matrix was accepted as an implementation spec with confirmations still owed; the framework for scoped deletion was accepted but its "executable as written" claim rejected (command/API sheet + rehearsal evidence owed). David accepted the accountable-owner role in substance on 2026-10-31. Neither the ratification nor operational acceptance is complete |
| **GC-2** | Adopt (a) the headroom formula Q-4(e) and (b) the person-link evidences Q-3A, with accepted observation coverage, freshness, cap/counting units and atomic frequency-history aggregation | RD-I acceptance of commercial admission values; any per-person enforcement claim | **OPEN.** H remains unset; commercial admission remains fail-closed |
| **GC-3** | Conditional only: if the PBO-1 inventory finds an uncontrolled sender, the Q-5 degradation is surfaced to David before commercial sends rely on the allocator | Commercial reliance on the allocator, only if triggered | **NOT TRIGGERED** at filing — the account-level portion of the PBO-1 inventory is still owed (see §5), so the trigger question is not yet answerable |

### 7.2 A2 residuals — dispositions

| Residual | Disposition |
|---|---|
| R-1 (provider dedupe conditionality) | Dispositioned by AM-02 (FC-10 adopted as the design's stated posture) |
| R-2 (restoration dependency) | Replaced by PBO-13R (B1 §4) |
| R-3 (uncontrolled account senders) | Dispositioned by AM-03 (Q-5 codified; the ruling itself is conditional GC-3) |
| R-4 (FC-4 retrofit scope) | Dispositioned by AM-04 (retrofit in scope for RD-G) |
| R-5 (the seven decisions) | Answered 2026-10-29 (§6) |

No A2 residual remains outstanding.

### 7.3 Slice verdicts carried into the build (B1 §5)

READY: RD-A, RD-B, RD-D, RD-E, RD-H. READY-WITH-NAMED-DEPENDENCY:
RD-C (GC-1), RD-F (PBO-1 + PBO-3 intake), RD-G (PBO-3; PBO-2 is its
own deliverable), RD-I (GC-2), RD-J (AM-18 intake artifact), RD-K
(RD-A…RD-J + PBO-7/PBO-8/PBO-9 evidence; go-live separately gated).
No slice is STILL-BLOCKED. Dependencies apply in RD order throughout;
the workable build sequence (S81-5) is RD-A → RD-B → RD-C mechanism →
RD-D → RD-E → RD-F → RD-G → RD-H → RD-I fail-closed → RD-J → RD-K,
with acceptance holds kept explicit — an outstanding earlier
*acceptance* is not silently converted into permission or into a
build block beyond what the sources name.

## 8. PBO evidence register and later gates

### 8.1 PBO register

| PBO | Subject | State at filing |
|---|---|---|
| PBO-1 | Sender inventory intake artifact (AM-11 contents; dated ≤30 days old at RD-F build start) | **OPEN** — source-scope inventory performed 2026-10-31 (S90-3); the AM-11 discharge artifact, including account-level senders, is owed at RD-F intake |
| PBO-2 | Fence routing + CI gate evidence | **OPEN** — RD-G's own deliverable-evidence |
| PBO-3 | Provider facts intake artifact (AM-11 contents: dedupe window W, payload-equality, daily cap value/reset/counting unit, from dated provider documentation) | **OPEN** — owed at RD-F/RD-G; until it exists the allocator build proceeds only against the conservative assumptions as named constants (FC-10) |
| PBO-6 | Production-shaped rehearsal (legacy migration/projection) | **OPEN** — RD-E's own acceptance evidence, produced during its build |
| PBO-7 | Scheduled-send inventory evidence (SO-3 defines "resolved") | **OPEN** — produced at RD-H intake during its build; also an RD-K dependency |
| PBO-8 | Tokenless unsubscribe path evidence (named in FW-1 as one of the two unsubscribe paths to show working) | **OPEN** — evidence owed at RD-K; its producing-slice mapping is not named in the sources and is not invented here |
| PBO-9 | Evidence dependency named for RD-K (B1 §5) | **OPEN** — content and producing-slice mapping are not described in the governing sources available to this register; recorded as owed, not characterized |
| PBO-12 | Owner-decision preconditions | **DISCHARGED** 2026-10-29 (§6) |
| PBO-13 | Restoration of the truncated design sections | **RETIRED as written; replaced by PBO-13R** (B1 §4). T-SM-EMAIL-RESTORE continues as non-gating archival work; if it recovers original text contradicting an operative clause of the replacement basis, the contradiction is entered in this register and the affected clause re-gated |
| PBO-14 | Erasure/retention branch decision | **DISCHARGED as a decision** 2026-10-29 (OD decision 6, tombstone branch); mechanism GM-7 + AM-05…AM-08, built in RD-C |
| PBO-4, PBO-5, PBO-10, PBO-11 | — | **NOT DESCRIBED** in the governing sources available to this register. No content is invented for them; if a later source names one, it is entered here with its citation |

### 8.2 Later gates (readiness ruling, 2026-10-31) — none discharged by the paper phase or by this register

1. **Provider and sender intake** — current PBO-1/PBO-3 evidence;
   verified units/boundaries/provider semantics; implementation
   evidence for the accepted fencing/refusal policy. GC-3 only if
   uncontrolled senders are found. *(Fencing implementation evidence
   for the shipped promotion transport: PR #454, draft at filing.)*
2. **Storage and implementation acceptance** — durable
   admission/anchor initialization, projection uncertainty across
   awaits/restarts, erasure convergence, reconciliation, inherited
   slice tests; RA-4 execution evidence (multiple invocations,
   partial resolution, repeated boundary processing, charge/debt
   coalescence) as test obligations at RD-F/RD-H/RD-G per the S81-5
   placement.
3. **GC-1 operational acceptance** — §7.1.
4. **GC-2 commercial clearance** — §7.1. H stays unset; commercial
   admission stays fail-closed until that acceptance.
5. **Slice intake, rehearsal, routing, scheduled-send and
   review-activation evidence**, with implementation review and CI
   at each submitted candidate.
6. **Go-live** — FW-1–FW-6 including David's recorded first-welcome
   review against the creative hash; gift/memorial creative and
   audience gates (DF-2); **separate activation permission**, which
   no build acceptance substitutes for.

## 9. What this register does not do

It authorizes no build, send, configuration change or activation. It
recovers no original wording and presents no re-derivation as the
original plan. It does not declare T-SM-EMAIL-RESTORE or the B1 round
"complete" beyond their recorded dispositions (PBO-13R; B1 §8's paper
gate discharged 2026-10-30). Where the sources are silent — PBO-9's
contents, the producing slices for PBO-8/PBO-9, complete per-slice
acceptance criteria beyond the amended specifications — the register
says so rather than filling the gap; those items are raised as brief
defects at the affected slice, per AM-01's rule.
