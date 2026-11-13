import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
register("./tsAliasLoader.mjs", import.meta.url);
register("./consistencyCoordinator.hooks.mjs", import.meta.url);
register("./hcapNull.hooks.mjs", import.meta.url);
const { createSendCapClient, dispatchPrerequisite } = await import("../../src/lib/sharedSendCap.ts");
const { executeReviewDispatch } = await import("../../src/lib/reviewRequestSuppression.ts");
const { deliverPromotionSend } = await import("../../src/lib/promotions.ts");
const { drivePromotionJobs } = await import("../../src/lib/promotionCoordinator.ts");
const { ConsistencyCoordinatorDO } = await import("../../src/durable-objects/ConsistencyCoordinatorDO.ts");
const { ReviewRequestSuppressionDO } =
  await import("../../src/durable-objects/ReviewRequestSuppressionDO.ts");
const trap = new Proxy(
  {},
  {
    get() {
      assert.fail("null-H must be first");
    },
  }
);
test("H-cap explicit null: refusal bytes precede fence, binding, all promotion and review guards", async () => {
  for (const family of ["promotion", "review"]) {
    assert.deepEqual(dispatchPrerequisite(family, trap), { permitted: false, reason: "send_cap_unset" });
    assert.deepEqual(await createSendCapClient(trap).reserve(family), {
      permitted: false,
      reason: "send_cap_unset",
    });
  }
  assert.deepEqual(await executeReviewDispatch({}, trap), { outcome: "refused", reason: "send_cap_unset" });
  assert.deepEqual(await deliverPromotionSend(trap, undefined, { env: trap }), {
    outcome: "refused",
    provider: "none",
    reason: "send_cap_unset",
  });
  assert.equal(
    (await drivePromotionJobs(trap, "unused", "unused")).couponError,
    "promotion_dispatch_refused:send_cap_unset"
  );
  const object = new ConsistencyCoordinatorDO(
    { id: { name: "commercial-send-cap:v1:global" }, blockConcurrencyWhile() {}, storage: trap },
    trap
  );
  assert.deepEqual(object.reserveCommercialSend({ family: "promotion" }), {
    permitted: false,
    reason: "send_cap_unset",
  });
  await object.alarm();
  const review = new ReviewRequestSuppressionDO({ blockConcurrencyWhile() {}, storage: trap }, trap);
  assert.deepEqual(await review.dispatch({}), { outcome: "refused", reason: "send_cap_unset" });
});
