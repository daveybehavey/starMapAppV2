#!/usr/bin/env node

import { createSign, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { seedEnv } from "./merchant-shipping-common.mjs";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_OAUTH_TOKEN_PATH = path.resolve(process.cwd(), "reports", "gsc-oauth-token.json");

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function loadServiceAccountJson() {
  const inlineJson = process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) return JSON.parse(inlineJson);

  const configuredPath =
    process.env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!configuredPath) {
    throw new Error(
      "Missing Google Search Console service account credentials. Set GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_PATH, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON.",
    );
  }

  return JSON.parse(readFileSync(configuredPath, "utf8"));
}

function loadOauthClient() {
  const inlineJson = process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_JSON?.trim();
  if (inlineJson) return JSON.parse(inlineJson);

  const configuredPath = process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_JSON_PATH?.trim();
  if (configuredPath) {
    return JSON.parse(readFileSync(configuredPath, "utf8"));
  }

  const clientId = process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_SECRET?.trim();
  if (clientId) {
    return { installed: { client_id: clientId, client_secret: clientSecret || "" } };
  }
  return null;
}

function extractInstalledClient(oauthClientJson) {
  const installed = oauthClientJson?.installed || oauthClientJson?.web || null;
  const clientId = String(installed?.client_id || "").trim();
  const clientSecret = String(installed?.client_secret || "").trim();
  if (!clientId) throw new Error("OAuth client JSON missing client_id");
  return { clientId, clientSecret };
}

