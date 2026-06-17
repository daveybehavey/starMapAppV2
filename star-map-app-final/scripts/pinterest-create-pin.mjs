import { loadDotenv } from "./load-dotenv.mjs";
import { applyEnvAliases } from "./lib/env-aliases.mjs";
import { createPin, findBoardByName, listBoards } from "./lib/pinterest-client.mjs";

loadDotenv();
applyEnvAliases();

function readArg(name) {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) return "";
  return process.argv[idx + 1].trim();
}

function hasFlag(name) {
  return process.argv.includes(name);
}

async function resolveBoardId() {
  const boardId = readArg("--board-id") || process.env.PINTEREST_BOARD_ID?.trim() || "";
  if (boardId) return boardId;

  const boardName =
    readArg("--board") || process.env.PINTEREST_BOARD_NAME?.trim() || "Wedding Gift Ideas";
  const boards = await listBoards();
  const match = findBoardByName(boards, boardName);
  if (!match?.id) {
    const names = boards.map((b) => b.name).join(", ") || "(none)";
    throw new Error(`Board not found: "${boardName}". Available: ${names}`);
  }
  return match.id;
}

async function main() {
  const title = readArg("--title");
  const description = readArg("--description");
  const link = readArg("--link");
  const imageUrl = readArg("--image");
  const altText = readArg("--alt") || title;

  const missing = [];
  if (!title) missing.push("--title");
  if (!description) missing.push("--description");
  if (!link) missing.push("--link");
  if (!imageUrl) missing.push("--image");

  if (missing.length) {
    console.error("Usage:");
    console.error(
      "  node scripts/pinterest-create-pin.mjs --title \"...\" --description \"...\" --link \"https://...\" --image \"https://...\" [--board \"Wedding Gift Ideas\"] [--alt \"...\"]",
    );
    process.exit(1);
  }

  const boardId = await resolveBoardId();

  if (hasFlag("--dry-run")) {
    console.log(JSON.stringify({ board_id: boardId, title, description, link, imageUrl, altText }, null, 2));
    return;
  }

  const pin = await createPin({ boardId, title, description, link, imageUrl, altText });
  console.log("Pin created.");
  console.log(`  id: ${pin.id}`);
  console.log(`  link: ${pin.link || link}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
