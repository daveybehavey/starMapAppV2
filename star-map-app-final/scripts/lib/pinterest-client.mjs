import fs from "node:fs";
import path from "node:path";

export const PINTEREST_API_BASE = "https://api.pinterest.com/v5";
export const PINTEREST_OAUTH_AUTHORIZE = "https://www.pinterest.com/oauth/";
export const PINTEREST_OAUTH_TOKEN = "https://api.pinterest.com/v5/oauth/token";

export const PINTEREST_DEFAULT_SCOPES = [
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
  "user_accounts:read",
];

export function getTokenStorePath(cwd = process.cwd()) {
  return path.join(cwd, ".pinterest-tokens.json");
}

export function readTokenStore(cwd = process.cwd()) {
  const filePath = getTokenStorePath(cwd);
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTokenStore(tokens, cwd = process.cwd()) {
  const filePath = getTokenStorePath(cwd);
  const payload = {
    ...tokens,
    updated_at: new Date().toISOString(),
  };
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

export function getPinterestAppCredentials() {
  const clientId = process.env.PINTEREST_APP_ID?.trim() || process.env.PINTEREST_CLIENT_ID?.trim() || "";
  const clientSecret =
    process.env.PINTEREST_APP_SECRET?.trim() || process.env.PINTEREST_CLIENT_SECRET?.trim() || "";
  return { clientId, clientSecret };
}

export function getPinterestRedirectUri() {
  return (process.env.PINTEREST_REDIRECT_URI || "http://localhost:8085/").trim();
}

export function getAccessTokenFromEnv(cwd = process.cwd()) {
  const fromEnv = process.env.PINTEREST_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const store = readTokenStore(cwd);
  return store?.access_token?.trim() || "";
}

export function basicAuthHeader(clientId, clientSecret) {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64");
  return `Basic ${encoded}`;
}

export async function exchangeAuthorizationCode({ code, redirectUri, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  const response = await fetch(PINTEREST_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail =
      json && typeof json === "object" && json.message
        ? String(json.message)
        : text.slice(0, 400);
    throw new Error(`OAuth token exchange failed (${response.status}): ${detail}`);
  }
  return json;
}

export async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const response = await fetch(PINTEREST_OAUTH_TOKEN, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(clientId, clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail =
      json && typeof json === "object" && json.message
        ? String(json.message)
        : text.slice(0, 400);
    throw new Error(`OAuth refresh failed (${response.status}): ${detail}`);
  }
  return json;
}

export async function ensureAccessToken(cwd = process.cwd()) {
  const { clientId, clientSecret } = getPinterestAppCredentials();
  const store = readTokenStore(cwd);
  const envToken = process.env.PINTEREST_ACCESS_TOKEN?.trim();

  if (envToken && !store?.refresh_token) {
    return envToken;
  }

  if (!store?.access_token && envToken) {
    return envToken;
  }

  if (!store?.access_token) {
    throw new Error("No Pinterest access token. Run: npm run pinterest:oauth");
  }

  const expiresAt = store.expires_at ? Date.parse(store.expires_at) : NaN;
  const stillValid = Number.isFinite(expiresAt) && Date.now() < expiresAt - 60_000;
  if (stillValid) {
    return store.access_token;
  }

  if (!store.refresh_token) {
    if (envToken) return envToken;
    throw new Error("Pinterest token expired and no refresh token. Run: npm run pinterest:oauth");
  }

  if (!clientId || !clientSecret) {
    throw new Error("Missing PINTEREST_APP_ID / PINTEREST_APP_SECRET for token refresh.");
  }

  const refreshed = await refreshAccessToken({
    refreshToken: store.refresh_token,
    clientId,
    clientSecret,
  });

  const expiresIn = Number(refreshed.expires_in) || 0;
  const nextStore = {
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || store.refresh_token,
    scope: refreshed.scope || store.scope,
    token_type: refreshed.token_type || store.token_type,
    expires_at: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  };
  writeTokenStore(nextStore, cwd);
  if (refreshed.access_token) {
    process.env.PINTEREST_ACCESS_TOKEN = refreshed.access_token;
  }
  return refreshed.access_token;
}

export async function pinterestFetch(pathname, { method = "GET", body, accessToken, cwd = process.cwd() } = {}) {
  const token = accessToken || (await ensureAccessToken(cwd));
  const response = await fetch(`${PINTEREST_API_BASE}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "starmapco-pinterest-cli",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail =
      json && typeof json === "object" && json.message
        ? String(json.message)
        : text.slice(0, 400);
    throw new Error(`${method} ${pathname} -> ${response.status} ${detail}`);
  }
  return json;
}

export async function listBoards(cwd = process.cwd()) {
  const json = await pinterestFetch("/boards?page_size=50", { cwd });
  return json?.items ?? [];
}

export function findBoardByName(boards, name) {
  const target = name.trim().toLowerCase();
  return boards.find((board) => String(board.name || "").trim().toLowerCase() === target) ?? null;
}

export async function createPin({
  boardId,
  title,
  description,
  link,
  imageUrl,
  altText,
  cwd = process.cwd(),
}) {
  return pinterestFetch("/pins", {
    method: "POST",
    cwd,
    body: {
      board_id: boardId,
      title,
      description,
      link,
      alt_text: altText,
      media_source: {
        source_type: "image_url",
        url: imageUrl,
      },
    },
  });
}
