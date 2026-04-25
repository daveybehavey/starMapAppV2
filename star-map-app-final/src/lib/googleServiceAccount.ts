import { readFileSync } from "node:fs";

export type GoogleServiceAccountJson = {
  client_email?: string;
  private_key?: string;
};

export function loadGoogleServiceAccountJson({
  inlineEnvVar,
  pathEnvVar,
  fallbackPathEnvVar,
  missingMessage,
}: {
  inlineEnvVar: string;
  pathEnvVar: string;
  fallbackPathEnvVar?: string;
  missingMessage: string;
}): GoogleServiceAccountJson {
  const inlineJson = process.env[inlineEnvVar]?.trim();
  if (inlineJson) {
    return JSON.parse(inlineJson) as GoogleServiceAccountJson;
  }

  const configuredPath =
    process.env[pathEnvVar]?.trim() || (fallbackPathEnvVar ? process.env[fallbackPathEnvVar]?.trim() : "");
  if (!configuredPath) {
    throw new Error(missingMessage);
  }

  return JSON.parse(readFileSync(configuredPath, "utf8")) as GoogleServiceAccountJson;
}

