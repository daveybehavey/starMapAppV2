/**
 * Bridge for the review-outcome merge: re-export the harness mirror
 * the post-submit suites pin (printFulfillmentPostSubmit.harness.mjs)
 * so the runtime store is tested against the reviewed merge rather
 * than a re-implementation. applyPrintfulPostSubmitReview belongs to
 * the scheduled entry point, not the store, and is not exercised.
 */
export { applyReviewOutcomeToCurrent } from "./printFulfillmentPostSubmit.harness.mjs";

export async function applyPrintfulPostSubmitReview(record) {
  return record;
}
