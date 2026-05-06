import path from "node:path";
import dotenv from "dotenv";

/**
 * Load `.env` then `.env.local`, with local values overriding (matches typical Next.js behavior).
 * Dotenv defaults to not overwriting existing keys; `override: true` on the second load fixes that.
 */
export function loadDotenv(cwd = process.cwd()) {
  dotenv.config({ path: path.join(cwd, ".env") });
  dotenv.config({ path: path.join(cwd, ".env.local"), override: true });
}
