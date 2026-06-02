import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseQuotedValue(raw) {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("\"")) return trimmed;

  let value = "";
  let escaped = false;
  for (let i = 1; i < trimmed.length; i += 1) {
    const char = trimmed[i];
    if (escaped) {
      value += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      return value;
    }
    value += char;
  }

  return value;
}

export async function readWranglerVars(rootDir = process.cwd()) {
  const wranglerPath = path.join(rootDir, "wrangler.toml");
  const content = await fs.readFile(wranglerPath, "utf8");
  const lines = content.split(/\r?\n/);
  const vars = {};
  let inVars = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("[")) {
      inVars = trimmed === "[vars]";
      continue;
    }

    if (!inVars) continue;

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    vars[key] = parseQuotedValue(rawValue);
  }

  return vars;
}

export async function buildEnvWithWranglerVars(rootDir = process.cwd()) {
  const wranglerVars = await readWranglerVars(rootDir);
  // Node's spawn (and some tooling) may look specifically for `env.PATH`.
  // On Windows, environment variables can come through with casing like `Path`,
  // which can break executable resolution when we pass an explicit `env` object.
  const pathValue = process.env.PATH ?? process.env.Path;
  return {
    ...process.env,
    ...wranglerVars,
    PATH: pathValue,
  };
}
