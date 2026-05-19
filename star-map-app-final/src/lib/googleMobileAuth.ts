import { createHash } from "node:crypto";

type GoogleTokenInfo = {
  aud?: string;
  email?: string;
  email_verified?: string;
  exp?: string;
  sub?: string;
};

function parseAllowedClientIds(): string[] {
  const raw = process.env.GOOGLE_SIGNIN_ALLOWED_CLIENT_IDS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isAudienceAllowed(aud: string): boolean {
  const web = process.env.GOOGLE_SIGNIN_WEB_CLIENT_ID?.trim();
  const allowed = parseAllowedClientIds();
  if (allowed.length > 0) {
    return allowed.includes(aud);
  }
  if (web) {
    return aud === web;
  }
  return false;
}

export type GoogleMobileVerifyFailure = {
  error:
    | "google_signin_not_configured"
    | "invalid_google_token"
    | "invalid_google_audience"
    | "google_email_not_verified"
    | "google_token_expired"
    | "invalid_google_email";
};

export async function verifyGoogleIdTokenForMobile(
  idToken: string,
): Promise<{ ok: true; email: string } | { ok: false; failure: GoogleMobileVerifyFailure }> {
  const trimmed = idToken.trim();
  if (!trimmed) {
    return { ok: false, failure: { error: "invalid_google_token" } };
  }

  if (!process.env.GOOGLE_SIGNIN_WEB_CLIENT_ID?.trim() && parseAllowedClientIds().length === 0) {
    return { ok: false, failure: { error: "google_signin_not_configured" } };
  }

  const url = new URL("https://oauth2.googleapis.com/tokeninfo");
  url.searchParams.set("id_token", trimmed);

  let info: GoogleTokenInfo;
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      return { ok: false, failure: { error: "invalid_google_token" } };
    }
    info = (await response.json()) as GoogleTokenInfo;
  } catch {
    return { ok: false, failure: { error: "invalid_google_token" } };
  }

  const aud = typeof info.aud === "string" ? info.aud.trim() : "";
  if (!aud || !isAudienceAllowed(aud)) {
    return { ok: false, failure: { error: "invalid_google_audience" } };
  }

  if (info.email_verified !== "true") {
    return { ok: false, failure: { error: "google_email_not_verified" } };
  }

  const exp = Number(info.exp);
  if (Number.isFinite(exp) && exp * 1000 < Date.now()) {
    return { ok: false, failure: { error: "google_token_expired" } };
  }

  const email = typeof info.email === "string" ? info.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, failure: { error: "invalid_google_email" } };
  }

  return { ok: true, email };
}

export function hashEmailForAccountLite(normalizedEmail: string) {
  return createHash("sha256").update(normalizedEmail).digest("base64url").slice(0, 40);
}
