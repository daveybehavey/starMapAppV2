#!/usr/bin/env node
/**
 * Governance foundation validator for issue #141.
 *
 * Uses lockfile-controlled Prettier from star-map-app-final/node_modules
 * (never npx prettier@latest). No network access.
 *
 * Cursor environment schema source (frozen for CI; do not fetch at runtime):
 *   https://www.cursor.com/schemas/environment.schema.json
 *   Confirmed 2026-07-19 against the published Cloud Agents schema.
 *
 * Official top-level properties (schema is closed via unevaluatedProperties:false):
 *   From definitions.common:
 *     name (string)
 *     user (string)
 *     install (string)
 *     start (string)
 *     repositoryDependencies (string[])
 *     ports ({ name?: string, port: integer 1..65535 }[])
 *     terminals (array of terminal objects or nested terminal-object arrays)
 *   From definitions.container:
 *     build ({ dockerfile: string, context?: string } with closed properties)
 *     snapshot (string)
 *     agentCanUpdateSnapshot (boolean)
 *   No top-level required properties.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const require = createRequire(
  path.join(repoRoot, "star-map-app-final/package.json"),
);
const prettier = require("prettier");

const errors = [];
const fail = (msg) => errors.push(msg);

const GOVERNANCE_FILES = [
  { file: "AGENTS.md", parser: "markdown" },
  { file: "docs/AGENT_OPERATING_MODEL.md", parser: "markdown" },
  { file: ".github/pull_request_template.md", parser: "markdown" },
  { file: ".cursor/rules/starmapco-agent.mdc", parser: "markdown" },
  { file: ".cursor/environment.json", parser: "json" },
  { file: ".github/ISSUE_TEMPLATE/agent-task.yml", parser: "yaml" },
  { file: ".github/workflows/governance-ci.yml", parser: "yaml" },
];

/** Frozen allowlist from https://www.cursor.com/schemas/environment.schema.json */
const ENV_TOP_LEVEL = new Set([
  "name",
  "user",
  "install",
  "start",
  "repositoryDependencies",
  "ports",
  "terminals",
  "build",
  "snapshot",
  "agentCanUpdateSnapshot",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertString(value, label) {
  if (typeof value !== "string") {
    fail(`${label} must be a string`);
    return false;
  }
  return true;
}

function assertBoolean(value, label) {
  if (typeof value !== "boolean") {
    fail(`${label} must be a boolean`);
    return false;
  }
  return true;
}

function assertIntegerPort(value, label) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    fail(`${label} must be an integer between 1 and 65535`);
    return false;
  }
  return true;
}

function validateTerminalObject(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
    return;
  }
  const keys = Object.keys(value);
  const allowed = new Set(["name", "command", "description"]);
  for (const key of keys) {
    if (!allowed.has(key)) {
      fail(`${label} has unsupported property "${key}"`);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(value, "command")) {
    fail(`${label} requires property "command"`);
  } else {
    assertString(value.command, `${label}.command`);
  }
  if (value.name !== undefined) assertString(value.name, `${label}.name`);
  if (value.description !== undefined) {
    assertString(value.description, `${label}.description`);
  }
}

function validatePorts(ports, label) {
  if (!Array.isArray(ports)) {
    fail(`${label} must be an array`);
    return;
  }
  ports.forEach((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!isPlainObject(item)) {
      fail(`${itemLabel} must be an object`);
      return;
    }
    const keys = Object.keys(item);
    const allowed = new Set(["name", "port"]);
    for (const key of keys) {
      if (!allowed.has(key)) {
        fail(`${itemLabel} has unsupported property "${key}"`);
      }
    }
    if (!Object.prototype.hasOwnProperty.call(item, "port")) {
      fail(`${itemLabel} requires property "port"`);
    } else {
      assertIntegerPort(item.port, `${itemLabel}.port`);
    }
    if (item.name !== undefined) assertString(item.name, `${itemLabel}.name`);
  });
}

function validateTerminals(terminals, label) {
  if (!Array.isArray(terminals)) {
    fail(`${label} must be an array`);
    return;
  }
  terminals.forEach((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (Array.isArray(item)) {
      item.forEach((nested, nestedIndex) => {
        validateTerminalObject(nested, `${itemLabel}[${nestedIndex}]`);
      });
      return;
    }
    validateTerminalObject(item, itemLabel);
  });
}

