/**
 * DL-1 ReferralDiscoveryDO — pure state machine (DL-1 v3.8 §5, as
 * amended by v3.9 §4). One instance per REFERRED checkout session id.
 *
 * The contract, stated as an invariant (v3.8 §5.1): no grant entry
 * carries fold effect unless a discovery association for its referred
 * session id was registered in or before the op that conferred the
 * effect. Registration is a leg of the grant op itself — not a
 * downstream obligation, not an outbox — so a committed grant without
 * an association is unreachable by construction, and lineage step 5
 * reads ONE authoritative answer instead of surveying lossy locators.
 *
 * The terminal record (v3.9 §4): a lineage's terminal negative
 * decision is recorded HERE, before dedupe may finalize, and
 * admission consults it in the same leg that registers — so no order
 * of (absence, decision, admission) can leave an unreversed grant
 * standing over a terminal refund. `register` and
 * `recordTerminalNegative` are serialized against one row in one
 * instance; whichever executes first decides which world the second
 * one sees. Associations are NEVER deleted and `register` is their
 * sole writer — both properties are load-bearing for the v3.9 §4.5
 * unreachability proof.
 *
 * The DO is the serialization point, not the judge: it cannot
 * evaluate lineage step 5's conditions (it has no Stripe access and
 * no journal); it orders two writers against one row.
 */

export type ReferralDiscoveryRow = {
  referredSessionId: string;
  referrerSessionId: string | null;
  /** In the built dedupe domain the grantId IS the referred session id;
   *  the record carries both fields so the contract does not bake that
   *  id choice into the association's shape (v3.8 §5.2). */
  grantId: string | null;
  registeredAt: number | null;
  terminalNegative: { lineageRef: string; recordedAt: number } | null;
};

export function createEmptyReferralDiscoveryRow(
  referredSessionId: string,
): ReferralDiscoveryRow {
  return {
    referredSessionId,
    referrerSessionId: null,
    grantId: null,
    registeredAt: null,
    terminalNegative: null,
  };
}

/** Typed absence: a never-written instance reads as this empty row —
 *  an ANSWER (v3.6 §6.4 form), distinguishable from a failed read,
 *  which produces no answer at all and finalizes nothing. */
export function isDiscoveryAbsence(row: ReferralDiscoveryRow): boolean {
  return row.referrerSessionId === null && row.terminalNegative === null;
}

export type RegisterDiscoveryOutcome =
  | "registered"
  | "already_registered"
  | "conflict"
  | "registered_after_terminal";

export function registerDiscovery(
  row: ReferralDiscoveryRow,
  input: { referrerSessionId: string; grantId: string; now: number },
): { row: ReferralDiscoveryRow; outcome: RegisterDiscoveryOutcome } {
  if (row.referrerSessionId !== null) {
    // A referred session has exactly one referrer by construction; a
    // different triple is corruption or fraud evidence — a conflict
    // to investigate, never an overwrite.
    if (
      row.referrerSessionId === input.referrerSessionId &&
      row.grantId === input.grantId
    ) {
      // Idempotent re-registration — but a terminal record standing
      // on the row is part of the leg's answer on EVERY delivery
      // (Codex re-gate F-B): the first attempt may have registered
      // over the terminal record and then died before the grant op
      // committed, and the retry that only hears
      // `already_registered` would admit an ordinary grant where
      // the design mandates the born-reversed one (v3.9 §4). The
      // outcome names the terminal fact whenever it stands, first
      // registration or retry alike.
      return {
        row,
        outcome: row.terminalNegative ? "registered_after_terminal" : "already_registered",
      };
    }
    return { row, outcome: "conflict" };
  }
  // The association is written even over a terminal record:
  // discovery completeness is preserved, because a later lineage for
  // this session must find it (v3.9 §4.3).
  const next: ReferralDiscoveryRow = {
    ...row,
    referrerSessionId: input.referrerSessionId,
    grantId: input.grantId,
    registeredAt: input.now,
  };
  return {
    row: next,
    outcome: row.terminalNegative ? "registered_after_terminal" : "registered",
  };
}

export type RecordTerminalNegativeOutcome =
  | "recorded"
  | "already_recorded"
  | "terminal_exists"
  | "association_exists";

export function recordTerminalNegative(
  row: ReferralDiscoveryRow,
  input: { lineageRef: string; now: number },
): { row: ReferralDiscoveryRow; outcome: RecordTerminalNegativeOutcome } {
  if (row.referrerSessionId !== null) {
    // The decision is void: the association makes the referral
    // question live, and the lineage must re-enter step 5 at (i).
    return { row, outcome: "association_exists" };
  }
  if (row.terminalNegative) {
    return {
      row,
      outcome:
        row.terminalNegative.lineageRef === input.lineageRef
          ? "already_recorded"
          : "terminal_exists",
    };
  }
  return {
    row: {
      ...row,
      terminalNegative: { lineageRef: input.lineageRef, recordedAt: input.now },
    },
    outcome: "recorded",
  };
}

export function isValidReferralDiscoveryRow(value: unknown): value is ReferralDiscoveryRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const row = value as ReferralDiscoveryRow;
  if (typeof row.referredSessionId !== "string" || row.referredSessionId.length === 0) {
    return false;
  }
  if (row.referrerSessionId !== null && typeof row.referrerSessionId !== "string") {
    return false;
  }
  if (row.grantId !== null && typeof row.grantId !== "string") return false;
  if (row.registeredAt !== null && typeof row.registeredAt !== "number") return false;
  if (row.terminalNegative !== null) {
    if (typeof row.terminalNegative !== "object" || row.terminalNegative === null) {
      return false;
    }
    if (typeof row.terminalNegative.lineageRef !== "string") return false;
    if (typeof row.terminalNegative.recordedAt !== "number") return false;
  }
  // An association's fields stand or fall together.
  const hasAssociation = row.referrerSessionId !== null;
  if (hasAssociation !== (row.grantId !== null)) return false;
  if (hasAssociation !== (row.registeredAt !== null)) return false;
  return true;
}
