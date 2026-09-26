import assert from "node:assert/strict";
import test from "node:test";
import {
  hasFunnelDashboardAccess,
  isFunnelProductionRuntime,
} from "./funnelDashboardAccess.harness.mjs";

test("isFunnelProductionRuntime prefers VERCEL_ENV over NODE_ENV", () => {
  assert.equal(isFunnelProductionRuntime({ VERCEL_ENV: "production", NODE_ENV: "production" }), true);
  assert.equal(isFunnelProductionRuntime({ VERCEL_ENV: "preview", NODE_ENV: "production" }), false);
  assert.equal(isFunnelProductionRuntime({ VERCEL_ENV: "development", NODE_ENV: "production" }), false);
  assert.equal(isFunnelProductionRuntime({ NODE_ENV: "production" }), true);
  assert.equal(isFunnelProductionRuntime({ NODE_ENV: "development" }), false);
  assert.equal(isFunnelProductionRuntime({}), false);
});

test("production without FUNNEL_DASHBOARD_TOKEN denies public access", () => {
  assert.equal(
    hasFunnelDashboardAccess("", { NODE_ENV: "production", FUNNEL_DASHBOARD_TOKEN: "" }),
    false,
  );
  assert.equal(
    hasFunnelDashboardAccess("anything", {
      VERCEL_ENV: "production",
      FUNNEL_DASHBOARD_TOKEN: undefined,
    }),
    false,
  );
});

test("non-production without token stays open for local/dev convenience", () => {
  assert.equal(
    hasFunnelDashboardAccess("", { NODE_ENV: "development", FUNNEL_DASHBOARD_TOKEN: "" }),
    true,
  );
  assert.equal(
    hasFunnelDashboardAccess(null, { VERCEL_ENV: "preview", NODE_ENV: "production" }),
    true,
  );
});

test("configured token requires an exact match (timing-safe)", () => {
  const env = { NODE_ENV: "production", FUNNEL_DASHBOARD_TOKEN: "secret-token" };
  assert.equal(hasFunnelDashboardAccess("secret-token", env), true);
  assert.equal(hasFunnelDashboardAccess("wrong-token", env), false);
  assert.equal(hasFunnelDashboardAccess("", env), false);
  assert.equal(hasFunnelDashboardAccess("secret-token ", env), true);
});

test("preview with configured token still requires the token", () => {
  const env = { VERCEL_ENV: "preview", NODE_ENV: "production", FUNNEL_DASHBOARD_TOKEN: "ops-secret" };
  assert.equal(hasFunnelDashboardAccess("ops-secret", env), true);
  assert.equal(hasFunnelDashboardAccess("", env), false);
});
