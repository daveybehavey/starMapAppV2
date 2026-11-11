import { register } from "node:module";
import assert from "node:assert/strict";
register("./tsAliasLoader.mjs", import.meta.url);
register("./metaCheckout.hooks.mjs", import.meta.url);
const { NextRequest } = await import("next/server.js");
const { GET } = await import("../../src/app/api/meta/checkout/route.ts");
const response = GET(new NextRequest("https://starmapco.com/api/meta/checkout?product_id=merch%3Apins_set&coupon_code=XMAS15"));
assert.equal(new URL(response.headers.get("location")).pathname, "/shop");
assert.equal(response.headers.get("set-cookie"), null);
