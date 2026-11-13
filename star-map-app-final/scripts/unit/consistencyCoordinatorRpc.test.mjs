import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test(
  "coordinator client uses real workerd RPC with local fallback disabled",
  { timeout: 180000 },
  async () => {
    const appRoot = fileURLToPath(new URL("../../", import.meta.url));
    const bundle = await build({
      absWorkingDir: appRoot,
      entryPoints: ["scripts/unit/fixtures/consistencyCoordinator.worker.mjs"],
      bundle: true,
      write: false,
      format: "esm",
      platform: "neutral",
      mainFields: ["module", "main"],
      conditions: ["workerd", "worker", "browser"],
      external: ["cloudflare:*", "node:*"],
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.CI": '"0"',
        "process.env.STARMAP_CONSISTENCY_COORDINATOR_LOCAL": '"0"',
      },
    });
    let outboundAttempts = 0;
    const mf = new Miniflare({
      workers: [
        {
          config: {
            name: "coordinator-rpc-test",
            compatibilityDate: "2025-12-29",
            compatibilityFlags: ["nodejs_compat", "global_fetch_strictly_public"],
            manifest: {
              mainModule: "worker.js",
              modules: {
                "worker.js": { type: "esm", contents: bundle.outputFiles[0].text },
              },
            },
            exports: { ConsistencyCoordinatorDO: { type: "durable-object", storage: "sqlite" } },
            env: {
              CONSISTENCY_COORDINATOR: {
                type: "durable-object",
                worker: "coordinator-rpc-test",
                exportName: "ConsistencyCoordinatorDO",
              },
              NODE_ENV: { type: "json", value: "production" },
              CI: { type: "json", value: "0" },
              STARMAP_CONSISTENCY_COORDINATOR_LOCAL: { type: "json", value: "0" },
              PROMOTION_DISPATCH_ENABLED: { type: "json", value: "false" },
            },
          },
          dev: {
            outboundService: {
              type: "fetcher",
              handler: () => {
                outboundAttempts++;
                throw new Error("RPC regression forbids outbound requests");
              },
            },
          },
        },
      ],
    });
    try {
      const response = await mf.dispatchFetch("http://local.invalid/regression");
      assert.equal(response.status, 200);
      const { results } = await response.json();
      assert.equal(results.length, 11);
      for (const row of results.slice(0, 10)) assert.equal(row.ok, true, JSON.stringify(row));
      const answers = results.map((row) => row.answer);
      assert.equal(answers[0].status, "unknown");
      assert.equal(answers[1].status, "consumed");
      assert.equal(answers[2].registered, true);
      assert.equal(answers[3].status, "consumed");
      assert.equal(answers[4].status, "already_consumed");
      assert.deepEqual(answers[5], answers[6]);
      assert.equal(answers[6].view.sessions[0].sessionId, "synthetic-session");
      assert.equal(answers[7].isNewSubscriber, true);
      assert.deepEqual(answers[7].state, answers[8]);
      assert.equal(answers[9].isNewSubscriber, false);
      assert.equal(results[10].ok, false);
      assert.equal(results[10].error.name, "ConsistencyCoordinatorUnavailableError");
      assert.equal(results[10].error.code, "consistency_coordinator_unavailable");
      assert.match(results[10].error.cause.message, /kind mismatch/);
      assert.equal(outboundAttempts, 0);
    } finally {
      await mf.dispose();
    }
  }
);
