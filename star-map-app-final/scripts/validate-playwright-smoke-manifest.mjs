#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REQUIRED_COMMANDS = ["qa:smoke:ui", "qa:smoke:render", "qa:smoke:commerce", "qa:smoke"];
const MANIFEST_FILE = "playwright-smoke-manifest.json";

function fail(message) {
  console.error(`Playwright smoke manifest validation FAILED: ${message}`);
  process.exitCode = 1;
}

function parseRoot(argv) {
  if (argv.length === 0) return process.cwd();
  if (argv.length === 2 && argv[0] === "--root") {
    return path.resolve(process.cwd(), argv[1]);
  }
  throw new Error("Usage: validate-playwright-smoke-manifest.mjs [--root <path>]");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function selectedSpecs(script) {
  return [...script.matchAll(/(?:^|\s)(tests\/[^\s"'\\]+\.spec\.(?:[cm]?[jt]sx?))(?=\s|$)/g)].map(
    (match) => match[1]
  );
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function discoveryCommand(command) {
  return `npm run ${command} -- --list`;
}

function discoveredSpec(output, spec) {
  const displayedPaths = new Set([spec, spec.replace(/^tests\//, "")]);
  const normalizedOutput = output.replaceAll("\\", "/");
  return [...displayedPaths].some((displayedPath) => {
    const escapedPath = displayedPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^\\s+${escapedPath}:\\d+:\\d+\\s+›`, "m").test(normalizedOutput);
  });
}

function discover(root, suite) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["run", "--silent", suite.command, "--", "--list", "--reporter=line"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      CI: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    },
    maxBuffer: 10 * 1024 * 1024,
  });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const totals = [...output.matchAll(/Total:\s+(\d+)\s+tests?\s+in\s+(\d+)\s+files?/g)];
  const lastTotal = totals.at(-1);
  const tests = lastTotal ? Number(lastTotal[1]) : 0;
  const files = lastTotal ? Number(lastTotal[2]) : 0;
  const zeroDiscoverySpecs = suite.specs.filter((spec) => !discoveredSpec(output, spec));

  if (result.error) {
    return {
      error: `could not run ${discoveryCommand(suite.command)}: ${result.error.message}`,
      tests,
      files,
    };
  }
  if (zeroDiscoverySpecs.length > 0) {
    return {
      error: `"${suite.command}" spec "${zeroDiscoverySpecs[0]}" discovered 0 tests. Run: ${discoveryCommand(suite.command)}`,
      tests,
      files,
    };
  }
  if (tests === 0) {
    return {
      error: `"${suite.command}" (${suite.specs.join(", ")}) discovered 0 tests. Run: ${discoveryCommand(suite.command)}`,
      tests,
      files,
    };
  }
  if (result.status !== 0) {
    return {
      error: `"${suite.command}" discovery exited ${result.status}. Run: ${discoveryCommand(suite.command)}`,
      tests,
      files,
    };
  }
  return { error: null, tests, files };
}

function validateManifest(root, manifest, pkg) {
  const errors = [];
  if (!Array.isArray(manifest.criticalSuites)) {
    return {
      errors: [`${MANIFEST_FILE}.criticalSuites must be an array`],
      runnable: [],
    };
  }
  if (!Array.isArray(manifest.exemptions)) {
    errors.push(`${MANIFEST_FILE}.exemptions must be an array`);
  }

  const commandNames = manifest.criticalSuites.map((suite) => suite?.command);
  if (!sameArray(commandNames, REQUIRED_COMMANDS)) {
    errors.push(`${MANIFEST_FILE} critical commands must be exactly: ${REQUIRED_COMMANDS.join(", ")}`);
  }

  const runnable = [];
  const selected = new Set();
  for (const suite of manifest.criticalSuites) {
    if (
      !suite ||
      typeof suite.command !== "string" ||
      !Array.isArray(suite.specs) ||
      suite.specs.length === 0
    ) {
      errors.push(`${MANIFEST_FILE} has an invalid critical suite entry: ${JSON.stringify(suite)}`);
      continue;
    }
    const script = pkg.scripts?.[suite.command];
    if (typeof script !== "string") {
      errors.push(`package.json is missing critical script "${suite.command}"`);
      continue;
    }
    const actualSpecs = selectedSpecs(script);
    if (!sameArray(actualSpecs, suite.specs)) {
      errors.push(
        `"${suite.command}" selects [${actualSpecs.join(", ")}], but ${MANIFEST_FILE} declares [${suite.specs.join(", ")}]. Run: ${discoveryCommand(suite.command)}`
      );
      continue;
    }

    let suiteIsRunnable = true;
    for (const spec of suite.specs) {
      selected.add(spec);
      const absoluteSpec = path.join(root, spec);
      if (!fs.existsSync(absoluteSpec)) {
        errors.push(
          `"${suite.command}" selects missing spec "${spec}". Run: ${discoveryCommand(suite.command)}`
        );
        suiteIsRunnable = false;
        continue;
      }
      if (fs.readFileSync(absoluteSpec, "utf8").trim().length === 0) {
        errors.push(
          `"${suite.command}" selects empty spec "${spec}". Run: ${discoveryCommand(suite.command)}`
        );
        suiteIsRunnable = false;
      }
    }
    if (suiteIsRunnable) runnable.push(suite);
  }

  if (Array.isArray(manifest.exemptions)) {
    for (const exemption of manifest.exemptions) {
      if (
        !exemption ||
        typeof exemption.spec !== "string" ||
        typeof exemption.reason !== "string" ||
        exemption.reason.trim().length === 0
      ) {
        errors.push(`${MANIFEST_FILE} exemption entries require non-empty "spec" and "reason" strings`);
        continue;
      }
      if (!fs.existsSync(path.join(root, exemption.spec))) {
        errors.push(`${MANIFEST_FILE} exemption references missing spec "${exemption.spec}"`);
      }
      if (selected.has(exemption.spec)) {
        errors.push(`${MANIFEST_FILE} spec "${exemption.spec}" cannot be both critical and exempt`);
      }
    }
  }

  return { errors, runnable };
}

function main() {
  let root;
  let manifest;
  let pkg;
  try {
    root = parseRoot(process.argv.slice(2));
    manifest = readJson(path.join(root, MANIFEST_FILE));
    pkg = readJson(path.join(root, "package.json"));
  } catch (error) {
    fail(error.message);
    return;
  }

  const { errors, runnable } = validateManifest(root, manifest, pkg);
  for (const error of errors) fail(error);

  let selectedTests = 0;
  for (const suite of runnable) {
    const result = discover(root, suite);
    if (result.error) {
      fail(result.error);
      continue;
    }
    selectedTests += result.tests;
    console.log(
      `OK ${suite.command}: ${result.tests} ${result.tests === 1 ? "test" : "tests"} in ${result.files} ${result.files === 1 ? "file" : "files"} (${suite.specs.join(", ")})`
    );
  }

  if (process.exitCode) return;
  console.log(
    `Playwright smoke manifest validation PASSED: ${selectedTests} selected tests across ${runnable.length} commands.`
  );
}

main();
