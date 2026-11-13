import { ConsistencyCoordinatorDO } from "../../../src/durable-objects/ConsistencyCoordinatorDO";
import {
  createConsistencyCoordinatorClient,
  magicCoordinatorName,
  coordinatorEmailHash,
  accountCoordinatorName,
  promotionCoordinatorName,
} from "../../../src/lib/consistencyCoordinator";
export { ConsistencyCoordinatorDO };

function errorDetails(error) {
  return {
    name: error?.name,
    code: error?.code,
    message: error?.message,
    cause: error?.cause ? errorDetails(error.cause) : undefined,
  };
}
const worker = {
  async fetch(_request, env) {
    if (
      process.env.NODE_ENV !== "production" ||
      process.env.CI === "1" ||
      process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL === "1"
    )
      throw new Error("Memory fallback must be disabled");
    const client = createConsistencyCoordinatorClient(env);
    // Keep scheduled promotion alarms beyond this test's lifetime.
    const now = Date.now() + 24 * 60 * 60 * 1000;
    const email = "rpc-test@example.invalid";
    const emailHash = coordinatorEmailHash(email);
    const legacyTtlMs = 900000;
    const results = [];
    async function record(label, operation) {
      try {
        const answer = await operation();
        results.push({ label, ok: true, answer });
        return answer;
      } catch (error) {
        results.push({ label, ok: false, error: errorDetails(error) });
      }
    }
    await record("1 unknown/null", () =>
      client.consumeMagicToken(magicCoordinatorName("invalid"), { legacyRecord: null, legacyTtlMs, now })
    );
    await record("2 unknown/legacy", () =>
      client.consumeMagicToken(magicCoordinatorName("regression-legacy"), {
        legacyRecord: { email, emailHash, createdAt: now - 60000 },
        legacyTtlMs,
        now,
      })
    );
    const registeredName = magicCoordinatorName("regression-fresh");
    await record("3a register", () =>
      client.registerMagicToken(registeredName, { email, emailHash, expiresAt: now + legacyTtlMs, now })
    );
    await record("3b consume", () =>
      client.consumeMagicToken(registeredName, { legacyRecord: null, legacyTtlMs, now })
    );
    await record("3c consume again", () =>
      client.consumeMagicToken(registeredName, { legacyRecord: null, legacyTtlMs, now })
    );
    const accountName = accountCoordinatorName(emailHash);
    const accountInput = { emailHash, legacySessions: null, legacyUpdatedAt: null };
    await record("4a upsert", () =>
      client.upsertAccountSession(accountName, {
        ...accountInput,
        session: { sessionId: "synthetic-session", createdAt: now },
        now,
      })
    );
    await record("4b get", () => client.getAccountSessions(accountName, accountInput));
    const promotionName = promotionCoordinatorName(emailHash);
    const promotionInput = {
      emailHash,
      source: "local-regression",
      now,
      facts: {
        state: null,
        inLegacySubscriptionList: false,
        inLegacySentList: false,
        inLegacyFollowupList: false,
      },
      tombstoneLookup: {
        digestsByVersion: {},
        nonRetiredVersions: [1],
        resolvableVersions: [],
        retiredVersions: [],
      },
      couponPayload: {
        email,
        couponCode: "LOCAL-ONLY",
        kind: "coupon",
        subject: "Regression",
        text: "Regression",
        html: "<p>Regression</p>",
      },
    };
    await record("5a subscribe", () => client.subscribePromotion(promotionName, promotionInput));
    await record("5b get", () => client.getPromotionState(promotionName));
    await record("5c subscribe again", () => client.subscribePromotion(promotionName, promotionInput));
    // A genuine DO exception must retain the unavailable taxonomy and cause.
    await record("6 kind mismatch", () =>
      client.consumeMagicToken(accountName, { legacyRecord: null, legacyTtlMs, now })
    );
    return Response.json({ results });
  },
};
export default worker;
