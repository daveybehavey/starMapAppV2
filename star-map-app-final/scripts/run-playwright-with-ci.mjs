#!/usr/bin/env node

import { spawnSync } from "node:child_process";

process.env.CI = "1";

const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 1);
