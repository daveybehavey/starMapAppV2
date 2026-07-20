#!/usr/bin/env node
/**
 * Governance foundation validator for issue #141.
 *
 * Uses lockfile-controlled Prettier from star-map-app-final/node_modules
 * (never npx prettier@latest). No network access.
 *
 * Cursor environment schema source (frozen for CI; do not fetch at runtime):
 *   https://www.cursor.com/schemas/environment.schema.json
 *   Reconfirmed 2026-07-19 against the published Cloud Agents schema.
 *
 * JSON syntax flags from that schema:
 *   - allowComments: true  → parse via stripJsonComments + JSON.parse
 *     (native JSON.parse alone is NOT sufficient and is not used for
 *     .cursor/environment.json)
 *   - allowTrailingCommas: false → rejected by JSON.parse after comment strip
 *
 * Property closure (must match the official schema exactly):
 *   - Top-level: closed (`unevaluatedProperties: false`)
 *   - `build`: closed (`unevaluatedProperties: false`)
 *   - `ports[]` items: open (known `name`/`port` typed; additional props allowed)
 *   - `terminals[]` items / nested terminal objects: open
 *     (known `name`/`command`/`description` typed; additional props allowed)
 *
 * Official top-level properties:
 *   From definitions.common:
 *     name (string)
 *     user (string)
 *     install (string)
 *     start (string)
 *     repositoryDependencies (string[])
 *     ports ({ name?: string, port: integer 1..65535, ... }[])
 *     terminals (array of terminal objects or nested terminal-object arrays)
 *   From definitions.container:
 *     build ({ dockerfile: string, context?: string } only; closed)
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

/**
 * Convert a 0-based string index to 1-based line/column.
 * @param {string} text
 * @param {number} index
 * @returns {{ line: number, column: number }}
 */
