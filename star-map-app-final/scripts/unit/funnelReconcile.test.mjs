import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  FUNNEL_RECONCILE_CONTRACT,
  assertApplyAllowed,
  assertScriptIsNotNoOp,
  containsSensitiveOperatorText,
  formatAggregateReport,
  parseArgs,
  resolveSiteOrigin,
  runFunnelReconcile,
  writeOperatorError,
} from "../funnel-reconcile.mjs";

const SCRIPT_PATH = fileURLToPath(new URL("../funnel-reconcile.mjs", import.meta.url));

function createIo() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: {
      write(chunk) {
        stdout += String(chunk);
        return true;
      },
    },
    stderr: {
      write(chunk) {
        stderr += String(chunk);
        return true;
      },
    },
    getStdout: () => stdout,
    getStderr: () => stderr,
  };
}

function baseEnv(overrides = {}) {
  return {
    PRINT_ADMIN_TOKEN: "test-admin-token",
    FUNNEL_RECONCILE_SITE: "http://127.0.0.1:9",
    ...overrides,
  };
}

async function withMockServer(handler, run) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      res.statusCode = 500;
      res.end(String(error));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    return await run(origin, server);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

test("negative control: empty/no-op stub is detected", () => {
  const tmp = path.join(path.dirname(SCRIPT_PATH), `.funnel-reconcile-empty-stub-${process.pid}.mjs`);
  fs.writeFileSync(tmp, "");
  try {
    assert.throws(() => assertScriptIsNotNoOp(tmp), /empty \(0 bytes\)/);
  } finally {
    fs.unlinkSync(tmp);
  }

  const stub = path.join(path.dirname(SCRIPT_PATH), `.funnel-reconcile-noop-stub-${process.pid}.mjs`);
  fs.writeFileSync(stub, "#!/usr/bin/env node\nprocess.exit(0);\n");
  try {
    assert.throws(() => assertScriptIsNotNoOp(stub), /does not reference the reconcile endpoint path/);
  } finally {
    fs.unlinkSync(stub);
  }

  const info = assertScriptIsNotNoOp(SCRIPT_PATH);
  assert.ok(info.bytes > 0);
});

test("dry-run is the default request body", async () => {
  let seenBody = null;
  let seenHeaders = null;
  await withMockServer(
    async (req, res) => {
      seenHeaders = { ...req.headers };
      seenBody = await readJsonBody(req);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          dryRun: true,
          days: 14,
          scanned: 3,
          eligible: 2,
          alreadyRecorded: 1,
          repaired: 1,
          sync: null,
          results: [{ sessionId: "cs_test_SHOULD_NOT_PRINT", action: "repaired" }],
        }),
      );
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--days", "14"],
        env: baseEnv({ FUNNEL_RECONCILE_SITE: origin }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 0, io.getStderr());
      assert.equal(seenBody.dryRun, true);
      assert.equal(seenBody.days, 14);
      assert.equal(seenBody.limit, 100);
      assert.equal(seenHeaders["x-print-admin-token"], "test-admin-token");
      assert.match(io.getStdout(), /mode: dry-run/);
      assert.match(io.getStdout(), /would_repair: 1/);
    },
  );
});

test("valid aggregate response prints expected safe fields only", async () => {
  await withMockServer(
    async (req, res) => {
      await readJsonBody(req);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          dryRun: true,
          days: 7,
          scanned: 10,
          eligible: 4,
          alreadyRecorded: 3,
          repaired: 1,
          sync: null,
          results: [
            {
              sessionId: "cs_test_abc123",
              createdAt: "2026-01-01T00:00:00.000Z",
              orderType: "digital",
              plan: "single",
              action: "repaired",
            },
          ],
        }),
      );
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--site", origin, "--days", "7", "--limit", "50", "--dry-run"],
        env: baseEnv({ FUNNEL_RECONCILE_SITE: undefined, NEXT_PUBLIC_SITE_URL: undefined }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 0, io.getStderr());
      const out = io.getStdout();
      assert.match(out, new RegExp(`site: ${origin}`));
      assert.match(out, /mode: dry-run/);
      assert.match(out, /days: 7/);
      assert.match(out, /limit: 50/);
      assert.match(out, /scanned: 10/);
      assert.match(out, /eligible: 4/);
      assert.match(out, /already_recorded: 3/);
      assert.match(out, /would_repair: 1/);
      assert.doesNotMatch(out, /cs_test_abc123/);
      assert.doesNotMatch(out, /results/);
      assert.doesNotMatch(out, /test-admin-token/);
      assert.doesNotMatch(out, /x-print-admin-token/i);
      assert.doesNotMatch(out, /Authorization/i);
    },
  );
});

