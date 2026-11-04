import { register } from "node:module";
import { createServer } from "node:http";
register("../../../scripts/unit/tsAliasLoader.mjs", import.meta.url);
register("../../../scripts/unit/gaConsentMode.hooks.mjs", import.meta.url);
register("./hooks.mjs", import.meta.url);
// The subprocess receives an allowlisted environment, never operator secrets.
process.env.STRIPE_SECRET_KEY = "sk_test_playwright_dummy";
process.env.STARMAP_KV_ALLOW_LOCAL = "1";
process.env.PRINT_CHECKOUT_ENABLED = "true";
globalThis.fetch = async () => { throw new Error("C14 fixture forbids external fetch"); };
const { state } = await import("./stripe.mjs");
const { kv } = await import("../../../src/lib/kv.ts");
const data = new Map();
kv.get = async (key) => data.get(key) ?? null;
kv.set = async (key, value) => { data.set(key, value); return "OK"; };
kv.setDurable = kv.set;
kv.incr = async (key, by = 1) => { const next = (data.get(key) ?? 0) + by; data.set(key, next); return next; };
const { NextRequest } = await import("next/server");
const route = await import("../../../src/app/api/checkout/route.ts");
const server = createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    if (req.url === "/__fixture" && req.method === "POST") {
      Object.assign(state, JSON.parse(body), { calls: [], lookups: [] });
      data.clear();
      data.set("map:11111111-1111-4111-8111-111111111111", {
        location: { latitude: 48.8566, longitude: 2.3522 },
      });
      res.end("{}");
    } else if (req.url === "/__map" && req.method === "POST") {
      data.set("map:11111111-1111-4111-8111-111111111111", JSON.parse(body));
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ id: "11111111-1111-4111-8111-111111111111" }));
    } else if (req.url === "/__fixture" && req.method === "GET") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(state));
    } else if (new URL(req.url, "http://localhost").pathname === "/api/checkout") {
      const request = new NextRequest(`http://127.0.0.1${req.url}`, {
        method: req.method, headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.14" },
        ...(req.method === "POST" ? { body } : {}),
      });
      const response = await route[req.method](request);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
    } else { res.writeHead(404); res.end(); }
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
server.listen(0, "127.0.0.1", () => process.send?.({ port: server.address().port }) ?? console.log(server.address().port));
process.on("disconnect", () => server.close());
