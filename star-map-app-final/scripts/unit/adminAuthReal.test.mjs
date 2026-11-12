/**
 * adminAuth.mjs — REAL timing-safe token check + header readers.
 *
 * Regression targets:
 * - missing/blank candidate or configured token → false
 * - length mismatch → false (no throw)
 * - equal tokens → true; unequal same-length → false
 * - header precedence: x-print-admin-token > x-admin-token > Bearer
 */
import assert from "node:assert/strict";
import test from "node:test";

const { hasValidAdminToken, readAdminTokenFromHeaders } = await import(
  "../../src/lib/adminAuth.mjs"
);

test("hasValidAdminToken: blanks, length mismatch, match, and mismatch", () => {
  assert.equal(hasValidAdminToken(null, "secret"), false);
  assert.equal(hasValidAdminToken("secret", null), false);
  assert.equal(hasValidAdminToken("  ", "secret"), false);
  assert.equal(hasValidAdminToken("short", "longer-token"), false);
  assert.equal(hasValidAdminToken("secret-token", "secret-token"), true);
  assert.equal(hasValidAdminToken(" secret-token ", "secret-token"), true);
  assert.equal(hasValidAdminToken("secret-tokem", "secret-token"), false);
});

test("readAdminTokenFromHeaders: precedence across print / admin / bearer", () => {
  const headers = {
    get(name) {
      return this.map[name.toLowerCase()] ?? null;
    },
    map: {
      "x-print-admin-token": " print-token ",
      "x-admin-token": "generic-token",
      authorization: "Bearer bearer-token",
    },
  };
  assert.equal(readAdminTokenFromHeaders(headers), "print-token");

  headers.map = {
    "x-admin-token": " generic-token ",
    authorization: "Bearer bearer-token",
  };
  assert.equal(readAdminTokenFromHeaders(headers), "generic-token");

  headers.map = { authorization: "Bearer   bearer-token  " };
  assert.equal(readAdminTokenFromHeaders(headers), "bearer-token");

  headers.map = { authorization: "Basic nope" };
  assert.equal(readAdminTokenFromHeaders(headers), null);

  headers.map = {};
  assert.equal(readAdminTokenFromHeaders(headers), null);
});
