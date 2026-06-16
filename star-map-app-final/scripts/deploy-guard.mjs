#!/usr/bin/env node

/**
 * Deploy guardrails: lock file, competing Node builds, Windows/OneDrive warnings.
 * Use `npm run deploy:verify` (guarded) or `npm run deploy:inner` from CI/Linux only.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const LOCK_FILE = ".deploy.lock";
const LOCK_STALE_MS = 2 * 60 * 60 * 1000;
const CANONICAL_ROOT_HINT = String.raw`C:\Users\david\dev\starMapAppV2`;

const HEAVY_NODE_PATTERN =
  /next(\.cmd)?\s+build|opennext|webpack-compiler|turbopack|next dev|vite build|rollup/i;

function printUsage() {
  console.log(`Usage:
  node scripts/deploy-guard.mjs preflight [--allow-competing]
  node scripts/deploy-guard.mjs run <deploy|verify>
  node scripts/deploy-guard.mjs wsl [verify]

Guards:
  - Refuses Windows deploy unless DEPLOY_ALLOW_WINDOWS=1 (use WSL or GitHub Actions).
  - Warns on OneDrive / non-canonical repo paths.
  - Blocks when another heavy Node build is running (common with Codex + VS Code in parallel).
  - Single deploy lock (.deploy.lock) to prevent overlapping deploys.

Escape hatches:
  DEPLOY_ALLOW_WINDOWS=1     Allow guarded deploy on Windows (not recommended)
  DEPLOY_SKIP_COMPETING=1    Skip competing-process check
  DEPLOY_SKIP_LOCK=1         Skip lock file (CI sets this in workflow)
`);
}

function readLock(lockPath) {
  try {
    const raw = fs.readFileSync(lockPath, "utf8");
    const parsed = JSON.parse(raw);
    if (typeof parsed.pid === "number" && typeof parsed.startedAt === "string") return parsed;
  } catch {
    // ignore
  }
  return null;
}

function isProcessAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function acquireDeployLock(rootDir) {
  if (process.env.DEPLOY_SKIP_LOCK === "1") return () => {};

  const lockPath = path.join(rootDir, LOCK_FILE);
  const existing = readLock(lockPath);
  if (existing) {
    const ageMs = Date.now() - Date.parse(existing.startedAt);
    const alive = isProcessAlive(existing.pid);
    if (alive && ageMs < LOCK_STALE_MS) {
      throw new Error(
        `Another deploy appears in progress (pid ${existing.pid}, started ${existing.startedAt}). ` +
          `Wait for it to finish or delete ${LOCK_FILE} if it crashed.`,
      );
    }
    if (!alive || ageMs >= LOCK_STALE_MS) {
      console.warn(`Removing stale deploy lock (pid ${existing.pid}, age ${Math.round(ageMs / 60000)}m).`);
      fs.unlinkSync(lockPath);
    }
  }

  const payload = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    cwd: rootDir,
    command: process.argv.slice(2).join(" "),
  };
  fs.writeFileSync(lockPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return () => {
    try {
      const current = readLock(lockPath);
      if (current?.pid === process.pid) fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  };
}

function listNodeCommandLines() {
  if (process.platform === "win32") {
    const result = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        "Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | ForEach-Object { $_.CommandLine }",
      ],
      { encoding: "utf8" },
    );
    return (result.stdout ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const result = spawnSync("ps", ["-ax", "-o", "pid=,command="], { encoding: "utf8" });
  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function findCompetingHeavyBuilds() {
  const selfPid = String(process.pid);
  return listNodeCommandLines().filter((line) => {
    if (!HEAVY_NODE_PATTERN.test(line)) return false;
    if (/deploy-guard\.mjs/i.test(line)) return false;
    if (line.includes(selfPid)) return false;
    return true;
  });
}

function runPreflight(rootDir, options = {}) {
  const issues = [];
  const warnings = [];

  const cwd = path.resolve(rootDir);
  const cwdLower = cwd.toLowerCase();

  if (process.platform === "win32" && process.env.DEPLOY_ALLOW_WINDOWS !== "1") {
    issues.push(
      "Windows local deploy is disabled by default (OpenNext is slow/flaky here; saw ECONNRESET during compile). " +
        "Use: npm run deploy:wsl · npm run deploy:remote · or set DEPLOY_ALLOW_WINDOWS=1 to override.",
    );
  }

  if (/onedrive/i.test(cwdLower)) {
    issues.push(`Repo path looks like OneDrive (${cwd}). Use ${CANONICAL_ROOT_HINT} instead.`);
  }

  if (process.platform === "win32" && !cwdLower.includes(String.raw`c:\users\david\dev\starmapappv2`)) {
    warnings.push(
      `Not deploying from canonical path (${CANONICAL_ROOT_HINT}). Current: ${cwd}. ` +
        "OneDrive / Code mirrors can cause slow or stuck builds.",
    );
  }

  if (process.env.DEPLOY_SKIP_COMPETING !== "1") {
    const competing = findCompetingHeavyBuilds();
    if (competing.length > 0) {
      const sample = competing.slice(0, 3).join("\n  ");
      const msg =
        `Detected ${competing.length} other heavy Node build(s) on this machine ` +
        `(often Codex/VS Code in another repo). Pause them before deploy.\n  ${sample}`;
      if (options.allowCompeting) warnings.push(msg);
      else issues.push(`${msg}\nSet DEPLOY_SKIP_COMPETING=1 to override (not recommended).`);
    }
  }

  for (const warning of warnings) console.warn(`deploy-guard warning: ${warning}`);
  if (issues.length > 0) {
    console.error("deploy-guard blocked deploy:\n");
    for (const issue of issues) console.error(`- ${issue}`);
    console.error("\nRecommended: close/pause other builds, then npm run deploy:wsl or npm run deploy:remote");
    process.exit(1);
  }

  console.log("deploy-guard: preflight OK");
}

function runNpmScript(scriptName, rootDir) {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCmd, ["run", scriptName], {
    stdio: "inherit",
    cwd: rootDir,
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function windowsPathToWsl(windowsPath) {
  const match = /^([a-zA-Z]):[\\/](.*)$/.exec(windowsPath);
  if (!match) return windowsPath.replace(/\\/g, "/");
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

function runWslDeploy(rootDir, mode) {
  const wslRoot = windowsPathToWsl(rootDir);
  const inner = mode === "verify" ? "deploy:verify:inner" : "deploy:inner";
  const command = `cd '${wslRoot.replace(/'/g, `'\\''`)}' && npm run ${inner}`;
  console.log(`deploy-guard: running in WSL → npm run ${inner}`);
  const result = spawnSync("wsl", ["-e", "bash", "-lc", command], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const rootDir = process.cwd();
  const [command, ...rest] = args;

  if (command === "preflight") {
    runPreflight(rootDir, { allowCompeting: rest.includes("--allow-competing") });
    return;
  }

  if (command === "wsl") {
    const mode = rest[0] === "deploy" ? "deploy" : "verify";
    runWslDeploy(rootDir, mode);
    return;
  }

  if (command === "run") {
    const mode = rest[0];
    if (mode !== "deploy" && mode !== "verify") {
      printUsage();
      process.exit(1);
    }
    const releaseLock = acquireDeployLock(rootDir);
    try {
      runPreflight(rootDir);
      runNpmScript(mode === "verify" ? "deploy:verify:inner" : "deploy:inner", rootDir);
    } finally {
      releaseLock();
    }
    return;
  }

  printUsage();
  process.exit(1);
}

main();
