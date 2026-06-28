/**
 * Normalize alternate env var names after loadDotenv().
 * Does not log values.
 */
export function applyEnvAliases() {
  if (!process.env.PINTEREST_APP_ID?.trim() && process.env.PINTEREST_CLIENT_ID?.trim()) {
    process.env.PINTEREST_APP_ID = process.env.PINTEREST_CLIENT_ID.trim();
  }
  if (!process.env.PINTEREST_APP_SECRET?.trim() && process.env.PINTEREST_CLIENT_SECRET?.trim()) {
    process.env.PINTEREST_APP_SECRET = process.env.PINTEREST_CLIENT_SECRET.trim();
  }
  if (!process.env.PRINTFUL_API_TOKEN?.trim() && process.env.PRINTFUL_ACCESS_TOKEN?.trim()) {
    process.env.PRINTFUL_API_TOKEN = process.env.PRINTFUL_ACCESS_TOKEN.trim();
  }
}
