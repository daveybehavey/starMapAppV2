import { createSign } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { seedEnv, getMerchantAccountId } from "./merchant-shipping-common.mjs";

let cachedToken = null;
let cachedTokenExpiresAt = 0;

/**
 * True when a service-account credential source is configured.
 * Does not read, parse, log, or return secret material.
 */
export function hasMerchantServiceAccountConfigured() {
  if (process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON?.trim()) {
    return true;
  }
  const configuredPath =
    process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!configuredPath) return false;
  try {
    return existsSync(configuredPath);
  } catch {
    return false;
  }
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function loadServiceAccountJson() {
  const inlineJson = process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON?.trim();
  if (inlineJson) {
    return JSON.parse(inlineJson);
  }

  const configuredPath =
    process.env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH?.trim() ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  if (!configuredPath) {
    throw new Error(
      "Missing Google Merchant service account credentials. Set GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH, GOOGLE_APPLICATION_CREDENTIALS, or GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON.",
    );
  }

  return JSON.parse(readFileSync(configuredPath, "utf8"));
}

async function getAccessToken() {
  await seedEnv();
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExpiresAt - 60 > now) {
    return cachedToken;
  }

  const serviceAccount = loadServiceAccountJson();
  const clientEmail = String(serviceAccount.client_email || "").trim();
  const privateKey = String(serviceAccount.private_key || "").trim();

  if (!clientEmail || !privateKey) {
    throw new Error("Service account JSON is missing client_email or private_key");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/content",
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

  cachedToken = payload.access_token;
  cachedTokenExpiresAt = issuedAt + Number(payload.expires_in || 3600);
  return cachedToken;
}

export class MerchantApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "MerchantApiError";
    this.status = status;
    this.body = body;
  }
}

export async function merchantApiRequest(path, { method = "GET", body } = {}) {
  const accessToken = await getAccessToken();
  const response = await fetch(`https://merchantapi.googleapis.com/${path.replace(/^\/+/, "")}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new MerchantApiError(
      `Merchant API request failed: ${method} ${path} -> HTTP ${response.status}`,
      response.status,
      parsed,
    );
  }
  return parsed;
}

export function getShippingSettingsResourceName() {
  return `accounts/${getMerchantAccountId()}/shippingSettings`;
}

export function getShippingSettingsParentName() {
  return `accounts/${getMerchantAccountId()}`;
}

export async function getShippingSettings() {
  return merchantApiRequest(`accounts/v1/${getShippingSettingsResourceName()}`);
}

export async function insertShippingSettings(payload) {
  return merchantApiRequest(`accounts/v1/${getShippingSettingsParentName()}/shippingSettings:insert`, {
    method: "POST",
    body: payload,
  });
}