async function tokenRequest(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function readOauthToken(tokenPath) {
  try {
    const raw = readFileSync(tokenPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeOauthToken(tokenPath, token) {
  mkdirSync(path.dirname(tokenPath), { recursive: true });
  writeFileSync(tokenPath, `${JSON.stringify(token, null, 2)}\n`, "utf8");
}

async function getAccessTokenViaRefreshToken({ clientId, clientSecret, refreshToken }) {
  const { response, payload } = await tokenRequest("https://oauth2.googleapis.com/token", {
    client_id: clientId,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh Google access token: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }
  const token = String(payload.access_token || "").trim();
  if (!token) throw new Error("Google token refresh response missing access_token");
  const expiresIn = Number(payload.expires_in || 0);
  return { accessToken: token, expiresIn };
}

function pickLoopbackRedirectUri(oauthClientJson) {
  const installed = oauthClientJson?.installed || oauthClientJson?.web || null;
  const uris = Array.isArray(installed?.redirect_uris) ? installed.redirect_uris.map((u) => String(u || "").trim()) : [];
  const preferred =
    uris.find((u) => /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(u)) ||
    uris.find((u) => /^https?:\/\/(127\.0\.0\.1|localhost)/i.test(u)) ||
    "";
  if (!preferred) {
    throw new Error(
      "OAuth client JSON is missing redirect_uris with http://127.0.0.1 or http://localhost.\n" +
        "Fix: Google Cloud Console → Credentials → your Desktop OAuth client → add Authorized redirect URI like:\n" +
        "  http://127.0.0.1:8765/\n" +
        "Then re-download the JSON and update GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_JSON_PATH.",
    );
  }
  return preferred;
}

function parsePortFromRedirectUri(redirectUri) {
  const u = new URL(redirectUri);
  // Google sometimes ships Desktop OAuth JSON with `http://localhost` (implicit port 80).
  // Listening on 80 can fail without admin rights, so we prefer an explicit high port in the JSON.
  const port = u.port ? Number.parseInt(u.port, 10) : 80;
  if (!Number.isFinite(port) || port <= 0) throw new Error(`Invalid redirect URI port: ${redirectUri}`);
  return { port, pathname: u.pathname || "/" };
}

function openDefaultBrowser(url) {
  const opts = { stdio: "ignore", detached: true, windowsHide: true };
  // Never use `cmd /c start "" <url>` for OAuth URLs: `&` in the query is treated as a command
  // separator, the URL is truncated, and Google returns "Required parameter is missing: response_type".
  if (process.platform === "win32") {
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], opts).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [url], opts).unref();
    return;
  }
  spawn("xdg-open", [url], opts).unref();
}

async function oauthLoopbackLogin({ clientId, clientSecret, oauthClientJson, tokenPath }) {
  const redirectUri = pickLoopbackRedirectUri(oauthClientJson);
  const { port, pathname } = parsePortFromRedirectUri(redirectUri);

  const state = randomBytes(16).toString("hex");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPE);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("state", state);

  const accessToken = await new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (!req.url) {
          res.statusCode = 400;
          res.end("Bad request");
          return;
        }

        const requestUrl = new URL(req.url, redirectUri);
        if (requestUrl.pathname !== pathname) {
          res.statusCode = 404;
          res.end("Not found");
          return;
        }

        const returnedState = requestUrl.searchParams.get("state") || "";
        const code = requestUrl.searchParams.get("code") || "";
        const error = requestUrl.searchParams.get("error") || "";

        if (error) {
          res.statusCode = 400;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(`<html><body><pre>OAuth error: ${error}</pre><p>You can close this tab.</p></body></html>`);
          reject(new Error(`OAuth error: ${error}`));
          server.close();
          return;
        }

        if (!code || returnedState !== state) {
          res.statusCode = 400;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(`<html><body><pre>Missing code or invalid state</pre></body></html>`);
          reject(new Error("OAuth callback missing code or invalid state"));
          server.close();
          return;
        }

        const tokenRes = await tokenRequest("https://oauth2.googleapis.com/token", {
          code,
          client_id: clientId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        });

        if (!tokenRes.response.ok) {
          res.statusCode = 400;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(
            `<html><body><pre>Token exchange failed: HTTP ${tokenRes.response.status}\n${JSON.stringify(
              tokenRes.payload,
              null,
              2,
            )}</pre></body></html>`,
          );
          reject(new Error(`Token exchange failed: HTTP ${tokenRes.response.status} ${JSON.stringify(tokenRes.payload)}`));
          server.close();
          return;
        }

        const refreshToken = String(tokenRes.payload.refresh_token || "").trim();
        const at = String(tokenRes.payload.access_token || "").trim();
        if (!at) {
          res.statusCode = 500;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end(`<html><body><pre>Missing access_token in token response</pre></body></html>`);
          reject(new Error("Missing access_token in token response"));
          server.close();
          return;
        }

        if (refreshToken) {
          writeOauthToken(tokenPath, {
            refresh_token: refreshToken,
            obtained_at: new Date().toISOString(),
          });
        }

        res.statusCode = 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.end(
          "<html><body><h3>Signed in</h3><p>You can close this tab and return to the terminal.</p></body></html>",
        );

        resolve(at);
        server.close();
      } catch (err) {
        try {
          res.statusCode = 500;
          res.setHeader("content-type", "text/html; charset=utf-8");
          res.end("<html><body><pre>Internal error</pre></body></html>");
        } catch {
          // ignore
        }
        reject(err instanceof Error ? err : new Error(String(err)));
        server.close();
      }
    });

    server.listen(port, "127.0.0.1", () => {
      console.log("\nGoogle Search Console OAuth login required.");
      console.log(`Opening browser to sign in… If it does not open, visit:\n${authUrl.toString()}\n`);
      try {
        openDefaultBrowser(authUrl.toString());
      } catch {
        // If opening the browser fails, the printed URL still works.
      }
    });

    server.on("error", (err) => {
      reject(err);
    });
  });

  return accessToken;
}

