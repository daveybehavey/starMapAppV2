import { loadDotenv } from "./load-dotenv.mjs";
import { applyEnvAliases } from "./lib/env-aliases.mjs";
import {
  ensureAccessToken,
  getPinterestAppCredentials,
  getPinterestRedirectUri,
  getTokenStorePath,
  listBoards,
  pinterestFetch,
  readTokenStore,
} from "./lib/pinterest-client.mjs";

loadDotenv();
applyEnvAliases();

async function main() {
  const { clientId, clientSecret } = getPinterestAppCredentials();
  const redirectUri = getPinterestRedirectUri();
  const store = readTokenStore();
  const printfulToken =
    process.env.PRINTFUL_API_TOKEN?.trim() || process.env.PRINTFUL_ACCESS_TOKEN?.trim() || "";

  console.log("Pinterest + Printful credential check\n");

  console.log("Pinterest app credentials:");
  console.log(`  PINTEREST_APP_ID: ${clientId ? "set" : "MISSING"}`);
  console.log(`  PINTEREST_APP_SECRET: ${clientSecret ? "set" : "MISSING"}`);
  console.log(`  PINTEREST_REDIRECT_URI: ${redirectUri}`);
  console.log(`  Token store: ${getTokenStorePath()} ${store ? "(present)" : "(missing)"}`);
  console.log(`  PINTEREST_ACCESS_TOKEN env: ${process.env.PINTEREST_ACCESS_TOKEN?.trim() ? "set" : "not set"}`);

  console.log("\nPrintful:");
  console.log(`  PRINTFUL_API_TOKEN: ${printfulToken ? "set" : "MISSING"}`);
  if (printfulToken && !process.env.PRINTFUL_API_TOKEN?.trim() && process.env.PRINTFUL_ACCESS_TOKEN?.trim()) {
    console.log("  (using PRINTFUL_ACCESS_TOKEN alias → PRINTFUL_API_TOKEN for scripts)");
  }

  const missing = [];
  if (!clientId) missing.push("PINTEREST_APP_ID");
  if (!clientSecret) missing.push("PINTEREST_APP_SECRET");

  if (missing.length) {
    console.error("\nFix missing Pinterest app credentials, then run: npm run pinterest:oauth");
    process.exit(1);
  }

  if (!store?.access_token && !process.env.PINTEREST_ACCESS_TOKEN?.trim()) {
    console.error("\nNo Pinterest access token yet. Run: npm run pinterest:oauth");
    process.exit(1);
  }

  const accessToken = await ensureAccessToken();
  const account = await pinterestFetch("/user_account", { accessToken });
  const boards = await listBoards();

  console.log("\nPinterest API:");
  console.log(`  Account: ${account.username || account.id || "(ok)"}`);
  console.log(`  Boards visible: ${boards.length}`);
  if (boards.length) {
    for (const board of boards.slice(0, 8)) {
      console.log(`    - ${board.name} (${board.id})`);
    }
    if (boards.length > 8) console.log(`    … and ${boards.length - 8} more`);
  }

  console.log("\nDoctor passed.");
}

main().catch((error) => {
  console.error("\nDoctor failed.");
  console.error(error instanceof Error ? error.message : String(error));
  if (String(error.message || "").includes("401")) {
    console.error("Try: npm run pinterest:oauth");
  }
  process.exit(1);
});
