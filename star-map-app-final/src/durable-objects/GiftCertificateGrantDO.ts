/**
 * Thin per-entitlement-session SQLite Durable Object serializing
 * gift-certificate grant publication (Tier C review condition 1).
 * The state machine and the soundness argument live in
 * src/lib/giftCertificateGrantState.ts; this shell persists the row
 * as one JSON document, mirroring EntitlementAuthorityDO, and —
 * since the gate's return verdict — performs the entitlement KV
 * write itself inside the serialized `publish` operation, so no
 * caller ever holds a write authorization across an await outside
 * this authority.
 *
 * One instance per gift-certificate entitlement session id
 * (`idFromName(entitlementSessionId)`), so every grant pass for a
 * certificate is serialized inside a single instance across all
 * isolates. RPC failures surface as thrown errors; the client maps
 * them to a retryable failure (fail closed) — never to an in-isolate
 * fallback decision in production.
 */
import { DurableObject } from "cloudflare:workers";
import {
  buildGiftCertificateEntitlementRecord,
  confirmGiftCertificateGrantPublished,
  createEmptyGiftCertificateGrantRow,
  initializeGiftCertificateGrant,
  isValidGiftCertificateGrantRow,
  type ConfirmGiftCertificateGrantResult,
  type GiftCertificateGrantPublishResult,
  type GiftCertificateGrantRow,
  type GiftCertificateGrantTerms,
  type InitializeGiftCertificateGrantResult,
} from "../lib/giftCertificateGrantState";

type GrantRow = {
  session_id: string;
  state_json: string;
  updated_at: number;
};

export class GiftCertificateGrantDO extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS gift_certificate_grant_state (
          session_id TEXT PRIMARY KEY,
          state_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        )
      `);
    });
  }

  private readRow(entitlementSessionId: string): GiftCertificateGrantRow {
    const trimmed = entitlementSessionId.trim();
    const rows = this.ctx.storage.sql
      .exec<GrantRow>(
        "SELECT session_id, state_json, updated_at FROM gift_certificate_grant_state WHERE session_id = ? LIMIT 1",
        trimmed,
      )
      .toArray();
    if (rows.length === 0) {
      return createEmptyGiftCertificateGrantRow(trimmed);
    }
    const parsed = JSON.parse(rows[0].state_json) as GiftCertificateGrantRow;
    if (!parsed || parsed.entitlementSessionId !== trimmed) {
      throw new Error(`gift certificate grant state mismatch for ${trimmed}`);
    }
    if (!isValidGiftCertificateGrantRow(parsed)) {
      throw new Error(`gift certificate grant state malformed for ${trimmed}`);
    }
    return parsed;
  }

  private writeRow(row: GiftCertificateGrantRow, now: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO gift_certificate_grant_state (session_id, state_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          state_json = excluded.state_json,
          updated_at = excluded.updated_at
      `,
      row.entitlementSessionId,
      JSON.stringify(row),
      now,
    );
  }

  async getRow(entitlementSessionId: string): Promise<GiftCertificateGrantRow> {
    return this.readRow(entitlementSessionId);
  }

  async initialize(
    entitlementSessionId: string,
    input: { terms: GiftCertificateGrantTerms; now: number },
  ): Promise<InitializeGiftCertificateGrantResult> {
    const current = this.readRow(entitlementSessionId);
    const result = initializeGiftCertificateGrant(current, input);
    if (result.changed) {
      this.writeRow(result.row, input.now);
    }
    return result;
  }

  async confirmPublished(
    entitlementSessionId: string,
    input: { now: number },
  ): Promise<ConfirmGiftCertificateGrantResult> {
    const current = this.readRow(entitlementSessionId);
    const result = confirmGiftCertificateGrantPublished(current, input);
    if (result.changed) {
      this.writeRow(result.row, input.now);
    }
    return result;
  }

  /**
   * FIFO chain serializing publish operations inside this instance.
   * A Durable Object's handlers can interleave at awaits, and the
   * publication write below is an await — so the whole
   * initialize → write → confirm sequence runs as one critical
   * section, exactly the exclusion the redeem route cannot provide
   * across isolates.
   */
  private publishQueue: Promise<unknown> = Promise.resolve();

  /**
   * The serialized publication operation: decide create-if-absent,
   * perform the entitlement KV write HERE (awaited), then persist
   * confirmation. A pass that finds the grant already confirmed
   * writes nothing. A failure anywhere before confirmation leaves
   * the row unconfirmed and rejects — the redeem route answers a
   * retryable 503 and the code stays redeemable; a later publish
   * repairs by re-running the same sequence with the standing
   * terms.
   */
  async publish(
    entitlementSessionId: string,
    input: {
      terms: GiftCertificateGrantTerms;
      now: number;
      entitlementKey: string;
    },
  ): Promise<GiftCertificateGrantPublishResult> {
    const run = () => this.publishSerialized(entitlementSessionId, input);
    const result = this.publishQueue.then(run, run);
    this.publishQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async publishSerialized(
    entitlementSessionId: string,
    input: {
      terms: GiftCertificateGrantTerms;
      now: number;
      entitlementKey: string;
    },
  ): Promise<GiftCertificateGrantPublishResult> {
    const trimmed = entitlementSessionId.trim();
    const current = this.readRow(trimmed);
    const initialized = initializeGiftCertificateGrant(current, {
      terms: input.terms,
      now: input.now,
    });
    if (!initialized.created && current.publishedAt !== null) {
      // Already published by the winning operation. This operation
      // must not write the entitlement record under any
      // circumstances — a write here is exactly the replenishment
      // write the condition prohibits.
      return { published: false, created: false };
    }
    if (initialized.changed) {
      // Persist the grant BEFORE the write: a failure from here on
      // leaves an initialized-but-unconfirmed row, which a later
      // publish repairs — never a confirmed row without a write.
      this.writeRow(initialized.row, input.now);
    }
    const record = buildGiftCertificateEntitlementRecord({
      plan: initialized.grant.plan,
      creditsTotal: initialized.grant.creditsTotal,
      initializedAt: initialized.grant.initializedAt,
    });
    await this.putEntitlementRecord(input.entitlementKey, record);
    const confirmed = confirmGiftCertificateGrantPublished(initialized.row, {
      now: input.now,
    });
    if (!confirmed.confirmed) {
      throw new Error(
        `gift certificate grant publication could not be confirmed for ${trimmed}`,
      );
    }
    if (confirmed.changed) {
      this.writeRow(confirmed.row, input.now);
    }
    return { published: true, created: initialized.created };
  }

  /**
   * The publication write, performed by the authority itself via
   * its own KV binding (the ReviewRequestSuppressionDO precedent:
   * DO shells read their env bindings directly). Semantics match
   * kv.setDurable's production path — one awaited put, failures
   * propagate — with no local fallback: a missing binding or a
   * failed put fails the publish closed.
   */
  private async putEntitlementRecord(
    entitlementKey: string,
    record: unknown,
  ): Promise<void> {
    const kv = (
      this.env as {
        STAR_MAP_KV?: { put(key: string, value: string): Promise<void> };
      }
    ).STAR_MAP_KV;
    if (!kv) {
      throw new Error(
        "gift certificate grant authority: STAR_MAP_KV binding unavailable",
      );
    }
    await kv.put(entitlementKey, JSON.stringify(record));
  }
}