function validateBuild(build, label) {
  if (!isPlainObject(build)) {
    fail(`${label} must be an object`);
    return;
  }
  const keys = Object.keys(build);
  const allowed = new Set(["dockerfile", "context"]);
  for (const key of keys) {
    if (!allowed.has(key)) {
      fail(`${label} has unsupported property "${key}"`);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(build, "dockerfile")) {
    fail(`${label} requires property "dockerfile"`);
  } else {
    assertString(build.dockerfile, `${label}.dockerfile`);
  }
  if (build.context !== undefined)
    assertString(build.context, `${label}.context`);
}

/**
 * Validate Cursor Cloud Agents environment.json against the frozen official schema.
 * @param {unknown} env
 * @param {string} label
 */
export function validateCursorEnvironment(
  env,
  label = ".cursor/environment.json",
) {
  if (!isPlainObject(env)) {
    fail(`${label} must be a JSON object`);
    return;
  }

  for (const key of Object.keys(env)) {
    if (!ENV_TOP_LEVEL.has(key)) {
      fail(
        `${label} has unsupported top-level property "${key}" (official schema unevaluatedProperties:false; allowed: ${[...ENV_TOP_LEVEL].join(", ")})`,
      );
    }
  }

  if (env.name !== undefined) assertString(env.name, `${label}.name`);
  if (env.user !== undefined) assertString(env.user, `${label}.user`);
  if (env.install !== undefined) assertString(env.install, `${label}.install`);
  if (env.start !== undefined) assertString(env.start, `${label}.start`);
  if (env.snapshot !== undefined)
    assertString(env.snapshot, `${label}.snapshot`);
  if (env.agentCanUpdateSnapshot !== undefined) {
    assertBoolean(
      env.agentCanUpdateSnapshot,
      `${label}.agentCanUpdateSnapshot`,
    );
  }

  if (env.repositoryDependencies !== undefined) {
    if (!Array.isArray(env.repositoryDependencies)) {
      fail(`${label}.repositoryDependencies must be an array`);
    } else {
      env.repositoryDependencies.forEach((item, index) => {
        assertString(item, `${label}.repositoryDependencies[${index}]`);
      });
    }
  }

  if (env.ports !== undefined) validatePorts(env.ports, `${label}.ports`);
  if (env.terminals !== undefined)
    validateTerminals(env.terminals, `${label}.terminals`);
  if (env.build !== undefined) validateBuild(env.build, `${label}.build`);
}

async function checkPrettierFormatting() {
  for (const { file, parser } of GOVERNANCE_FILES) {
    const abs = path.join(repoRoot, file);
    if (!fs.existsSync(abs)) {
      fail(`missing governance file: ${file}`);
      continue;
    }
    const source = fs.readFileSync(abs, "utf8");
    let formatted;
    try {
      formatted = await prettier.format(source, { parser, filepath: abs });
    } catch (e) {
      fail(`${file} failed Prettier ${parser} format: ${e.message}`);
      continue;
    }
    if (source !== formatted) {
      fail(
        `${file} is not correctly formatted by Prettier ${prettier.version} (parser=${parser}). Run formatting with the lockfile Prettier from star-map-app-final.`,
      );
    } else {
      console.log(`OK Prettier --check equivalent: ${file}`);
    }
  }
}

function validateEnvironmentFile() {
  const rel = ".cursor/environment.json";
  const abs = path.join(repoRoot, rel);
  let env;
  try {
    env = JSON.parse(fs.readFileSync(abs, "utf8"));
    console.log("OK JSON parse:", rel);
  } catch (e) {
    fail(`${rel} is not valid JSON: ${e.message}`);
    return;
  }

  validateCursorEnvironment(env, rel);

  // Repo policy: minimal install-only config (no auto-start / deploy / secrets)
  if (env.start !== undefined || env.terminals !== undefined) {
    fail(`${rel} must not auto-start services (start/terminals)`);
  }
  if (typeof env.install === "string") {
    if (
      /deploy|wrangler|secret|STRIPE|PRINTFUL|CLOUDFLARE_API_TOKEN/i.test(
        env.install,
      )
    ) {
      fail(`${rel} install command looks unsafe: ${env.install}`);
    }
  }
}

function validateDocumentedScripts() {
  const pkg = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "star-map-app-final/package.json"),
      "utf8",
    ),
  );
  const documentedScripts = [
    "lint",
    "typecheck",
    "test:unit",
    "build",
    "qa:smoke:commerce",
    "qa:smoke:render",
    "qa:smoke",
    "dev",
    "check:env",
    "test:ui",
    "ci:pr",
  ];
  for (const name of documentedScripts) {
    if (!pkg.scripts?.[name]) {
      fail(`documented npm script missing from package.json: ${name}`);
    } else {
      console.log("OK script exists:", name);
    }
  }
}

