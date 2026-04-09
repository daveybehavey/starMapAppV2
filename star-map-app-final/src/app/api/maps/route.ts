import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/kv";
import crypto from "node:crypto";
import { checkRateLimit, getClientIp, rateLimitResponse } from "@/lib/rateLimit";
import {
  CHECKOUT_INTENT_COOKIE_NAME,
  CHECKOUT_INTENT_TTL_SECONDS,
  checkoutIntentKey,
  createCheckoutIntentNonce,
  createStoredCheckoutIntent,
} from "@/lib/checkoutIntent";

const MAX_BODY_BYTES = 50_000;
const MAX_TEXTBOXES = 12;
const MAX_TEXT_LENGTH = 240;
const MAX_LABEL_LENGTH = 60;
const MAX_NAME_LENGTH = 200;
const MAX_ID_LENGTH = 120;
const MAX_TZ_LENGTH = 64;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 200;

// Valid enum values for strict validation
const VALID_STYLES = new Set(["navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"]);
const VALID_SHAPES = new Set(["rectangle", "heart", "circle", "star", "diamond"]);
const VALID_ASPECT_RATIOS = new Set(["square", "3:4", "2:3", "4:5"]);
const VALID_FONTS = new Set([
  "playfair", "cinzel", "script", "cormorant", "montserrat",
  "libreBaskerville", "ebGaramond", "crimsonText", "lora",
  "raleway", "poppins", "dancingScript", "parisienne", "bebasNeue", "abrilFatface"
]);
const VALID_ALIGNS = new Set(["left", "center", "right"]);

type MapRecipe = {
  version: number;
  seed: string;
  datetimeISO: string;
  location: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
  textBoxes: unknown;
  selectedStyle: string;
  aspectRatio?: string;
  shape?: string;
  renderOptions?: Record<string, unknown>;
};

type StoredTextBox = {
  id?: string;
  label?: string;
  text?: string;
  fontFamily?: string;
  color?: string;
  size?: number;
  align?: string;
  textShadow?: boolean;
  textGlow?: boolean;
  position?: { x?: number; y?: number };
};

type StoredRecipe = Omit<MapRecipe, "textBoxes"> & {
  textBoxes: StoredTextBox[];
};

export async function POST(req: NextRequest) {
  // Rate limit: 10 requests per minute per IP
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`maps:post:${ip}`, 10, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const raw = await req.text();
  if (!raw || raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  let body: MapRecipe;
  try {
    body = JSON.parse(raw) as MapRecipe;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.datetimeISO || !body?.location || !Array.isArray(body?.textBoxes) || !body?.selectedStyle) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const lat = Number(body.location.latitude);
  const lon = Number(body.location.longitude);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  // Validate selectedStyle against known values, fallback to navyGold
  const selectedStyle = typeof body.selectedStyle === "string" && VALID_STYLES.has(body.selectedStyle)
    ? body.selectedStyle
    : "navyGold";

  // Validate shape against known values, fallback to rectangle
  const shape = typeof body.shape === "string" && VALID_SHAPES.has(body.shape)
    ? body.shape
    : "rectangle";

  // Validate aspectRatio against known values, fallback to square
  const aspectRatio = typeof body.aspectRatio === "string" && VALID_ASPECT_RATIOS.has(body.aspectRatio)
    ? body.aspectRatio
    : "square";

  const sanitized: StoredRecipe = {
    version: Number.isFinite(body.version) ? body.version : 1,
    seed: typeof body.seed === "string" ? body.seed.slice(0, 80) : "default",
    datetimeISO: body.datetimeISO,
    location: {
      name: (body.location.name || "").slice(0, MAX_NAME_LENGTH),
      latitude: lat,
      longitude: lon,
      timezone: (body.location.timezone || "UTC").slice(0, MAX_TZ_LENGTH),
    },
    textBoxes: body.textBoxes.slice(0, MAX_TEXTBOXES).map((box) => sanitizeTextBox(box as StoredTextBox)),
    selectedStyle,
    aspectRatio,
    shape,
    renderOptions: sanitizeRenderOptions(body.renderOptions || {}),
  };

  const id = crypto.randomUUID();
  const ttlSeconds = 30 * 24 * 60 * 60; // 30 days
  await kv.set<StoredRecipe>(`map:${id}`, sanitized, { ex: ttlSeconds });
  const response = NextResponse.json({ id });
  const checkoutIntentNonce = createCheckoutIntentNonce();
  const storedCheckoutIntent = createStoredCheckoutIntent(checkoutIntentNonce);
  if (storedCheckoutIntent) {
    await kv.set(checkoutIntentKey(id), storedCheckoutIntent, { ex: CHECKOUT_INTENT_TTL_SECONDS });
    response.cookies.set({
      name: CHECKOUT_INTENT_COOKIE_NAME,
      value: checkoutIntentNonce,
      httpOnly: true,
      sameSite: "lax",
      secure:
        (process.env.NODE_ENV || "").trim() === "production" ||
        (process.env.NEXTJS_ENV || "").trim() === "production",
      path: "/api/checkout",
      maxAge: CHECKOUT_INTENT_TTL_SECONDS,
    });
  }
  return response;
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rateLimit = await checkRateLimit(`maps:get:${ip}`, 60, 60);
  if (!rateLimit.allowed) {
    return rateLimitResponse(rateLimit.resetIn);
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  }
  const data = await kv.get<MapRecipe>(`map:${id}`);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
    },
  });
}

