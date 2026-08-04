import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

/**
 * Load `.env` then `.env.local`, with local values overriding (matches typical Next.js behavior).
 * Also loads sibling `../company-os/.env.local` when present (shared ops secrets; app `.env.local` wins).
 *
 * Must only be called after trusted-origin checks succeed for live probes that may
 * later read PRINT_ADMIN_TOKEN.
 */
export function loadDotenv(cwd = process.cwd()) {
  dotenv.config({ path: path.join(cwd, ".env") });

  const companyOsCandidates = [
    path.join(cwd, "..", "company-os", ".env.local"),
    path.join("C:", "Users", "david", "dev", "starMapAppV2", "company-os", ".env.local"),
  ];
  for (const companyOsEnv of companyOsCandidates) {
    if (fs.existsSync(companyOsEnv)) {
      dotenv.config({ path: companyOsEnv });
    }
  }

  dotenv.config({ path: path.join(cwd, ".env.local"), override: true });
}
