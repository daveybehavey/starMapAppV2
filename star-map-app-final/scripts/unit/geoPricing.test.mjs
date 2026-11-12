/**
 * geoPricing.ts — country-keyed digital-single price map.
 *
 * Regression targets:
 * - feature stays dark when GEO_DIGITAL_SINGLE_PRICING_ENABLED is unset/false
 * - malformed / under-floor / non-ISO country entries are dropped, not priced
 * - enabled map returns the rounded cents for a valid country
 * - getRequestCountry prefers cf-ipcountry, then vercel, cloudfront, x-country
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { getGeoDigitalSinglePrice, getRequestCountry } = await import(
  "../../src/lib/geoPricing.ts"
);

const TOUCHED = [
  "GEO_DIGITAL_SINGLE_PRICING_ENABLED",
  "GEO_DIGITAL_SINGLE_PRICING_JSON",
  "GEO_DIGITAL_SINGLE_MIN_CENTS",
];

function withEnv(overrides, fn) {
  const saved = new Map(TOUCHED.map((k) => [k, process.env[k]]));
  for (const k of TOUCHED) delete process.env[k];
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const k of TOUCHED) {
      const v = saved.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function fakeReq(headers) {
  return {
    headers: {
      get(name) {
        const key = String(name).toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === key) return v;
        }
        return null;
      },
    },
  };
}

test("geo pricing stays dark when the enable flag is unset or false", () => {
  withEnv(
    {
      GEO_DIGITAL_SINGLE_PRICING_JSON: JSON.stringify({ US: 500 }),
    },
    () => {
      assert.equal(getGeoDigitalSinglePrice("US"), null);
    },
  );
  withEnv(
    {
      GEO_DIGITAL_SINGLE_PRICING_ENABLED: "false",
      GEO_DIGITAL_SINGLE_PRICING_JSON: JSON.stringify({ US: 500 }),
    },
    () => {
      assert.equal(getGeoDigitalSinglePrice("US"), null);
    },
  );
});

test("enabled map returns the country cents; unknown / invalid country returns null", () => {
  withEnv(
    {
      GEO_DIGITAL_SINGLE_PRICING_ENABLED: "true",
      GEO_DIGITAL_SINGLE_PRICING_JSON: JSON.stringify({ us: 450, CA: 600.4 }),
    },
    () => {
      assert.deepEqual(getGeoDigitalSinglePrice("US"), { country: "US", amountCents: 450 });
      assert.deepEqual(getGeoDigitalSinglePrice("ca"), { country: "CA", amountCents: 600 });
      assert.equal(getGeoDigitalSinglePrice("GB"), null);
      assert.equal(getGeoDigitalSinglePrice(null), null);
      assert.equal(getGeoDigitalSinglePrice("USA"), null);
      assert.equal(getGeoDigitalSinglePrice(""), null);
    },
  );
});

test("entries below the min floor or non-finite values are dropped (default floor $3.00)", () => {
  withEnv(
    {
      GEO_DIGITAL_SINGLE_PRICING_ENABLED: "1",
      GEO_DIGITAL_SINGLE_PRICING_JSON: JSON.stringify({
        US: 299,
        CA: 300,
        MX: "nope",
        ZZ: -1,
      }),
    },
    () => {
      assert.equal(getGeoDigitalSinglePrice("US"), null);
      assert.deepEqual(getGeoDigitalSinglePrice("CA"), { country: "CA", amountCents: 300 });
      assert.equal(getGeoDigitalSinglePrice("MX"), null);
    },
  );
});

test("malformed JSON yields an empty map (never throws)", () => {
  withEnv(
    {
      GEO_DIGITAL_SINGLE_PRICING_ENABLED: "yes",
      GEO_DIGITAL_SINGLE_PRICING_JSON: "{not-json",
    },
    () => {
      assert.equal(getGeoDigitalSinglePrice("US"), null);
    },
  );
});

test("custom min floor raises the accept bar", () => {
  withEnv(
    {
      GEO_DIGITAL_SINGLE_PRICING_ENABLED: "true",
      GEO_DIGITAL_SINGLE_MIN_CENTS: "500",
      GEO_DIGITAL_SINGLE_PRICING_JSON: JSON.stringify({ US: 499, CA: 500 }),
    },
    () => {
      assert.equal(getGeoDigitalSinglePrice("US"), null);
      assert.deepEqual(getGeoDigitalSinglePrice("CA"), { country: "CA", amountCents: 500 });
    },
  );
});

test("getRequestCountry prefers Cloudflare, then Vercel, CloudFront, then x-country", () => {
  assert.equal(getRequestCountry(fakeReq({ "cf-ipcountry": "ca" })), "CA");
  // cf-ipcountry wins even when others disagree
  assert.equal(
    getRequestCountry(
      fakeReq({
        "cf-ipcountry": "DE",
        "x-vercel-ip-country": "FR",
        "cloudfront-viewer-country": "IT",
        "x-country": "ES",
      }),
    ),
    "DE",
  );
  // When Cloudflare is absent/invalid, fall through the remaining headers.
  assert.equal(
    getRequestCountry(
      fakeReq({
        "cf-ipcountry": "USA", // not ISO-2 — skipped
        "x-vercel-ip-country": "FR",
        "cloudfront-viewer-country": "IT",
      }),
    ),
    "FR",
  );
  assert.equal(
    getRequestCountry(fakeReq({ "cloudfront-viewer-country": "it" })),
    "IT",
  );
  assert.equal(getRequestCountry(fakeReq({ "x-country": "es" })), "ES");
  assert.equal(getRequestCountry(fakeReq({ "cf-ipcountry": "USA" })), null);
  assert.equal(getRequestCountry(fakeReq({})), null);
});
