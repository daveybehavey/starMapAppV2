#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const PRINT_CHECKOUT_TEST_FLAG = "--enable-print-checkout";
const playwrightArgs = [];

for (const arg of process.argv.slice(2)) {
  if (arg === PRINT_CHECKOUT_TEST_FLAG) {
    process.env.NEXT_PUBLIC_PRINT_CHECKOUT_ENABLED = "true";
    process.env.PRINT_CHECKOUT_ENABLED = "true";
    continue;
  }
  playwrightArgs.push(arg);
}

process.env.CI = "1";

const result = spawnSync("npx", ["playwright", "test", ...playwrightArgs], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