function validatePolicyAssertions() {
  const policySources = [
    "AGENTS.md",
    ".cursor/rules/starmapco-agent.mdc",
    "docs/AGENT_OPERATING_MODEL.md",
    ".github/ISSUE_TEMPLATE/agent-task.yml",
    ".github/pull_request_template.md",
  ];
  const policyText = policySources
    .map((f) => fs.readFileSync(path.join(repoRoot, f), "utf8"))
    .join("\n");

  const assertions = [
    {
      name: "no automatic merge",
      test: /no auto-?merge|never automatically[\s\S]{0,80}merge|No automatic merge/i,
    },
    {
      name: "no automatic deployment",
      test: /no automatic deployment|never automatically[\s\S]{0,120}deploy|No automatic deployment/i,
    },
    {
      name: "no production secrets",
      test: /production secrets|never[\s\S]{0,80}production secrets|No production secrets/i,
    },
    {
      name: "high-risk approval before implementation, merge and deployment",
      test: /before implementation[\s\S]{0,120}before merge[\s\S]{0,120}before production deployment/i,
    },
  ];

  for (const a of assertions) {
    if (!a.test.test(policyText)) {
      fail(`missing required policy assertion: ${a.name}`);
    } else {
      console.log("OK policy assertion:", a.name);
    }
  }

  for (const f of [
    "AGENTS.md",
    "docs/AGENT_OPERATING_MODEL.md",
    ".cursor/rules/starmapco-agent.mdc",
  ]) {
    const t = fs.readFileSync(path.join(repoRoot, f), "utf8");
    if (!/Instruction precedence/i.test(t)) {
      fail(`${f} missing Instruction precedence section`);
    }
  }
}

function validateWorkflowSafety() {
  const rel = ".github/workflows/governance-ci.yml";
  const wf = fs.readFileSync(path.join(repoRoot, rel), "utf8");
  if (!/permissions:\s*\n\s*contents:\s*read\b/.test(wf)) {
    fail(`${rel} must declare permissions: contents: read`);
  }
  // Inspect job YAML outside the validate script invocation for secret/deploy usage.
  const yamlOnly = wf.split(/Validate governance foundation/)[0] ?? wf;
  if (/^\s*secrets\s*:/m.test(yamlOnly)) {
    fail(`${rel} must not declare secrets`);
  }
  if (/\$\{\{\s*secrets\./.test(yamlOnly)) {
    fail(`${rel} must not reference secrets context`);
  }
  if (
    /\bnpm run deploy\b/i.test(yamlOnly) ||
    /\bdeploy-production\b/i.test(yamlOnly) ||
    /\bwrangler\s+deploy\b/i.test(yamlOnly)
  ) {
    fail(`${rel} must not contain deployment commands`);
  }
  console.log(
    "OK workflow self-check: no deploy/secret references in YAML steps",
  );
}

async function main() {
  process.chdir(repoRoot);
  console.log(
    `Using Prettier ${prettier.version} from star-map-app-final/node_modules`,
  );

  await checkPrettierFormatting();
  validateEnvironmentFile();
  validateDocumentedScripts();
  validatePolicyAssertions();
  validateWorkflowSafety();

  if (errors.length) {
    console.error("\nGovernance validation FAILED:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log("\nGovernance validation PASSED");
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
