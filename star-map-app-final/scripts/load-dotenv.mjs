import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";

/**
 * Load `.env` then `.env.local`, with local values overriding (matches typical Next.js behavior).
 * Also loads sibling `../company-os/.env.local` when present (shared ops secrets; app `.env.local` wins).
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

/**
 * Default dotenv file search order for narrow peeks (app `.env.local` wins).
 * @param {string} [cwd]
 * @returns {string[]}
 */
export function defaultDotenvPeekPaths(cwd = process.cwd()) {
  return [
    path.join(cwd, ".env"),
    path.join(cwd, "..", "company-os", ".env.local"),
    path.join("C:", "Users", "david", "dev", "starMapAppV2", "company-os", ".env.local"),
    path.join(cwd, ".env.local"),
  ];
}

/**
 * Read a single key from dotenv files without assigning other keys (including
 * PRINT_ADMIN_TOKEN) into `process.env`. Line-oriented capture only materializes
 * the requested key's value.
 *
 * @param {string} key
 * @param {{ cwd?: string, paths?: string[], onFileRead?: (filePath: string) => void }} [options]
 * @returns {string | undefined}
 */
export function peekDotenvValue(key, options = {}) {
  if (typeof key !== "string" || !key.trim()) return undefined;
  const paths = Array.isArray(options.paths) ? options.paths : defaultDotenvPeekPaths(options.cwd);
  const onFileRead = typeof options.onFileRead === "function" ? options.onFileRead : null;
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyPattern = new RegExp(`^\\s*${escapedKey}\\s*=\\s*(.*)$`);
  /** @type {string | undefined} */
  let found;
  for (const filePath of paths) {
    if (!fs.existsSync(filePath)) continue;
    if (onFileRead) onFileRead(filePath);
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      if (!line || /^\s*#/.test(line)) continue;
      const match = keyPattern.exec(line);
      if (!match) continue;
      let value = match[1] ?? "";
      // Strip inline comments for unquoted values (dotenv-compatible enough for SITE_URL).
      if (!/^\s*"/.test(value) && !/^\s*'/.test(value)) {
        value = value.replace(/\s+#.*$/, "");
      }
      value = value.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      found = value;
    }
  }
  return found;
}