function indexToLineColumn(text, index) {
  let line = 1;
  let column = 1;
  const end = Math.min(Math.max(index, 0), text.length);
  for (let j = 0; j < end; j += 1) {
    if (text[j] === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

/**
 * Strip // and block comments outside of JSON strings.
 * Implements schema allowComments:true without adding a dependency.
 * Does not permit trailing commas (left for JSON.parse to reject).
 * Throws if a block comment is still open at EOF (before JSON.parse).
 * @param {string} text
 * @returns {string}
 */
export function stripJsonComments(text) {
  let out = "";
  let i = 0;
  let inString = false;
  let escaped = false;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      i += 2;
      while (i < text.length && text[i] !== "\n" && text[i] !== "\r") {
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      const commentStart = i;
      i += 2;
      let closed = false;
      while (i < text.length) {
        if (text[i] === "*" && text[i + 1] === "/") {
          i += 2;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) {
        const { line, column } = indexToLineColumn(text, commentStart);
        throw new Error(
          `Unterminated block comment in .cursor/environment.json at line ${line}, column ${column}`,
        );
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * Parse Cursor environment.json per official schema JSON flags:
 * allowComments:true, allowTrailingCommas:false.
 * @param {string} text
 * @returns {unknown}
 */
export function parseCursorEnvironmentJson(text) {
  const withoutComments = stripJsonComments(text);
  return JSON.parse(withoutComments);
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function createReporter(bucket) {
  return (msg) => bucket.push(msg);
}

function assertString(value, label, report) {
  if (typeof value !== "string") {
    report(`${label} must be a string`);
    return false;
  }
  return true;
}

function assertBoolean(value, label, report) {
  if (typeof value !== "boolean") {
    report(`${label} must be a boolean`);
    return false;
  }
  return true;
}

function assertIntegerPort(value, label, report) {
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    report(`${label} must be an integer between 1 and 65535`);
    return false;
  }
  return true;
}

function validateTerminalObject(value, label, report) {
  if (!isPlainObject(value)) {
    report(`${label} must be an object`);
    return;
  }
  // Official schema leaves terminal objects open (no additionalProperties /
  // unevaluatedProperties:false). Validate known fields only; allow extras.
  if (!Object.prototype.hasOwnProperty.call(value, "command")) {
    report(`${label} requires property "command"`);
  } else {
    assertString(value.command, `${label}.command`, report);
  }
  if (value.name !== undefined)
    assertString(value.name, `${label}.name`, report);
  if (value.description !== undefined) {
    assertString(value.description, `${label}.description`, report);
  }
}

function validatePorts(ports, label, report) {
  if (!Array.isArray(ports)) {
    report(`${label} must be an array`);
    return;
  }
  ports.forEach((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (!isPlainObject(item)) {
      report(`${itemLabel} must be an object`);
      return;
    }
    // Official schema leaves ports[] items open. Validate known fields only.
    if (!Object.prototype.hasOwnProperty.call(item, "port")) {
      report(`${itemLabel} requires property "port"`);
    } else {
      assertIntegerPort(item.port, `${itemLabel}.port`, report);
    }
    if (item.name !== undefined)
      assertString(item.name, `${itemLabel}.name`, report);
  });
}

function validateTerminals(terminals, label, report) {
  if (!Array.isArray(terminals)) {
    report(`${label} must be an array`);
    return;
  }
  terminals.forEach((item, index) => {
    const itemLabel = `${label}[${index}]`;
    if (Array.isArray(item)) {
      item.forEach((nested, nestedIndex) => {
        validateTerminalObject(nested, `${itemLabel}[${nestedIndex}]`, report);
      });
      return;
    }
    validateTerminalObject(item, itemLabel, report);
  });
}

function validateBuild(build, label, report) {
  if (!isPlainObject(build)) {
    report(`${label} must be an object`);
    return;
  }
  const keys = Object.keys(build);
  const allowed = new Set(["dockerfile", "context"]);
  for (const key of keys) {
    if (!allowed.has(key)) {
      report(`${label} has unsupported property "${key}"`);
    }
  }
  if (!Object.prototype.hasOwnProperty.call(build, "dockerfile")) {
    report(`${label} requires property "dockerfile"`);
  } else {
    assertString(build.dockerfile, `${label}.dockerfile`, report);
  }
  if (build.context !== undefined) {
    assertString(build.context, `${label}.context`, report);
  }
}

/**
 * Validate Cursor Cloud Agents environment.json against the frozen official schema.
 * Returns an array of schema error strings (does not touch the global errors list).
 * @param {unknown} env
 * @param {string} label
 * @returns {string[]}
 */
export function validateCursorEnvironment(
  env,
  label = ".cursor/environment.json",
) {
  const schemaErrors = [];
  const report = createReporter(schemaErrors);

  if (!isPlainObject(env)) {
    report(`${label} must be a JSON object`);
    return schemaErrors;
  }

  for (const key of Object.keys(env)) {
    if (!ENV_TOP_LEVEL.has(key)) {
      report(
        `${label} has unsupported top-level property "${key}" (official schema unevaluatedProperties:false; allowed: ${[...ENV_TOP_LEVEL].join(", ")})`,
      );
    }
  }

  if (env.name !== undefined) assertString(env.name, `${label}.name`, report);
  if (env.user !== undefined) assertString(env.user, `${label}.user`, report);
  if (env.install !== undefined)
    assertString(env.install, `${label}.install`, report);
  if (env.start !== undefined)
    assertString(env.start, `${label}.start`, report);
  if (env.snapshot !== undefined)
    assertString(env.snapshot, `${label}.snapshot`, report);
  if (env.agentCanUpdateSnapshot !== undefined) {
    assertBoolean(
      env.agentCanUpdateSnapshot,
      `${label}.agentCanUpdateSnapshot`,
      report,
    );
  }

  if (env.repositoryDependencies !== undefined) {
    if (!Array.isArray(env.repositoryDependencies)) {
      report(`${label}.repositoryDependencies must be an array`);
    } else {
      env.repositoryDependencies.forEach((item, index) => {
        assertString(item, `${label}.repositoryDependencies[${index}]`, report);
      });
    }
  }

  if (env.ports !== undefined)
    validatePorts(env.ports, `${label}.ports`, report);
  if (env.terminals !== undefined) {
    validateTerminals(env.terminals, `${label}.terminals`, report);
  }
  if (env.build !== undefined)
    validateBuild(env.build, `${label}.build`, report);

  return schemaErrors;
}

function expectSchema(name, env, { pass }) {
  const found = validateCursorEnvironment(env, `fixture:${name}`);
  if (pass) {
    if (found.length) {
      fail(
        `schema fidelity fixture "${name}" should pass but failed: ${found.join("; ")}`,
      );
    } else {
      console.log(`OK schema fidelity pass: ${name}`);
    }
  } else if (!found.length) {
    fail(`schema fidelity fixture "${name}" should fail but passed`);
  } else {
    console.log(`OK schema fidelity fail: ${name} -> ${found[0]}`);
  }
}

function runSchemaFidelityFixtures() {
  // In-memory fixtures matching Codex schema-fidelity examples (not written to disk).
  expectSchema(
    "ports-extra-open",
    {
      name: "x",
      install: "npm ci",
      ports: [{ port: 3000, extra: "schema-permitted" }],
    },
    { pass: true },
  );
  expectSchema(
    "terminals-extra-open",
    {
      name: "x",
      install: "npm ci",
      terminals: [{ name: "dev", command: "npm run dev", extra: true }],
    },
    { pass: true },
  );
  expectSchema(
    "unsupported-top-level",
    { unsupportedField: true },
    { pass: false },
  );
  expectSchema(
    "unsupported-build-field",
    { build: { unsupportedBuildField: true } },
    { pass: false },
  );
  expectSchema(
    "invalid-known-port-type",
    { name: "x", install: "npm ci", ports: [{ port: "nope", extra: 1 }] },
    { pass: false },
  );
  expectSchema(
    "missing-terminal-command",
    { name: "x", install: "npm ci", terminals: [{ name: "dev", extra: true }] },
    { pass: false },
  );
}

function runParseFidelityFixtures() {
  // Official schema: allowComments:true, allowTrailingCommas:false.
  const withComments = `{
  // line comment
  "name": "starMapAppV2",
  /* block comment */
  "install": "cd star-map-app-final && npm ci"
}
`;
  try {
    const parsed = parseCursorEnvironmentJson(withComments);
    if (parsed?.name !== "starMapAppV2" || !parsed?.install) {
      fail(
        "parse fidelity: commented environment JSON did not yield expected fields",
      );
    } else {
      console.log("OK parse fidelity: comments are accepted");
    }
    // Prove native JSON.parse alone is insufficient for the same input.
    let nativeFailed = false;
    try {
      JSON.parse(withComments);
    } catch {
      nativeFailed = true;
    }
    if (!nativeFailed) {
      fail(
        "parse fidelity: expected native JSON.parse to reject commented JSON (validator must not rely on it alone)",
      );
    } else {
      console.log(
        "OK parse fidelity: native JSON.parse rejects comments (strip+parse required)",
      );
    }
  } catch (e) {
    fail(
      `parse fidelity: commented environment JSON should parse: ${e.message}`,
    );
  }

  const withTrailingComma = `{
  "name": "starMapAppV2",
  "install": "cd star-map-app-final && npm ci",
}
`;
  let trailingRejected = false;
  try {
    parseCursorEnvironmentJson(withTrailingComma);
  } catch {
    trailingRejected = true;
  }
  if (!trailingRejected) {
    fail(
      "parse fidelity: trailing commas must be rejected (allowTrailingCommas:false)",
    );
  } else {
    console.log("OK parse fidelity: trailing commas are rejected");
  }

  // Comments inside strings must be preserved, not stripped.
  const commentInString = `{
  "name": "has // not a comment",
  "install": "npm ci"
}
`;
  try {
    const parsed = parseCursorEnvironmentJson(commentInString);
    if (parsed?.name !== "has // not a comment") {
      fail("parse fidelity: // inside a string was incorrectly stripped");
    } else {
      console.log("OK parse fidelity: // inside strings preserved");
    }
  } catch (e) {
    fail(`parse fidelity: string with // should parse: ${e.message}`);
  }

  const blockInString = `{
  "install": "echo \\"/* not a comment */\\""
}
`;
  try {
    const parsed = parseCursorEnvironmentJson(blockInString);
    if (parsed?.install !== 'echo "/* not a comment */"') {
      fail(
        `parse fidelity: /* */ inside a string was incorrectly stripped (got ${JSON.stringify(parsed?.install)})`,
      );
    } else {
      console.log("OK parse fidelity: /* */ inside strings preserved");
    }
  } catch (e) {
    fail(`parse fidelity: string with /* */ should parse: ${e.message}`);
  }

  const closedBlockSuffix = `{"name":"ok"} /* closed */`;
  try {
    const parsed = parseCursorEnvironmentJson(closedBlockSuffix);
    if (parsed?.name !== "ok") {
      fail("parse fidelity: closed trailing block comment should parse");
    } else {
      console.log("OK parse fidelity: closed trailing block comment");
    }
  } catch (e) {
    fail(
      `parse fidelity: closed trailing block comment should parse: ${e.message}`,
    );
  }

  const closedBlockInterior = `{
  /* closed */
  "name": "ok"
}
`;
  try {
    const parsed = parseCursorEnvironmentJson(closedBlockInterior);
    if (parsed?.name !== "ok") {
      fail("parse fidelity: closed interior block comment should parse");
    } else {
      console.log("OK parse fidelity: closed interior block comment");
    }
  } catch (e) {
    fail(
      `parse fidelity: closed interior block comment should parse: ${e.message}`,
    );
  }

  /** @type {Array<{ name: string, text: string }>} */
  const unterminatedBlockFixtures = [
    {
      name: "unterminated-after-complete-object",
      text: `{"name":"ok"} /* never closed`,
    },
    {
      name: "unterminated-after-pretty-object",
      text: `{
  "name": "ok"
}
/* never closed
`,
    },
    {
      name: "unterminated-before-property",
      text: `{
  /* never closed
  "name": "ok"
}
`,
    },
  ];

  for (const fixture of unterminatedBlockFixtures) {
    let threw = null;
    try {
      // Must throw from stripJsonComments before JSON.parse can succeed on a prefix.
      stripJsonComments(fixture.text);
    } catch (e) {
      threw = e;
    }
    if (!threw) {
      fail(
        `parse fidelity: ${fixture.name} must throw Unterminated block comment before JSON.parse`,
      );
      continue;
    }
    const message = String(threw.message || threw);
    if (!/Unterminated block comment/i.test(message)) {
      fail(
        `parse fidelity: ${fixture.name} must identify unterminated block comment, got: ${message}`,
      );
      continue;
    }
    // Ensure failure is not merely incomplete JSON from a later JSON.parse.
    if (/JSON\.parse|Unexpected end|Expected property/i.test(message)) {
      fail(
        `parse fidelity: ${fixture.name} must fail as unterminated block comment, not JSON.parse: ${message}`,
      );
      continue;
    }
    console.log(
      `OK parse fidelity fail: ${fixture.name} -> ${message.split(" at ")[0]}`,
    );
  }
}

async function checkPrettierFormatting() {
  for (const { file, parser } of GOVERNANCE_FILES) {
    const abs = path.join(repoRoot, file);
    if (!fs.existsSync(abs)) {
      fail(`missing governance file: ${file}`);
      continue;
    }
    const source = fs.readFileSync(abs, "utf8");
    try {
      if (file === ".cursor/environment.json") {
        // Schema allowComments:true — format-check the comment-stripped JSON body.
        // When comments are present, do not require byte identity with Prettier output
        // (comment removal can leave blank lines). When comments are absent, keep
        // strict byte-for-byte Prettier --check behavior.
        const stripped = stripJsonComments(source);
        // Ensure Cursor parse path works before formatting (comments allowed).
        parseCursorEnvironmentJson(source);
        const formatted = await prettier.format(stripped, {
          parser,
          filepath: abs,
        });
        if (stripped === source) {
          if (source !== formatted) {
            fail(
              `${file} is not correctly formatted by Prettier ${prettier.version} (parser=${parser}). Run formatting with the lockfile Prettier from star-map-app-final.`,
            );
          } else {
            console.log(`OK Prettier --check equivalent: ${file}`);
          }
        } else {
          const again = await prettier.format(formatted, {
            parser,
            filepath: abs,
          });
          if (formatted !== again) {
            fail(
              `${file} comment-stripped JSON body is not stably formatted by Prettier ${prettier.version}`,
            );
          } else {
            console.log(
              `OK Prettier check on comment-stripped ${file} body (comments permitted by schema)`,
            );
          }
        }
        continue;
      }

      const formatted = await prettier.format(source, {
        parser,
        filepath: abs,
      });
      if (source !== formatted) {
        fail(
          `${file} is not correctly formatted by Prettier ${prettier.version} (parser=${parser}). Run formatting with the lockfile Prettier from star-map-app-final.`,
        );
      } else {
        console.log(`OK Prettier --check equivalent: ${file}`);
      }
    } catch (e) {
      fail(`${file} failed Prettier ${parser} format: ${e.message}`);
    }
  }
}

function validateEnvironmentFile() {
  const rel = ".cursor/environment.json";
  const abs = path.join(repoRoot, rel);
  let env;
  try {
    env = parseCursorEnvironmentJson(fs.readFileSync(abs, "utf8"));
    console.log(
      "OK Cursor environment JSON parse (comments allowed; trailing commas rejected):",
      rel,
    );
  } catch (e) {
    fail(
      `${rel} is not valid Cursor environment JSON (allowComments:true, allowTrailingCommas:false): ${e.message}`,
    );
    return;
  }

  const schemaErrors = validateCursorEnvironment(env, rel);
  for (const e of schemaErrors) fail(e);

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
  runSchemaFidelityFixtures();
  runParseFidelityFixtures();
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
