#!/usr/bin/env node
/**
 * Guarded owner-comment production deploy bridge helpers (issue #234).
 *
 * Pure validation for `/deploy-production <40-hex-SHA>` posted on revenue
 * control-plane issue #213. Safe for GitHub Actions: comment text must arrive
 * via env/data (never shell-source interpolation).
 *
 * This module never deploys and never contacts Cloudflare.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Revenue control-plane issue that may authorize production deploys. */
export const DEPLOY_CONTROL_PLANE_ISSUE = 213;

/** Exact command verb; no aliases. */
export const DEPLOY_COMMAND = "/deploy-production";

/** Full 40-character hex commit SHA (case-insensitive). */
export const FULL_SHA_RE = /^[0-9a-fA-F]{40}$/;

/** Entire comment body must match exactly (no leading/trailing whitespace). */
const EXACT_COMMAND_RE = /^\/deploy-production ([0-9a-fA-F]{40})$/;

/**
 * @typedef {{
 *   action?: string,
 *   issueNumber?: number | string,
 *   issueIsPullRequest?: boolean,
 *   actorLogin?: string | null,
 *   commentUserLogin?: string | null,
 *   repositoryOwner?: string | null,
 *   commentBody?: string | null,
 * }} BridgeContext
 */

/**
 * @typedef {{
 *   decision: "ignore" | "reject" | "accept",
 *   reason: string,
 *   sha?: string,
 * }} BridgeDecision
 */

/**
 * Normalize a login for exact owner comparison (GitHub logins are
 * case-insensitive; we compare lowercased forms).
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeLogin(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

/**
 * Parse the exact deploy command from a raw comment body.
 * Rejects partial SHAs, branches/tags, extra args, whitespace padding,
 * multiline payloads, and shell-metacharacter injection attempts.
 *
 * @param {unknown} commentBody
 * @returns {{ ok: true, sha: string } | { ok: false, reason: string }}
 */
export function parseDeployProductionCommand(commentBody) {
  if (commentBody == null) {
    return { ok: false, reason: "comment body is missing" };
  }
  if (typeof commentBody !== "string") {
    return { ok: false, reason: "comment body must be a string" };
  }

  // Fail closed on any CR/LF — multiline payloads are never accepted.
  if (/[\r\n]/.test(commentBody)) {
    return { ok: false, reason: "multiline comment payloads are rejected" };
  }

  // No trimming: leading/trailing whitespace is an invalid payload.
  if (commentBody !== commentBody.trim()) {
    return { ok: false, reason: "leading or trailing whitespace is rejected" };
  }

  if (commentBody.includes("\0")) {
    return { ok: false, reason: "NUL bytes are rejected" };
  }

  const match = EXACT_COMMAND_RE.exec(commentBody);
  if (!match) {
    // Distinguish "not a deploy command" (ignore) from malformed deploy attempts.
    if (!commentBody.startsWith(`${DEPLOY_COMMAND}`)) {
      return { ok: false, reason: "not a deploy-production command", code: "not_command" };
    }
    return {
      ok: false,
      reason:
        "deploy-production command must be exactly `/deploy-production <40-char-hex-SHA>` with no extra arguments",
      code: "malformed",
    };
  }

  const sha = match[1];
  if (!FULL_SHA_RE.test(sha)) {
    return { ok: false, reason: "SHA must be exactly 40 hexadecimal characters", code: "malformed" };
  }

  return { ok: true, sha };
}

/**
 * Authorize a bridge attempt against issue/action/owner constraints.
 * Fail closed unless every gate passes.
 *
 * @param {BridgeContext} ctx
 * @returns {{ ok: true } | { ok: false, reason: string, code?: string }}
 */
export function authorizeDeployBridge(ctx) {
  const action = ctx?.action;
  if (action !== "created") {
    return {
      ok: false,
      reason: `only issue_comment action "created" is allowed (got ${JSON.stringify(action)})`,
      code: "bad_action",
    };
  }

  if (ctx?.issueIsPullRequest) {
    return {
      ok: false,
      reason: "pull request comments cannot authorize production deploys",
      code: "pull_request",
    };
  }

  const issueNumber = Number(ctx?.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber !== DEPLOY_CONTROL_PLANE_ISSUE) {
    return {
      ok: false,
      reason: `only issue #${DEPLOY_CONTROL_PLANE_ISSUE} may authorize deploys (got ${JSON.stringify(ctx?.issueNumber)})`,
      code: "wrong_issue",
    };
  }

  const owner = normalizeLogin(ctx?.repositoryOwner);
  const actor = normalizeLogin(ctx?.actorLogin);
  const commentUser = normalizeLogin(ctx?.commentUserLogin);

  if (!owner) {
    return { ok: false, reason: "repository owner is missing", code: "missing_owner" };
  }
  if (!actor || actor !== owner) {
    return {
      ok: false,
      reason: "actor must be the repository owner",
      code: "non_owner",
    };
  }
  if (!commentUser || commentUser !== owner) {
    return {
      ok: false,
      reason: "comment user must be the repository owner",
      code: "non_owner",
    };
  }

  return { ok: true };
}

/**
 * Evaluate whether a comment event should ignore, reject, or accept a deploy.
 *
 * - ignore: not a deploy command / wrong issue filtered upstream → no deploy, exit 0
 * - reject: deploy-shaped command that fails auth or grammar → fail closed, exit 1
 * - accept: authorized exact command → return SHA for containment check + workflow_call
 *
 * @param {BridgeContext} ctx
 * @returns {BridgeDecision}
 */