test("apply mode with acknowledgement sends dryRun false and may print sync aggregates", async () => {
  let seenBody = null;
  await withMockServer(
    async (req, res) => {
      seenBody = await readJsonBody(req);
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          dryRun: false,
          days: 14,
          scanned: 5,
          eligible: 2,
          alreadyRecorded: 0,
          repaired: 2,
          sync: {
            days: 14,
            dates: ["2026-01-01"],
            previousWindowTotal: 1,
            nextWindowTotal: 2,
            adjustedTotal: 9,
          },
          results: [{ sessionId: "cs_live_SECRET", action: "repaired" }],
        }),
      );
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--apply", "--days", "14"],
        env: baseEnv({
          FUNNEL_RECONCILE_SITE: origin,
          FUNNEL_RECONCILE_ALLOW_APPLY: "1",
        }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 0, io.getStderr());
      assert.equal(seenBody.dryRun, false);
      const out = io.getStdout();
      assert.match(out, /mode: apply/);
      assert.match(out, /repaired: 2/);
      assert.match(out, /sync: previous_window=1 next_window=2 adjusted_total=9/);
      assert.doesNotMatch(out, /cs_live_SECRET/);
      assert.doesNotMatch(out, /dates/);
    },
  );
});

test("--apply without acknowledgement fails before any request", async () => {
  let hit = false;
  const fetchImpl = async () => {
    hit = true;
    throw new Error("fetch should not be called");
  };
  const io = createIo();
  const code = await runFunnelReconcile({
    argv: ["--apply", "--site", "https://example.com"],
    env: baseEnv({
      FUNNEL_RECONCILE_SITE: undefined,
      NEXT_PUBLIC_SITE_URL: undefined,
      FUNNEL_RECONCILE_ALLOW_APPLY: undefined,
    }),
    fetchImpl,
    stdout: io.stdout,
    stderr: io.stderr,
    loadEnv: false,
  });
  assert.equal(code, 1);
  assert.equal(hit, false);
  assert.match(io.getStderr(), /FUNNEL_RECONCILE_ALLOW_APPLY=1/);
});

test("missing site or token fails nonzero", async () => {
  const ioSite = createIo();
  const codeSite = await runFunnelReconcile({
    argv: ["--days", "14"],
    env: { PRINT_ADMIN_TOKEN: "token" },
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
    stdout: ioSite.stdout,
    stderr: ioSite.stderr,
    loadEnv: false,
  });
  assert.equal(codeSite, 1);
  assert.match(ioSite.getStderr(), /Missing site origin/);

  const ioToken = createIo();
  const codeToken = await runFunnelReconcile({
    argv: ["--site", "https://example.com", "--days", "14"],
    env: { PRINT_ADMIN_TOKEN: "" },
    fetchImpl: async () => {
      throw new Error("should not fetch");
    },
    stdout: ioToken.stdout,
    stderr: ioToken.stderr,
    loadEnv: false,
  });
  assert.equal(codeToken, 1);
  assert.match(ioToken.getStderr(), /Missing PRINT_ADMIN_TOKEN/);
});

test("invalid arguments fail nonzero", () => {
  assert.throws(() => parseArgs(["--days"]), /Missing value for --days/);
  assert.throws(() => parseArgs(["--days", "0"]), /--days must be an integer between 1 and 60/);
  assert.throws(() => parseArgs(["--days", "61"]), /--days must be an integer between 1 and 60/);
  assert.throws(() => parseArgs(["--limit", "0"]), /--limit must be an integer between 1 and 500/);
  assert.throws(() => parseArgs(["--limit", "501"]), /--limit must be an integer between 1 and 500/);
  assert.throws(() => parseArgs(["--unknown"]), /Unknown arg/);
  assert.throws(
    () => parseArgs(["--dry-run", "--apply"], baseEnv({ FUNNEL_RECONCILE_SITE: "https://example.com" })),
    /Conflicting flags/,
  );
  assert.throws(() => resolveSiteOrigin({ siteFlag: "notaurl" }), /Malformed/);
  assert.throws(() => resolveSiteOrigin({ siteFlag: "ftp://example.com" }), /protocol must be http or https/);
  assert.throws(() => resolveSiteOrigin({ siteFlag: "https://example.com/path" }), /path is not allowed/);
});

test("HTTP 401/403/503 and ok:false fail nonzero", async () => {
  for (const status of [401, 403, 503]) {
    await withMockServer(
      async (req, res) => {
        await readJsonBody(req);
        res.statusCode = status;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ ok: false, error: status === 503 ? "Stripe not configured" : "Unauthorized" }));
      },
      async (origin) => {
        const io = createIo();
        const code = await runFunnelReconcile({
          argv: ["--days", "14"],
          env: baseEnv({ FUNNEL_RECONCILE_SITE: origin }),
          stdout: io.stdout,
          stderr: io.stderr,
          loadEnv: false,
        });
        assert.equal(code, 1, `expected failure for HTTP ${status}`);
        if (status === 401 || status === 403) {
          assert.match(io.getStderr(), /unauthorized/i);
        } else {
          assert.match(io.getStderr(), /unavailable|503/i);
        }
      },
    );
  }

  await withMockServer(
    async (req, res) => {
      await readJsonBody(req);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: "reconcile failed" }));
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--days", "14"],
        env: baseEnv({ FUNNEL_RECONCILE_SITE: origin }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 1);
      assert.match(io.getStderr(), /ok: false/);
    },
  );
});

