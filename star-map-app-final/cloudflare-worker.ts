// @ts-expect-error `.open-next/worker.js` is generated at OpenNext build time
import { default as handler } from "./.open-next/worker.js";
import { runScheduledReviewRequestTick } from "./src/lib/reviewRequestRuntime";

export { PrintOrderAuthorityDO } from "./src/durable-objects/PrintOrderAuthorityDO";
export { ReviewRequestLedgerDO } from "./src/durable-objects/ReviewRequestLedgerDO";
export { EntitlementAuthorityDO } from "./src/durable-objects/EntitlementAuthorityDO";
export { ReferralDiscoveryDO } from "./src/durable-objects/ReferralDiscoveryDO";

export default {
  fetch: handler.fetch,
  // Review-request engine tick (T1). INERT unless REVIEW_REQUESTS_ENABLED is
  // set to "true" in the Worker environment at activation time — the flag is
  // deliberately not in wrangler.toml [vars]. The tick is total (per-record
  // isolation, counts-only logging); the catch here is belt-and-braces so a
  // scheduling failure can never surface as a Worker error.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      runScheduledReviewRequestTick(env).catch((error: unknown) => {
        console.error(
          JSON.stringify({
            event: "review_requests",
            status: "tick_error",
            error: error instanceof Error ? error.message.slice(0, 200) : "unknown",
            cron: event.cron,
          }),
        );
      }),
    );
  },
} satisfies ExportedHandler<CloudflareEnv>;