export function evaluateDeployBridge(ctx) {
  const auth = authorizeDeployBridge(ctx);
  const parsed = parseDeployProductionCommand(ctx?.commentBody ?? "");

  // Wrong issue / edited / PR / non-created: never deploy.
  if (!auth.ok) {
    // If this is not even a deploy command, stay quiet (ignore) for noise control
    // when a workflow runs without a tight job-level `if`. Malformed deploy
    // commands on the wrong issue still reject when they look like attempts.
    if (!parsed.ok && parsed.code === "not_command") {
      return { decision: "ignore", reason: auth.reason };
    }
    // Non-owner / wrong issue / bad action with a deploy-shaped body → reject.
    if (parsed.ok || parsed.code === "malformed") {
      return { decision: "reject", reason: auth.reason };
    }
    return { decision: "ignore", reason: auth.reason };
  }

  if (!parsed.ok) {
    if (parsed.code === "not_command") {
      return { decision: "ignore", reason: parsed.reason };
    }
    return { decision: "reject", reason: parsed.reason };
  }

  return { decision: "accept", reason: "authorized deploy-production command", sha: parsed.sha };
}

/**
 * Verify `sha` names a commit object contained in `ref` (default origin/main).
 * Uses explicit argv arrays — never string-interpolated shell.
 *
 * @param {{
 *   sha: string,
 *   ref?: string,
 *   cwd?: string,
 *   run?: (argv: string[], opts?: { cwd?: string }) => { status: number | null, stdout: string, stderr: string },
 * }} options
 * @returns {{ ok: true, sha: string, ref: string } | { ok: false, reason: string }}
 */
export function verifyShaContainedInRef(options) {
  const sha = options?.sha;
  const ref = options?.ref || "origin/main";
  const cwd = options?.cwd;
  const run =
    options?.run ||
    ((argv, opts) => {
      const result = spawnSync(argv[0], argv.slice(1), {
        cwd: opts?.cwd,
        encoding: "utf8",
        env: process.env,
      });
      return {
        status: result.status,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      };
    });

  if (typeof sha !== "string" || !FULL_SHA_RE.test(sha)) {
    return { ok: false, reason: "SHA must be exactly 40 hexadecimal characters before git checks" };
  }
  if (typeof ref !== "string" || !ref || /[\r\n\0\s;|&$`<>]/.test(ref)) {
    return { ok: false, reason: "ref is unsafe or missing" };
  }

  const typeResult = run(["git", "cat-file", "-t", sha], { cwd });
  if (typeResult.status !== 0) {
    return { ok: false, reason: `SHA is not a known git object: ${sha}` };
  }
  if (typeResult.stdout.trim() !== "commit") {
    return {
      ok: false,
      reason: `SHA must resolve to a commit (got ${JSON.stringify(typeResult.stdout.trim())})`,
    };
  }

  const ancestor = run(["git", "merge-base", "--is-ancestor", sha, ref], { cwd });
  if (ancestor.status !== 0) {
    return { ok: false, reason: `SHA ${sha} is not contained in ${ref}` };
  }

  return { ok: true, sha, ref };
}

/**
 * Append `name=value` to GITHUB_OUTPUT safely (multiline-safe via delimiter).
 * @param {string} name
 * @param {string} value
 * @param {string} outputPath
 */
export function appendGithubOutput(name, value, outputPath) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid GitHub output name: ${name}`);
  }
  if (value.includes("\0")) {
    throw new Error("output value must not contain NUL");
  }
  // Prefer delimiter form so values never break the output file protocol.
  const delim = `ghadelim_${name}_${Date.now()}_${process.pid}`;
  fs.appendFileSync(outputPath, `${name}<<${delim}\n${value}\n${delim}\n`, "utf8");
}

/**
 * CLI entry for Actions: reads COMMENT_BODY / bridge context from env,
 * writes sha to GITHUB_OUTPUT on accept, exits 0 on ignore, 1 on reject.
 */
export function main(env = process.env) {
  const decision = evaluateDeployBridge({
    action: env.BRIDGE_COMMENT_ACTION || "",
    issueNumber: env.BRIDGE_ISSUE_NUMBER || "",
    issueIsPullRequest: env.BRIDGE_ISSUE_IS_PULL_REQUEST === "true",
    actorLogin: env.BRIDGE_ACTOR_LOGIN || "",
    commentUserLogin: env.BRIDGE_COMMENT_USER_LOGIN || "",
    repositoryOwner: env.BRIDGE_REPOSITORY_OWNER || "",
    commentBody: env.COMMENT_BODY ?? "",
  });

  if (decision.decision === "ignore") {
    console.log(`deploy-production-bridge: ignore — ${decision.reason}`);
    return 0;
  }

  if (decision.decision === "reject") {
    console.error(`deploy-production-bridge: reject — ${decision.reason}`);
    return 1;
  }

  const sha = decision.sha;
  if (!sha || !FULL_SHA_RE.test(sha)) {
    console.error("deploy-production-bridge: reject — accepted decision missing valid SHA");
    return 1;
  }

  // Optional containment check when requested (validation job).
  if (env.BRIDGE_VERIFY_MAIN === "1") {
    const contained = verifyShaContainedInRef({
      sha,
      ref: env.BRIDGE_MAIN_REF || "origin/main",
      cwd: env.BRIDGE_GIT_CWD || undefined,
    });
    if (!contained.ok) {
      console.error(`deploy-production-bridge: reject — ${contained.reason}`);
      return 1;
    }
  }

  const outputPath = env.GITHUB_OUTPUT;
  if (outputPath) {
    appendGithubOutput("sha", sha, outputPath);
    appendGithubOutput("should_deploy", "true", outputPath);
  }

  console.log(`deploy-production-bridge: accept — sha=${sha}`);
  return 0;
}

const invokedAsCli =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedAsCli) {
  process.exitCode = main();
}
