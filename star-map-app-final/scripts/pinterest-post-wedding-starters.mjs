import { loadDotenv } from "./load-dotenv.mjs";
import { applyEnvAliases } from "./lib/env-aliases.mjs";
import { createPin, findBoardByName, listBoards } from "./lib/pinterest-client.mjs";

loadDotenv();
applyEnvAliases();

const SITE = (process.env.PINTEREST_SITE_ORIGIN || "https://starmapco.com").replace(/\/+$/, "");
const CAMPAIGN = "gift_wedding_2026";

function weddingLink(content) {
  const params = new URLSearchParams({
    utm_source: "pinterest",
    utm_medium: "social",
    utm_campaign: CAMPAIGN,
    utm_content: content,
  });
  return `${SITE}/wedding?${params.toString()}`;
}

const STARTER_PINS = [
  {
    id: "pin_lifestyle_framed",
    title: "Personalized Wedding Star Map Gift | Framed + HD | Free Preview",
    description:
      "Looking for a meaningful wedding gift they'll actually keep? Turn your ceremony date and location into a custom star map — preview free, then order a gift-ready framed print with instant HD digital. Astronomically accurate sky for the night you said I do. Preview your map now.",
    imageUrl: `${SITE}/home-mockups/offer-framed-print.png`,
    altText:
      "Framed wedding star map gift mockup in a bedroom — personalized night sky print from StarMapCo.",
  },
  {
    id: "pin_preset_heart",
    title: "Custom Wedding Star Map Gift | Heart Layout + Your Date",
    description:
      "See the exact wedding preset before you buy: heart layout, gold accents, ceremony date, and location. Enter your wedding day and venue in the free preview — one design for framed, unframed, or HD-only. Preview your map now.",
    imageUrl: `${SITE}/printproof/gallery/wedding-framed-cutout.webp`,
    altText:
      "Example wedding star map preset with heart shape, sample date and location — StarMapCo.",
  },
  {
    id: "pin_how_it_works",
    title: "How to Make a Wedding Star Map Gift (Free Preview First)",
    description:
      "Personalized wedding gift in under 5 minutes: pick the ceremony date and location, customize wording, preview the night sky for free, then checkout when it's perfect. Framed print + HD digital from one design. Planning guide: starmapco.com/blog/custom-star-maps-for-weddings",
    imageUrl: `${SITE}/examples/example-wedding-aurora-heart.webp`,
    altText: "Wedding star map in Aurora Night style with heart crop — personalized night sky gift example.",
  },
];

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
    readArg("--board") || process.env.PINTEREST_BOARD_NAME?.trim() || "Wedding Star Map Gifts";
  const boards = await listBoards();
  const match = findBoardByName(boards, boardName);
  if (!match?.id) {
    const names = boards.map((b) => b.name).join(", ") || "(none)";
    throw new Error(
      `Board "${boardName}" not found. Create it on Pinterest or pass --board-id. Available: ${names}`,
    );
  }
  return match.id;
}

async function main() {
  const dryRun = hasFlag("--dry-run");
  const only = readArg("--only");
  const pins = only ? STARTER_PINS.filter((p) => p.id === only) : STARTER_PINS;

  if (!pins.length) {
    throw new Error(`Unknown --only id. Options: ${STARTER_PINS.map((p) => p.id).join(", ")}`);
  }

  const boardId = dryRun ? "(dry-run)" : await resolveBoardId();

  console.log(`${dryRun ? "Dry run" : "Posting"} ${pins.length} wedding starter pin(s) → board ${boardId}\n`);

  for (const spec of pins) {
    const payload = {
      board_id: boardId,
      title: spec.title,
      description: spec.description,
      link: weddingLink(spec.id),
      imageUrl: spec.imageUrl,
      altText: spec.altText,
    };

    if (dryRun) {
      console.log(JSON.stringify({ id: spec.id, ...payload }, null, 2));
      console.log("");
      continue;
    }

    const pin = await createPin({
      boardId,
      title: spec.title,
      description: spec.description,
      link: payload.link,
      imageUrl: spec.imageUrl,
      altText: spec.altText,
    });
    console.log(`Created ${spec.id}: ${pin.id}`);
  }

  if (!dryRun) {
    console.log("\nDone. Verify pins on your Pinterest board and watch GA4 for utm_source=pinterest.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