async function getAccessToken() {
  await seedEnv();
  const authMode = String(process.env.GSC_AUTH_MODE || "").trim().toLowerCase();
  const tokenPath = process.env.GOOGLE_SEARCH_CONSOLE_OAUTH_TOKEN_PATH?.trim() || DEFAULT_OAUTH_TOKEN_PATH;

  const oauthClientJson = loadOauthClient();
  const oauthAllowed = authMode === "oauth" || (authMode !== "service-account" && Boolean(oauthClientJson));

  if (oauthAllowed && oauthClientJson) {
    const { clientId, clientSecret } = extractInstalledClient(oauthClientJson);
    const saved = readOauthToken(tokenPath);
    const refreshToken = String(saved?.refresh_token || "").trim();
    if (refreshToken) {
      const refreshed = await getAccessTokenViaRefreshToken({ clientId, clientSecret, refreshToken });
      return refreshed.accessToken;
    }
    return await oauthLoopbackLogin({ clientId, clientSecret, oauthClientJson, tokenPath });
  }

  const serviceAccount = loadServiceAccountJson();
  const clientEmail = String(serviceAccount.client_email || "").trim();
  const privateKey = String(serviceAccount.private_key || "").trim();
  if (!clientEmail || !privateKey) throw new Error("Service account JSON is missing client_email or private_key");

  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: issuedAt + 3600,
    iat: issuedAt,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedClaimSet = base64UrlEncode(JSON.stringify(claimSet));
  const unsignedJwt = `${encodedHeader}.${encodedClaimSet}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsignedJwt);
  signer.end();
  const signature = signer.sign(privateKey);
  const assertion = `${unsignedJwt}.${base64UrlEncode(signature)}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to obtain Google access token: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }

  const token = String(payload.access_token || "").trim();
  if (!token) throw new Error("Google token response missing access_token");
  return token;
}

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const name = key.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    if (value !== "true") i++;
    args.set(name, value);
  }
  return args;
}

function requireIsoDate(value, name) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${name} must be YYYY-MM-DD`);
  }
  return value;
}

function isoTodayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/** `end` is inclusive; returns a date `days` before `end` (UTC calendar days). */
function isoDaysBefore(endIso, days) {
  const d = new Date(`${endIso}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function writeReport(relativePath, payload) {
  const outputPath = path.resolve(process.cwd(), relativePath);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return outputPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.get("help") === "true") {
    console.log(`Usage:
  node scripts/gsc-query.mjs [--site <siteUrl>] [--start YYYY-MM-DD] [--end YYYY-MM-DD] [--dimensions query,page] [--limit <n>]

Auth modes:
  - Service account (default): set GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT_JSON_PATH (or GOOGLE_APPLICATION_CREDENTIALS)
  - OAuth (browser / loopback): set GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_JSON_PATH (or *_JSON) and optionally GSC_AUTH_MODE=oauth

OAuth env vars:
  GOOGLE_SEARCH_CONSOLE_OAUTH_CLIENT_JSON_PATH=<path to OAuth client JSON>
  GOOGLE_SEARCH_CONSOLE_OAUTH_TOKEN_PATH=<optional token cache path> (default: reports/gsc-oauth-token.json)
  GSC_AUTH_MODE=oauth

OAuth client JSON should include redirect_uris for loopback, e.g. http://127.0.0.1:8765/ (recommended).
If Google only provides http://localhost (port 80), that can work but may require elevated permissions on Windows.
Add the redirect URI in Google Cloud Console, then re-download JSON.
`);
    return;
  }

  await seedEnv();

  const siteUrl = String(
    args.get("site") ||
      process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL ||
      process.env.GSC_SITE_URL ||
      process.env.NEXT_PUBLIC_SITE_URL ||
      "",
  ).trim();
  if (!siteUrl) {
    throw new Error("Missing --site or GOOGLE_SEARCH_CONSOLE_SITE_URL or GSC_SITE_URL");
  }

  const endDate = args.get("end") ? requireIsoDate(String(args.get("end")), "--end") : isoTodayUtc();
  const startDate = args.get("start")
    ? requireIsoDate(String(args.get("start")), "--start")
    : isoDaysBefore(endDate, 28);
  if (startDate > endDate) {
    throw new Error("--start must be on or before --end");
  }
  const dimensions = String(args.get("dimensions") || "query,page")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const rowLimit = Math.min(25_000, Math.max(1, Number.parseInt(String(args.get("limit") || "250"), 10) || 250));

  const token = await getAccessToken();
  const response = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions: dimensions.length ? dimensions : undefined,
        rowLimit,
        searchType: "web",
      }),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Search Console API request failed: HTTP ${response.status} ${text || ""}`);
  }

  const data = text ? JSON.parse(text) : null;
  const reportPath = writeReport("reports/search-console.query.json", {
    siteUrl,
    startDate,
    endDate,
    rowLimit,
    dimensions,
    data,
  });

  console.log(`OK. Report written: ${reportPath}`);
}

await main();

