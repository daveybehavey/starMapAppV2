// @ts-expect-error `.open-next/worker.js` is generated at OpenNext build time
import { default as handler } from "./.open-next/worker.js";

export { PrintOrderAuthorityDO } from "./src/durable-objects/PrintOrderAuthorityDO";

export default {
  fetch: handler.fetch,
} satisfies ExportedHandler<CloudflareEnv>;
