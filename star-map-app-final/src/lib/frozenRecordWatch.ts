/**
 * DL-1 frozen-record watch — observation classification (DL-1 v3.7
 * §3.2 as amended by v3.8 §6 and restated as a partition by v3.9 §5).
 *
 * Every post-creation image of the legacy record is an OBSERVATION,
 * classified against the credible chain: the creation snapshot is the
 * chain's first credible image, and an image joins the chain (becomes
 * the latest credible image L) only by classifying Consistent. The
 * classifier is a precedence partition judged at the chain's HEAD —
 * snapshot equality is a joining arm only while the snapshot IS the
 * latest credible image, and stale thereafter. First match decides:
 *
 *   1. I = L                                    → consistent (joins)
 *   2. I = the journal-predicted image          → consistent (joins)
 *   3. I equals a known earlier credible state  → stale_image_observation
 *   4. I is orderable after L and unexplained   → frozen_record_mutated
 *   5. anything else                            → unknown_chronology_observation
 *
 * Case 2 precedes case 3 deliberately: an image the journal predicts
 * EXACTLY — token-exact, over the whole fingerprint — is current by
 * the strongest evidence the watch owns. An old image cannot carry
 * token components the journal issued after it, so no stale read can
 * satisfy case 2.
 *
 * Unknown-chronology images are never inferred stale, never treated
 * as mutated (no fleet halt follows from an unproven chronology),
 * never join the chain, and serve as neither side of a late-debit
 * leg delta. §3.3's candidate legs are evaluated against the latest
 * CREDIBLE observation only, and the legs are necessary, never
 * sufficient: exclusion is proven by independent per-debit evidence
 * or an operator receipt, or the debit stays an incident.
 */
import type { LegacyAccountingFingerprint } from "@/lib/entitlementMigration";

export type RecordObservationClass =
  | "consistent"
  | "stale_image_observation"
  | "frozen_record_mutated"
  | "unknown_chronology_observation";

export function fingerprintEqualsFp(
  a: LegacyAccountingFingerprint,
  b: LegacyAccountingFingerprint,
): boolean {
  return (
    a.creditsRemaining === b.creditsRemaining &&
    a.lastConsumeToken === b.lastConsumeToken &&
    a.lastCompensatedToken === b.lastCompensatedToken
  );
}

export function classifyRecordObservation(input: {
  image: LegacyAccountingFingerprint;
  /** The credible chain, snapshot first, latest credible image last.
   *  Must contain at least the snapshot. */
  credibleChain: LegacyAccountingFingerprint[];
  /**
   * The image the journal predicts exactly, given the entries made
   * since the latest credible image — or null when the journal
   * predicts no change / no exact image.
   */
  journalPredicted: LegacyAccountingFingerprint | null;
  /**
   * True when an artefact meeting the §3.3 standard orders this image
   * AFTER the latest credible image.
   */
  orderableAfterLatest: boolean;
}): { classification: RecordObservationClass; joinsChain: boolean } {
  const chain = input.credibleChain;
  const latest = chain[chain.length - 1];
  const image = input.image;

  // Case 1: equality with the head. While the chain has never
  // advanced, the head IS the snapshot — snapshot equality lives
  // here, and only here (v3.9 §5.2).
  if (fingerprintEqualsFp(image, latest)) {
    return { classification: "consistent", joinsChain: true };
  }
  // Case 2: the journal predicts this image exactly (token-exact).
  if (input.journalPredicted && fingerprintEqualsFp(image, input.journalPredicted)) {
    return { classification: "consistent", joinsChain: true };
  }
  // Case 3: equality with a known earlier credible state (the
  // snapshot or any prior chain member) while differing from the
  // head: a regression the watch can PROVE, because the image is one
  // it has already seen. Clears nothing, proves nothing.
  for (const earlier of chain) {
    if (fingerprintEqualsFp(image, earlier)) {
      return { classification: "stale_image_observation", joinsChain: false };
    }
  }
  // Case 4: orderable after the head, differing in a way no journal
  // entry explains (cases 1–2 already excluded the explained forms).
  if (input.orderableAfterLatest) {
    return { classification: "frozen_record_mutated", joinsChain: false };
  }
  // Case 5: the image cannot be ordered against the credible chain.
  return { classification: "unknown_chronology_observation", joinsChain: false };
}

/**
 * §3.3's candidate legs (necessary, NOT sufficient), evaluated
 * against the latest credible observation: the token is absent from
 * the snapshot's consume evidence, absent from the journal, and the
 * fingerprint delta against the latest credible image is exactly
 * this debit's effect. A candidate still needs exclusion proof
 * (independent per-debit evidence or an operator receipt) before any
 * monetary entry exists.
 */
export function lateDebitCandidateLegs(input: {
  token: string;
  amount: number;
  snapshot: LegacyAccountingFingerprint;
  journalConsumeTokens: ReadonlySet<string>;
  latestCredible: LegacyAccountingFingerprint;
  observed: LegacyAccountingFingerprint;
}): boolean {
  if (input.snapshot.lastConsumeToken === input.token) return false;
  if (input.journalConsumeTokens.has(input.token)) return false;
  if (input.latestCredible.creditsRemaining === null) return false;
  if (input.observed.creditsRemaining === null) return false;
  if (input.latestCredible.creditsRemaining - input.observed.creditsRemaining !== input.amount) {
    return false;
  }
  if (input.observed.lastConsumeToken !== input.token) return false;
  if (input.observed.lastCompensatedToken !== input.latestCredible.lastCompensatedToken) {
    return false;
  }
  return true;
}