test("malformed JSON, timeout, and network failure fail nonzero", async () => {
  await withMockServer(
    async (req, res) => {
      await readJsonBody(req);
      res.setHeader("content-type", "application/json");
      res.end("not-json{");
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--days", "14"],
        env: baseEnv({ FUNNEL_RECONCILE_SITE: origin }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 1);
      assert.match(io.getStderr(), /malformed JSON/i);
    },
  );

  const ioTimeout = createIo();
  const codeTimeout = await runFunnelReconcile({
    argv: ["--site", "https://example.com", "--days", "14"],
    env: baseEnv({ FUNNEL_RECONCILE_SITE: undefined, NEXT_PUBLIC_SITE_URL: undefined }),
    fetchImpl: async (_url, init) => {
      await new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    },
    stdout: ioTimeout.stdout,
    stderr: ioTimeout.stderr,
    timeoutMs: 20,
    loadEnv: false,
  });
  assert.equal(codeTimeout, 1);
  assert.match(ioTimeout.getStderr(), /timed out/i);

  const ioNet = createIo();
  const codeNet = await runFunnelReconcile({
    argv: ["--site", "https://example.com", "--days", "14"],
    env: baseEnv({ FUNNEL_RECONCILE_SITE: undefined, NEXT_PUBLIC_SITE_URL: undefined }),
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
    stdout: ioNet.stdout,
    stderr: ioNet.stderr,
    loadEnv: false,
  });
  assert.equal(codeNet, 1);
  assert.match(ioNet.getStderr(), /network failure/i);
});

test("formatAggregateReport never includes results payload", () => {
  const report = formatAggregateReport(
    { site: "https://example.com", dryRun: true, days: 14, limit: 100 },
    {
      scanned: 1,
      eligible: 1,
      alreadyRecorded: 0,
      repaired: 1,
      results: [{ sessionId: "cs_test_x", email: "buyer@example.com" }],
    },
  );
  assert.doesNotMatch(report, /cs_test_x/);
  assert.doesNotMatch(report, /buyer@example.com/);
  assert.doesNotMatch(report, /results/);
});

test("assertApplyAllowed is fail-closed", () => {
  assert.doesNotThrow(() => assertApplyAllowed({ apply: false }, {}));
  assert.throws(() => assertApplyAllowed({ apply: true }, {}), /FUNNEL_RECONCILE_ALLOW_APPLY=1/);
  assert.throws(() => assertApplyAllowed({ apply: true }, { FUNNEL_RECONCILE_ALLOW_APPLY: "true" }), /FUNNEL_RECONCILE_ALLOW_APPLY=1/);
  assert.doesNotThrow(() => assertApplyAllowed({ apply: true }, { FUNNEL_RECONCILE_ALLOW_APPLY: "1" }));
});

