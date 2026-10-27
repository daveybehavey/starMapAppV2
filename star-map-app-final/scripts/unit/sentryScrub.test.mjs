/**
 * SQ-58 / issue #429: Sentry privacy contract tests.
 *
 * The scrubber in src/lib/sentryScrub.ts is the single fence between the SDKs
 * and Sentry's ingestion. These tests push privacy canaries (fake email,
 * address, card number, tokens, asset/map identifiers, URLs) through every
 * field the SDK might populate, then inspect the SERIALIZED outbound event —
 * no canary may survive anywhere in the JSON.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  filterSentryIntegrationsByName,
  resolveSentryConfig,
  safeScrubSentryEvent,
  sanitizeSentryFilename,
  scrubSentryEvent,
} from "../../src/lib/sentryScrub.ts";

const CANARIES = [
  "canary.person@example.invalid",
  "Canary Person",
  "123 Canary Lane",
  "4111111111111111",
  "CANARYTOKEN123",
  "canary-session-id",
  "canary-map-id",
  "canary-asset-id",
  "hd1:canary-session:canary-map:canary-fingerprint",
  "canary-order-id",
  "+1-555-010-1999",
];

function dirtyEvent() {
  return {
    event_id: "0123456789abcdef0123456789abcdef",
    timestamp: 1793000000.5,
    platform: "javascript",
    level: "error",
    environment: "production",
    release: "starmapco@abc1234",
    transaction: "/api/checkout?token=CANARYTOKEN123",
    server_name: "canary-hostname",
    user: {
      id: "canary-user-id",
      email: "canary.person@example.invalid",
      ip_address: "203.0.113.99",
    },
    request: {
      url: "https://starmapco.com/api/print/assets?id=canary-asset-id&token=CANARYTOKEN123",
      method: "POST",
      headers: { authorization: "Bearer CANARYTOKEN123", cookie: "session=canary-session-id" },
      cookies: { session: "canary-session-id" },
      data: { email: "canary.person@example.invalid", card: "4111111111111111" },
      query_string: "token=CANARYTOKEN123",
      env: { SECRET: "CANARYTOKEN123" },
    },
    breadcrumbs: [
      {
        type: "navigation",
        message: "from /editor?map=canary-map-id",
        data: { to: "https://starmapco.com/download?claim=CANARYTOKEN123" },
      },
      { type: "console", message: "order canary-order-id for canary.person@example.invalid" },
    ],
    contexts: {
      app: { app_name: "browser", device_app_hash: "canary-device-hash" },
      browser: { name: "Chrome", version: "999" },
      device: { id: "canary-device-id" },
      os: { name: "Windows" },
      runtime: { name: "browser", version: "1.2.3" },
      trace: { trace_id: "canary-trace" },
    },
    extra: {
      orderPayload: { id: "canary-order-id", email: "canary.person@example.invalid" },
      address: "123 Canary Lane",
      phone: "+1-555-010-1999",
      publicationArtifactId: "hd1:canary-session:canary-map:canary-fingerprint",
    },
    tags: {
      runtime: "worker",
      operation: "checkout_failure",
      status_class: "canary-not-a-class",
      referrer: "canary.person@example.invalid",
    },
    fingerprint: ["{{ default }}", "checkout_failure", "canary-map-id"],
    sdk: { name: "sentry.javascript.cloudflare", version: "11.9.0" },
    exception: {
      values: [
        {
          type: "Error",
          value:
            "Stripe charge failed for canary.person@example.invalid order canary-order-id card 4111111111111111 token CANARYTOKEN123",
          module: "checkout",
          thread_id: 1,
          mechanism: { type: "generic", handled: false },
          stacktrace: {
            frames: [
              {
                filename:
                  "https://starmapco.com/_next/static/chunks/checkout.js?token=CANARYTOKEN123#frag",
                abs_path: "/home/canary-user/app/checkout.js",
                function: "submitCheckout",
                lineno: 42,
                colno: 7,
                in_app: true,
                vars: { email: "canary.person@example.invalid", token: "CANARYTOKEN123" },
                context_line: "const email = 'canary.person@example.invalid';",
                pre_context: ["// canary-order-id"],
              },
            ],
          },
        },
      ],
    },
  };
}

test("serialized scrubbed event contains no canary material", () => {
  const scrubbed = scrubSentryEvent(dirtyEvent());
  assert.ok(scrubbed, "event with an exception must survive scrubbing");
  const serialized = JSON.stringify(scrubbed);
  for (const canary of CANARIES) {
    assert.ok(
      !serialized.includes(canary),
      `canary leaked into outbound event: ${canary}`,
    );
  }
  // Whole field families are gone, not redacted.
  assert.equal("user" in scrubbed, false);
  assert.equal("request" in scrubbed, false);
  assert.equal("breadcrumbs" in scrubbed, false);
  assert.equal("extra" in scrubbed, false);
  assert.equal("transaction" in scrubbed, false);
  assert.equal("server_name" in scrubbed, false);
});

test("scrubbed event keeps only the allowlisted diagnostic shape", () => {
  const scrubbed = scrubSentryEvent(dirtyEvent());
  assert.ok(scrubbed);
  assert.equal(scrubbed.event_id, "0123456789abcdef0123456789abcdef");
  assert.equal(scrubbed.release, "starmapco@abc1234");
  assert.equal(scrubbed.environment, "production");
  assert.deepEqual(scrubbed.tags, { runtime: "worker", operation: "checkout_failure" });
  assert.deepEqual(scrubbed.fingerprint, ["{{ default }}", "checkout_failure"]);
  assert.deepEqual(scrubbed.contexts, { runtime: { name: "browser", version: "1.2.3" } });

  const exception = scrubbed.exception;
  assert.equal(exception.values.length, 1);
  const value = exception.values[0];
  assert.equal(value.type, "Error");
  // Raw provider/customer message replaced by the fixed operation code.
  assert.equal(value.value, "operation:checkout_failure");
  const frame = value.stacktrace.frames[0];
  assert.equal(frame.filename, "/_next/static/chunks/checkout.js");
  assert.equal(frame.function, "submitCheckout");
  assert.equal(frame.lineno, 42);
  assert.equal("vars" in frame, false);
  assert.equal("context_line" in frame, false);
  assert.equal("abs_path" in frame, false);
});

test("events without an exception payload are dropped", () => {
  assert.equal(scrubSentryEvent(null), null);
  assert.equal(scrubSentryEvent("boom"), null);
  assert.equal(scrubSentryEvent({ level: "error", message: "hi" }), null);
  assert.equal(scrubSentryEvent({ exception: { values: [] } }), null);
  assert.equal(scrubSentryEvent({ exception: { values: [null, 42] } }), null);
});

test("scrubber failure drops the event instead of sending it raw", () => {
  const poisoned = {};
  Object.defineProperty(poisoned, "exception", {
    get() {
      throw new Error("canary-boom");
    },
  });
  assert.equal(safeScrubSentryEvent(poisoned), null);
});

test("unknown operation codes and tag values never survive", () => {
  const event = dirtyEvent();
  event.tags = { operation: "canary_freeform_code", stage: "canary-stage" };
  const scrubbed = scrubSentryEvent(event);
  assert.ok(scrubbed);
  assert.equal(scrubbed.tags, undefined);
  assert.equal(scrubbed.exception.values[0].value, "[scrubbed exception]");
});

test("malformed identifiers are dropped, well-formed ones kept", () => {
  const event = dirtyEvent();
  event.event_id = "canary-not-hex";
  event.release = "bad release with spaces";
  const scrubbed = scrubSentryEvent(event);
  assert.ok(scrubbed);
  assert.equal("event_id" in scrubbed, false);
  assert.equal("release" in scrubbed, false);
  assert.equal(scrubbed.level, "error");
});

test("sanitizeSentryFilename strips scheme, host, query and fragment", () => {
  assert.equal(
    sanitizeSentryFilename("https://starmapco.com/_next/static/a.js?v=1#x"),
    "/_next/static/a.js",
  );
  assert.equal(sanitizeSentryFilename("webpack:///./src/lib/x.ts"), "/src/lib/x.ts");
  assert.equal(sanitizeSentryFilename(""), "app://unknown");
  assert.equal(sanitizeSentryFilename(undefined), "app://unknown");
  assert.equal(sanitizeSentryFilename(42), "app://unknown");
});

test("browser integration allowlist drops capture-heavy defaults", () => {
  const defaults = [
    { name: "GlobalHandlers" },
    { name: "Breadcrumbs" },
    { name: "Console" },
    { name: "HttpContext" },
    { name: "BrowserSession" },
    { name: "CultureContext" },
    { name: "ConversationId" },
    { name: "BrowserApiErrors" },
    { name: "Dedupe" },
    { name: "LinkedErrors" },
    { name: "InboundFilters" },
    { name: "FunctionToString" },
  ];
  const kept = filterSentryIntegrationsByName(defaults).map((i) => i.name);
  assert.deepEqual(kept, [
    "GlobalHandlers",
    "BrowserApiErrors",
    "Dedupe",
    "LinkedErrors",
    "InboundFilters",
    "FunctionToString",
  ]);
});

test("resolveSentryConfig stays inert without a usable DSN", () => {
  assert.equal(resolveSentryConfig({}), null);
  assert.equal(resolveSentryConfig({ dsn: "" }), null);
  assert.equal(resolveSentryConfig({ dsn: "not-a-dsn" }), null);
  assert.equal(resolveSentryConfig({ dsn: "https://example.invalid/no-key" }), null);
});

test("resolveSentryConfig accepts a DSN and sanitizes release/environment", () => {
  const config = resolveSentryConfig({
    dsn: "https://abcdef1234567890@o123.ingest.example.invalid/456",
    release: "starmapco@abc1234",
    environment: "production",
  });
  assert.deepEqual(config, {
    dsn: "https://abcdef1234567890@o123.ingest.example.invalid/456",
    release: "starmapco@abc1234",
    environment: "production",
  });
  const fallback = resolveSentryConfig({
    dsn: "https://abcdef1234567890@o123.ingest.example.invalid/456",
    release: "bad release",
    environment: "bad env",
  });
  assert.deepEqual(fallback, {
    dsn: "https://abcdef1234567890@o123.ingest.example.invalid/456",
    environment: "production",
  });
});
