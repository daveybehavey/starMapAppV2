import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadDotenv } from "./load-dotenv.mjs";
import { applyEnvAliases } from "./lib/env-aliases.mjs";
import {
  PINTEREST_DEFAULT_SCOPES,
  PINTEREST_OAUTH_AUTHORIZE,
  exchangeAuthorizationCode,
  getPinterestAppCredentials,
  getPinterestRedirectUri,
  writeTokenStore,
} from "./lib/pinterest-client.mjs";

loadDotenv();
applyEnvAliases();

const execFileAsync = promisify(execFile);

function buildAuthorizeUrl({ clientId, redirectUri, state, scopes }) {
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", scopes.join(" "));
  params.set("state", state);
  return `${PINTEREST_OAUTH_AUTHORIZE}?${params.toString()}`;
}

function parseRedirectPort(redirectUri) {
  const url = new URL(redirectUri);
  if (url.port) return Number.parseInt(url.port, 10);
  return url.protocol === "https:" ? 443 : 80;
}

async function openBrowser(url) {
  console.log("Open this URL in your browser (copy if auto-open fails):\n");
  console.log(url);
  console.log("");

  if (process.env.PINTEREST_OAUTH_NO_OPEN === "1") {
    return;
  }

  const platform = process.platform;
  try {
    if (platform === "win32") {
      await execFileAsync(
        "powershell",
        ["-NoProfile", "-Command", `Start-Process -Uri '${url.replace(/'/g, "''")}'`],
        { windowsHide: true },
      );
    } else if (platform === "darwin") {
      await execFileAsync("open", [url]);
    } else {
      await execFileAsync("xdg-open", [url]);
    }
  } catch {
    console.log("Could not open browser automatically. Use the URL above.");
  }
}

async function main() {
  const { clientId, clientSecret } = getPinterestAppCredentials();
  if (!clientId || !clientSecret) {
    console.error("Missing PINTEREST_APP_ID and PINTEREST_APP_SECRET in .env.local");
    process.exit(1);
  }

  const redirectUri = getPinterestRedirectUri();
  const port = parseRedirectPort(redirectUri);
  const state = `starmapco-${Date.now()}`;
  const scopes = (process.env.PINTEREST_SCOPES || PINTEREST_DEFAULT_SCOPES.join(" "))
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!scopes.length) {
    console.error("No Pinterest OAuth scopes configured.");
    process.exit(1);
  }

  const authorizeUrl = buildAuthorizeUrl({ clientId, redirectUri, state, scopes });

  console.log("Pinterest OAuth — one-time authorization");
  console.log(`Redirect URI (must match Pinterest app settings): ${redirectUri}`);
  console.log(`Scopes: ${scopes.join(", ")}`);
  console.log("");

  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const requestUrl = new URL(req.url || "/", redirectUri);
      const code = requestUrl.searchParams.get("code");
      const returnedState = requestUrl.searchParams.get("state");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`Pinterest OAuth error: ${error}`);
        server.close();
        reject(new Error(`Pinterest OAuth error: ${error}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Missing authorization code.");
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("State mismatch — possible CSRF. Close this tab and retry.");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<html><body style='font-family:sans-serif;padding:2rem'><h1>StarMapCo Pinterest connected</h1><p>You can close this tab and return to the terminal.</p></body></html>",
      );
      server.close();
      resolve(code);
    });

    server.listen(port, "127.0.0.1", () => {
      console.log(`Listening on ${redirectUri} for callback…`);
      void openBrowser(authorizeUrl);
    });

    server.on("error", (err) => {
      reject(err);
    });

    setTimeout(() => {
      server.close();
      reject(new Error("OAuth timed out after 5 minutes."));
    }, 5 * 60 * 1000);
  });

  const code = await codePromise;
  const tokenResponse = await exchangeAuthorizationCode({
    code,
    redirectUri,
    clientId,
    clientSecret,
  });

  const expiresIn = Number(tokenResponse.expires_in) || 0;
  const storePath = writeTokenStore({
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    scope: tokenResponse.scope,
    token_type: tokenResponse.token_type,
    expires_at: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  });

  console.log("");
  console.log("Pinterest OAuth succeeded.");
  console.log(`Tokens saved to: ${storePath}`);
  console.log(`Scopes granted: ${tokenResponse.scope || "(unknown)"}`);
  console.log("");
  console.log("Next:");
  console.log("  npm run pinterest:doctor");
  console.log("  npm run pinterest:boards");
  console.log("  npm run pinterest:wedding-starter -- --dry-run");
  console.log("  npm run pinterest:wedding-starter");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