test("failure paths never echo sensitive remote/exception text", async () => {
  const leak = [
    "cs_test_LEAKEDSESSION999",
    "buyer@example.com",
    "PRINT_ADMIN_TOKEN=super-secret-token-value",
    "Authorization: Bearer leaked-auth-token",
    '"results":[{"sessionId":"cs_live_ALSO_LEAK"}]',
  ].join(" | ");

  function assertNoLeak(io, label) {
    const combined = `${io.getStdout()}\n${io.getStderr()}`;
    assert.doesNotMatch(combined, /cs_test_LEAKEDSESSION999/, label);
    assert.doesNotMatch(combined, /cs_live_ALSO_LEAK/, label);
    assert.doesNotMatch(combined, /buyer@example.com/, label);
    assert.doesNotMatch(combined, /super-secret-token-value/, label);
    assert.doesNotMatch(combined, /leaked-auth-token/, label);
    assert.doesNotMatch(combined, /"results"\s*:/, label);
    assert.doesNotMatch(combined, /Authorization:\s*Bearer/i, label);
  }

  // HTTP 503 with sensitive body.error
  await withMockServer(
    async (req, res) => {
      await readJsonBody(req);
      res.statusCode = 503;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: leak }));
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--days", "14"],
        env: baseEnv({ FUNNEL_RECONCILE_SITE: origin }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 1);
      assert.match(io.getStderr(), /HTTP 503/);
      assert.match(io.getStderr(), /unavailable/i);
      assertNoLeak(io, "503");
    },
  );

  // Generic non-2xx with sensitive body.error
  await withMockServer(
    async (req, res) => {
      await readJsonBody(req);
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: leak }));
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--days", "14"],
        env: baseEnv({ FUNNEL_RECONCILE_SITE: origin }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 1);
      assert.match(io.getStderr(), /HTTP 500/);
      assertNoLeak(io, "500");
    },
  );

  // { ok: false } on HTTP 200 with sensitive body.error
  await withMockServer(
    async (req, res) => {
      await readJsonBody(req);
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: false, error: leak }));
    },
    async (origin) => {
      const io = createIo();
      const code = await runFunnelReconcile({
        argv: ["--days", "14"],
        env: baseEnv({ FUNNEL_RECONCILE_SITE: origin }),
        stdout: io.stdout,
        stderr: io.stderr,
        loadEnv: false,
      });
      assert.equal(code, 1);
      assert.match(io.getStderr(), /ok: false/);
      assertNoLeak(io, "ok:false");
    },
  );

  // Network failure with sensitive exception message
  {
    const io = createIo();
    const code = await runFunnelReconcile({
      argv: ["--site", "https://example.com", "--days", "14"],
      env: baseEnv({ FUNNEL_RECONCILE_SITE: undefined, NEXT_PUBLIC_SITE_URL: undefined }),
      fetchImpl: async () => {
        throw new Error(`ECONNREFUSED ${leak}`);
      },
      stdout: io.stdout,
      stderr: io.stderr,
      loadEnv: false,
    });
    assert.equal(code, 1);
    assert.match(io.getStderr(), /network failure/i);
    assertNoLeak(io, "network");
  }

  // Response-body read failure with sensitive exception message
  {
    const io = createIo();
    const code = await runFunnelReconcile({
      argv: ["--site", "https://example.com", "--days", "14"],
      env: baseEnv({ FUNNEL_RECONCILE_SITE: undefined, NEXT_PUBLIC_SITE_URL: undefined }),
      fetchImpl: async () => ({
        status: 200,
        async text() {
          throw new Error(`body-read-failed ${leak}`);
        },
      }),
      stdout: io.stdout,
      stderr: io.stderr,
      loadEnv: false,
    });
    assert.equal(code, 1);
    assert.match(io.getStderr(), /reading response body/i);
    assertNoLeak(io, "body-read");
  }

  // Unexpected top-level failure (stdout.write throws with sensitive text)
  {
    const io = createIo();
    const code = await runFunnelReconcile({
      argv: ["--site", "https://example.com", "--days", "14"],
      env: baseEnv({ FUNNEL_RECONCILE_SITE: undefined, NEXT_PUBLIC_SITE_URL: undefined }),
      fetchImpl: async () => ({
        status: 200,
        async text() {
          return JSON.stringify({
            ok: true,
            dryRun: true,
            days: 14,
            scanned: 0,
            eligible: 0,
            alreadyRecorded: 0,
            repaired: 0,
            sync: null,
            results: [],
          });
        },
      }),
      stdout: {
        write() {
          throw new Error(`unexpected-write ${leak}`);
        },
      },
      stderr: io.stderr,
      loadEnv: false,
    });
    assert.equal(code, 1);
    assert.match(io.getStderr(), /Funnel reconcile failed/i);
    assertNoLeak(io, "top-level");
  }
});

test("writeOperatorError redacts unsafe messages via shared boundary", () => {
  const io = createIo();
  const written = writeOperatorError(
    io.stderr,
    "boom cs_test_LEAK buyer@example.com PRINT_ADMIN_TOKEN=secret Authorization: Bearer abc results",
  );
  assert.match(written, /Funnel reconcile failed/);
  assert.doesNotMatch(written, /cs_test_LEAK/);
  assert.doesNotMatch(written, /buyer@example.com/);
  assert.doesNotMatch(written, /PRINT_ADMIN_TOKEN=secret/);
  assert.doesNotMatch(io.getStderr(), /Bearer abc/);
  assert.equal(containsSensitiveOperatorText("safe fixed message"), false);
  assert.equal(containsSensitiveOperatorText("see buyer@example.com"), true);
});

test("contract constants document the restore surface", () => {
  assert.equal(FUNNEL_RECONCILE_CONTRACT.endpointPath, "/api/analytics/funnel/reconcile");
  assert.equal(FUNNEL_RECONCILE_CONTRACT.defaultDays, 14);
  assert.equal(FUNNEL_RECONCILE_CONTRACT.defaultLimit, 100);
  assert.equal(FUNNEL_RECONCILE_CONTRACT.applyAckEnv, "FUNNEL_RECONCILE_ALLOW_APPLY");
  assert.equal(FUNNEL_RECONCILE_CONTRACT.tokenEnv, "PRINT_ADMIN_TOKEN");
});
