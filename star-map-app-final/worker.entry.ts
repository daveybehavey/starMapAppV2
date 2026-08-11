/**
 * Cloudflare Worker entry for OpenNext + StarMapCo app Durable Objects.
 *
 * OpenNext generates `.open-next/worker.js` (default fetch handler + cache DOs).
 * This entry re-exports that worker and adds the per-order print coordinator DO.
 *
 * Build order: `npx opennextjs-cloudflare build` (creates `.open-next/`), then
 * `wrangler deploy` uses this file as `main`.
 */
export { default } from "./.open-next/worker.js";
export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "./.open-next/worker.js";
export { PrintOrderCoordinator } from "./src/durable-objects/PrintOrderCoordinator";
