/**
 * Cloudflare Worker entry for OpenNext + StarMapCo app Durable Objects.
 *
 * OpenNext build output lives under `.open-next/` (created by `opennextjs-cloudflare build`).
 * This entry re-exports that worker and adds the per-order print coordinator DO.
 */
// @ts-expect-error OpenNext output is generated at deploy/build time.
export { default } from "./.open-next/worker.js";
// @ts-expect-error OpenNext output is generated at deploy/build time.
export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "./.open-next/worker.js";
export { PrintOrderCoordinator } from "./src/durable-objects/PrintOrderCoordinator";