function sanitizeTextBox(box: StoredTextBox): StoredTextBox {
  const text = typeof box.text === "string" ? box.text.slice(0, MAX_TEXT_LENGTH) : "";

  // Validate and clamp font size to safe bounds, default to 28 if missing
  const DEFAULT_FONT_SIZE = 28;
  let size: number;
  if (typeof box.size === "number" && Number.isFinite(box.size)) {
    size = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(box.size)));
  } else {
    size = DEFAULT_FONT_SIZE;
  }

  // Validate font family against allowed list, fallback to playfair
  const fontFamily = typeof box.fontFamily === "string" && VALID_FONTS.has(box.fontFamily)
    ? box.fontFamily
    : "playfair";

  // Validate alignment, fallback to center
  const align = typeof box.align === "string" && VALID_ALIGNS.has(box.align)
    ? box.align
    : "center";

  // Clamp position values to 0-1 range
  let position: { x?: number; y?: number } | undefined;
  if (box.position) {
    const x = typeof box.position.x === "number" && Number.isFinite(box.position.x)
      ? Math.max(0, Math.min(1, box.position.x))
      : undefined;
    const y = typeof box.position.y === "number" && Number.isFinite(box.position.y)
      ? Math.max(0, Math.min(1, box.position.y))
      : undefined;
    if (x !== undefined || y !== undefined) {
      position = { x, y };
    }
  }

  return {
    id: typeof box.id === "string" ? box.id.slice(0, MAX_ID_LENGTH) : undefined,
    label: typeof box.label === "string" ? box.label.slice(0, MAX_LABEL_LENGTH) : undefined,
    text,
    fontFamily,
    color: typeof box.color === "string" ? box.color.slice(0, 24) : undefined,
    size,
    align,
    textShadow: typeof box.textShadow === "boolean" ? box.textShadow : undefined,
    textGlow: typeof box.textGlow === "boolean" ? box.textGlow : undefined,
    position,
  };
}

function sanitizeRenderOptions(options: Record<string, unknown>) {
  const allowedKeys = new Set([
    "visualMode",
    "starIntensity",
    "starGlow",
    "constellationLines",
    "constellationLabels",
    "showGrid",
    "showPlanets",
    "premiumStars",
    "premiumPlanets",
    "planetEmphasis",
    "showMoon",
    "moonSize",
    "shapeMask",
    "frameEnabled",
    "backgroundColor",
    "constellationColor",
    "constellationLineScale",
  ]);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) {
    if (!allowedKeys.has(key)) continue;
    if (typeof value === "string") {
      sanitized[key] = value.slice(0, 80);
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      sanitized[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
