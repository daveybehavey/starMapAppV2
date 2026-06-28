import { loadDotenv } from "./load-dotenv.mjs";
import { applyEnvAliases } from "./lib/env-aliases.mjs";
import { listBoards } from "./lib/pinterest-client.mjs";

loadDotenv();
applyEnvAliases();

async function main() {
  const boards = await listBoards();
  if (!boards.length) {
    console.log("No boards returned (empty account or missing scopes).");
    return;
  }
  for (const board of boards) {
    console.log(`${board.id}\t${board.name}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
