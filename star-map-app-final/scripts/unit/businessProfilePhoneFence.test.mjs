/**
 * businessProfile.ts — support phone must stay unpublished.
 *
 * Regression targets:
 * - getBusinessProfile never emits phone even when NEXT_PUBLIC_SUPPORT_PHONE is set
 * - getBusinessPhoneHref stays empty under the same condition
 * - name/email/hours still resolve from env or defaults
 *
 * Module caches env at import time, so each assertion reloads a fresh module.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";

register("./tsAliasLoader.mjs", import.meta.url);

const MODULE_URL = pathToFileURL(
  path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../src/lib/businessProfile.ts"),
).href;

async function loadFresh() {
  return import(`${MODULE_URL}?t=${Date.now()}-${Math.random()}`);
}

test("business profile never publishes phone; href stays empty", async () => {
  const savedPhone = process.env.NEXT_PUBLIC_SUPPORT_PHONE;
  const savedName = process.env.NEXT_PUBLIC_BUSINESS_NAME;
  const savedEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  try {
    process.env.NEXT_PUBLIC_SUPPORT_PHONE = "5551234567";
    process.env.NEXT_PUBLIC_BUSINESS_NAME = "TestCo";
    process.env.NEXT_PUBLIC_SUPPORT_EMAIL = "help@example.test";
    const mod = await loadFresh();
    const profile = mod.getBusinessProfile();
    assert.equal(profile.name, "TestCo");
    assert.equal(profile.email, "help@example.test");
    assert.equal("phone" in profile, false);
    assert.equal(mod.getBusinessPhoneHref(), "");
  } finally {
    if (savedPhone === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_PHONE;
    else process.env.NEXT_PUBLIC_SUPPORT_PHONE = savedPhone;
    if (savedName === undefined) delete process.env.NEXT_PUBLIC_BUSINESS_NAME;
    else process.env.NEXT_PUBLIC_BUSINESS_NAME = savedName;
    if (savedEmail === undefined) delete process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
    else process.env.NEXT_PUBLIC_SUPPORT_EMAIL = savedEmail;
  }
});
