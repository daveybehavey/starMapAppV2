import { createSign } from "node:crypto";
import type { GoogleServiceAccountJson } from "@/lib/googleServiceAccount";

let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0;

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function getGoogleAccessToken({
  serviceAccount,
  scope,
}: {
  serviceAccount: GoogleServiceAccountJson;
  scope: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedTokenExpiresAt - 60 > now) {
    return cachedToken;
  }

  const clientEmail = String(serviceAccount.client_email || "").trim();
  const privateKey = String(serviceAccount.private_key || "").trim();
  if (!clientEmail || !privateKey) {
    throw new Error("Service account JSON is missing client_email or private_key");
  }

  const header = { alg: "RS256", typ: "JWT" };
  const issuedAt = Math.floor(Date.now() / 1000);
  const claimSet = {
    iss: clientEmail,
    scope,
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

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!response.ok) {
    throw new Error(`Failed to obtain Google access token: HTTP ${response.status} ${JSON.stringify(payload)}`);
  }

  cachedToken = String(payload.access_token || "").trim() || null;
  cachedTokenExpiresAt = issuedAt + Number(payload.expires_in || 3600);
  if (!cachedToken) {
    throw new Error("Google token response missing access_token");
  }
  return cachedToken;
}

