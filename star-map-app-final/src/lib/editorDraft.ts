import type { MapRecipe } from "./renderSky";
import type { RenderOptions, StyleId, TextBox } from "./store";
import type { AspectRatio, Shape } from "./types";

export const EDITOR_DRAFT_STORAGE_KEY = "star-map-draft";
export const EDITOR_DRAFT_SCHEMA_VERSION = 1 as const;

export type EditorDraftData = Omit<MapRecipe, "renderOptions"> & {
  renderOptions: Partial<RenderOptions>;
  selectedOccasion: string | null;
};

/**
 * Recipe fields intentionally remain at the top level. Older StarMapCo readers
 * can continue treating this value as a MapRecipe while newer readers use the
 * schema metadata for validation and migrations.
 */
export type EditorDraftEnvelope = EditorDraftData & {
  schemaVersion: typeof EDITOR_DRAFT_SCHEMA_VERSION;
  savedAt: string;
};

export type EditorDraftInvalidReason =
  | "malformed_json"
  | "invalid_envelope"
  | "unsupported_schema_version"
  | "invalid_datetime"
  | "invalid_location"
  | "invalid_text_boxes"
  | "invalid_style"
  | "invalid_aspect_ratio"
  | "invalid_shape"
  | "invalid_render_options"
  | "invalid_selected_occasion";

export type EditorDraftParseOutcome =
  | {
      status: "restored";
      data: EditorDraftData;
      source: "versioned" | "legacy";
      savedAt: string | null;
      needsMigration: boolean;
    }
  | { status: "invalid"; reason: EditorDraftInvalidReason };

export type EditorDraftReadOutcome =
  | EditorDraftParseOutcome
  | { status: "empty" }
  | { status: "storage-unavailable"; operation: "read" };

export type EditorDraftWriteOutcome =
  | { status: "saved"; savedAt: string; envelope: EditorDraftEnvelope }
  | { status: "invalid"; reason: EditorDraftInvalidReason }
  | { status: "storage-unavailable"; operation: "write" };

export interface EditorDraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface EditorDraftStorageHost {
  readonly localStorage: EditorDraftStorage;
}

type ValidationResult<T> = { ok: true; value: T } | { ok: false; reason: EditorDraftInvalidReason };

type UnknownRecord = Record<string, unknown>;

const VALID_STYLES = new Set<StyleId>(["navyGold", "vintageEngraving", "parchmentScroll", "midnightMinimal"]);
const VALID_ASPECT_RATIOS = new Set<AspectRatio>(["square", "3:4", "2:3", "4:5"]);
const VALID_SHAPES = new Set<Shape>(["rectangle", "heart", "circle", "star", "diamond"]);
const VALID_FONT_FAMILIES = new Set<TextBox["fontFamily"]>([
  "playfair",
  "cinzel",
  "script",
  "cormorant",
  "montserrat",
  "libreBaskerville",
  "ebGaramond",
  "crimsonText",
  "lora",
  "raleway",
  "poppins",
  "dancingScript",
  "parisienne",
  "bebasNeue",
  "abrilFatface",
]);
const VALID_TEXT_ALIGNMENTS = new Set<TextBox["align"]>(["left", "center", "right"]);

/**
 * Editor recipes use an extended ISO timestamp with seconds, optional
 * millisecond precision, and either `Z` or an explicit `+/-HH:mm` offset.
 * `savedAt` is generated with Date#toISOString and therefore has a narrower,
 * canonical UTC representation with exactly three fractional digits.
 */
const EDITOR_DATETIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?(Z|([+-])(\d{2}):(\d{2}))$/;
const CANONICAL_SAVED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type StrictIsoTimestamp = {
  instantMs: number;
};

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const monthLengths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return monthLengths[month - 1] ?? 0;
}

function parseStrictEditorTimestamp(value: string): StrictIsoTimestamp | null {
  const match = EDITOR_DATETIME_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = match[7] ? Number(match[7]) : 0;
  const zone = match[8];
  const offsetHour = zone === "Z" ? 0 : Number(match[10]);
  const offsetMinute = zone === "Z" ? 0 : Number(match[11]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return null;
  }

  const offsetDirection = zone === "Z" || match[9] === "+" ? 1 : -1;
  const offsetMs = offsetDirection * (offsetHour * 60 + offsetMinute) * 60_000;

  // Construct the local timestamp without Date's string parser, then verify
  // every component after applying and reversing the declared offset.
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  const instantMs = local.getTime() - offsetMs;
  if (!Number.isFinite(instantMs)) return null;

  const roundTrip = new Date(instantMs + offsetMs);
  if (
    roundTrip.getUTCFullYear() !== year ||
    roundTrip.getUTCMonth() !== month - 1 ||
    roundTrip.getUTCDate() !== day ||
    roundTrip.getUTCHours() !== hour ||
    roundTrip.getUTCMinutes() !== minute ||
    roundTrip.getUTCSeconds() !== second ||
    roundTrip.getUTCMilliseconds() !== millisecond
  ) {
    return null;
  }

  return { instantMs };
}

function isValidEditorTimestamp(value: string): boolean {
  return parseStrictEditorTimestamp(value) !== null;
}

function isCanonicalSavedAt(value: string): boolean {
  if (!CANONICAL_SAVED_AT_PATTERN.test(value)) return false;
  const parsed = parseStrictEditorTimestamp(value);
  return parsed !== null && new Date(parsed.instantMs).toISOString() === value;
}

const FALLBACK_TEXT_BOXES: ReadonlyArray<TextBox> = [
  {
    id: "title",
    label: "Title",
    text: "",
    fontFamily: "cinzel",
    color: "#d7b56c",
    size: 48,
    align: "center",
    position: { x: 0.5, y: 0.12 },
  },
  {
    id: "subtitle",
    label: "Subtitle",
    text: "",
    fontFamily: "raleway",
    color: "#c8a662",
    size: 28,
    align: "center",
    position: { x: 0.5, y: 0.18 },
  },
  {
    id: "dedication",
    label: "Dedication",
    text: "",
    fontFamily: "script",
    color: "#b98a3d",
    size: 26,
    align: "center",
    position: { x: 0.5, y: 0.9 },
  },
];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function textBoxFallback(index: number): TextBox {
  return (
    FALLBACK_TEXT_BOXES[index] ?? {
      id: `custom-${index + 1}`,
      label: `Line ${index + 1}`,
      text: "",
      fontFamily: "playfair",
      color: "#ffffff",
      size: 28,
      align: "center",
      position: { x: 0.5, y: Math.min(0.9, 0.7 + index * 0.05) },
    }
  );
}

function normalizeTextBoxes(value: unknown): ValidationResult<TextBox[]> {
  if (!Array.isArray(value)) {
    return { ok: false, reason: "invalid_text_boxes" };
  }

  const ids = new Set<string>();
  const boxes: TextBox[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isRecord(raw) || typeof raw.text !== "string") {
      return { ok: false, reason: "invalid_text_boxes" };
    }

    const fallback = textBoxFallback(index);
    const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : fallback.id;
    if (ids.has(id)) {
      return { ok: false, reason: "invalid_text_boxes" };
    }
    ids.add(id);

    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : fallback.label;
    const fontFamily =
      typeof raw.fontFamily === "string" && VALID_FONT_FAMILIES.has(raw.fontFamily as TextBox["fontFamily"])
        ? (raw.fontFamily as TextBox["fontFamily"])
        : fallback.fontFamily;
    const color = typeof raw.color === "string" && raw.color.trim() ? raw.color.trim() : fallback.color;
    const size =
      typeof raw.size === "number" && Number.isFinite(raw.size) ? clamp(raw.size, 10, 200) : fallback.size;
    const align =
      typeof raw.align === "string" && VALID_TEXT_ALIGNMENTS.has(raw.align as TextBox["align"])
        ? (raw.align as TextBox["align"])
        : fallback.align;

    let position = fallback.position ? { ...fallback.position } : undefined;
    if (hasOwn(raw, "position") && typeof raw.position !== "undefined") {
      if (!isRecord(raw.position)) {
        return { ok: false, reason: "invalid_text_boxes" };
      }
      const { x, y } = raw.position;
      if (typeof x !== "number" || !Number.isFinite(x) || typeof y !== "number" || !Number.isFinite(y)) {
        return { ok: false, reason: "invalid_text_boxes" };
      }
      position = { x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
    }

    const box: TextBox = {
      id,
      label,
      text: raw.text,
      fontFamily,
      color,
      size,
      align,
      textShadow: typeof raw.textShadow === "boolean" ? raw.textShadow : false,
      textGlow: typeof raw.textGlow === "boolean" ? raw.textGlow : false,
      ...(position ? { position } : {}),
    };
    if (typeof raw.fontWeight === "number" && Number.isFinite(raw.fontWeight)) {
      box.fontWeight = Math.round(clamp(raw.fontWeight, 100, 900));
    }
    boxes.push(box);
  }

  return { ok: true, value: boxes };
}

function normalizeLocation(value: unknown): ValidationResult<EditorDraftData["location"]> {
  if (!isRecord(value)) {
    return { ok: false, reason: "invalid_location" };
  }
  const { name, latitude, longitude, timezone } = value;
  if (
    typeof name !== "string" ||
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180 ||
    typeof timezone !== "string" ||
    !timezone.trim()
  ) {
    return { ok: false, reason: "invalid_location" };
  }

  const normalizedTimezone = timezone.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: normalizedTimezone }).format(0);
  } catch {
    return { ok: false, reason: "invalid_location" };
  }

  return {
    ok: true,
    value: {
      name: name.trim(),
      latitude,
      longitude,
      timezone: normalizedTimezone,
    },
  };
}

function normalizeRenderOptions(value: unknown): ValidationResult<Partial<RenderOptions>> {
  if (typeof value === "undefined") {
    return { ok: true, value: {} };
  }
  if (!isRecord(value)) {
    return { ok: false, reason: "invalid_render_options" };
  }

  const normalized: Partial<RenderOptions> = {};
  const enumFields = {
    mapLookTier: new Set(["minimal", "polished", "custom"]),
    visualMode: new Set(["astronomical", "enhanced", "illustrated"]),
    starIntensity: new Set(["subtle", "normal", "bold"]),
    constellationLines: new Set(["off", "thin", "thick"]),
    premiumStars: new Set(["off", "subtle", "realistic"]),
    premiumPlanets: new Set(["off", "realistic"]),
    planetEmphasis: new Set(["normal", "highlighted"]),
    moonSize: new Set(["normal", "large"]),
    shapeMask: VALID_SHAPES,
  } as const;

  for (const [key, allowed] of Object.entries(enumFields)) {
    if (!hasOwn(value, key)) continue;
    const candidate = value[key];
    if (typeof candidate === "undefined") continue;
    if (typeof candidate !== "string" || !allowed.has(candidate as never)) {
      return { ok: false, reason: "invalid_render_options" };
    }
    (normalized as UnknownRecord)[key] = candidate;
  }

  const booleanFields = [
    "starGlow",
    "constellationLabels",
    "showGrid",
    "showPlanets",
    "showMoon",
    "frameEnabled",
    "transparentBackground",
    "showTechnicalRing",
  ] as const;
  for (const key of booleanFields) {
    if (!hasOwn(value, key)) continue;
    if (typeof value[key] === "undefined") continue;
    if (typeof value[key] !== "boolean") {
      return { ok: false, reason: "invalid_render_options" };
    }
    normalized[key] = value[key];
  }

  const colorFields = ["backgroundColor", "constellationColor"] as const;
  for (const key of colorFields) {
    if (!hasOwn(value, key)) continue;
    if (typeof value[key] === "undefined") continue;
    if (typeof value[key] !== "string") {
      return { ok: false, reason: "invalid_render_options" };
    }
    normalized[key] = value[key].trim();
  }

  if (hasOwn(value, "constellationLineScale") && typeof value.constellationLineScale !== "undefined") {
    const scale = value.constellationLineScale;
    if (typeof scale !== "number" || !Number.isFinite(scale)) {
      return { ok: false, reason: "invalid_render_options" };
    }
    normalized.constellationLineScale = clamp(scale, 0.5, 2);
  }

  return { ok: true, value: normalized };
}

export function normalizeEditorDraftData(value: unknown): ValidationResult<EditorDraftData> {
  if (!isRecord(value)) {
    return { ok: false, reason: "invalid_envelope" };
  }

  if (typeof value.datetimeISO !== "string" || !isValidEditorTimestamp(value.datetimeISO)) {
    return { ok: false, reason: "invalid_datetime" };
  }
  const location = normalizeLocation(value.location);
  if (!location.ok) return location;
  const textBoxes = normalizeTextBoxes(value.textBoxes);
  if (!textBoxes.ok) return textBoxes;
  const renderOptions = normalizeRenderOptions(value.renderOptions);
  if (!renderOptions.ok) return renderOptions;

  let selectedStyle: StyleId = "navyGold";
  if (hasOwn(value, "selectedStyle")) {
    if (typeof value.selectedStyle !== "string" || !VALID_STYLES.has(value.selectedStyle as StyleId)) {
      return { ok: false, reason: "invalid_style" };
    }
    selectedStyle = value.selectedStyle as StyleId;
  }

  let aspectRatio: AspectRatio = "square";
  if (hasOwn(value, "aspectRatio")) {
    if (typeof value.aspectRatio !== "string" || !VALID_ASPECT_RATIOS.has(value.aspectRatio as AspectRatio)) {
      return { ok: false, reason: "invalid_aspect_ratio" };
    }
    aspectRatio = value.aspectRatio as AspectRatio;
  }

  let shape: Shape = "rectangle";
  if (hasOwn(value, "shape")) {
    if (typeof value.shape !== "string" || !VALID_SHAPES.has(value.shape as Shape)) {
      return { ok: false, reason: "invalid_shape" };
    }
    shape = value.shape as Shape;
  } else if (renderOptions.value.shapeMask) {
    shape = renderOptions.value.shapeMask;
  }

  let selectedOccasion: string | null = null;
  if (hasOwn(value, "selectedOccasion")) {
    if (value.selectedOccasion !== null && typeof value.selectedOccasion !== "string") {
      return { ok: false, reason: "invalid_selected_occasion" };
    }
    selectedOccasion =
      typeof value.selectedOccasion === "string" && value.selectedOccasion.trim()
        ? value.selectedOccasion.trim()
        : null;
  }

  return {
    ok: true,
    value: {
      version:
        typeof value.version === "number" && Number.isInteger(value.version) && value.version > 0
          ? value.version
          : 1,
      seed: typeof value.seed === "string" && value.seed ? value.seed : "default",
      datetimeISO: value.datetimeISO,
      location: location.value,
      textBoxes: textBoxes.value,
      selectedStyle,
      aspectRatio,
      shape,
      renderOptions: renderOptions.value,
      selectedOccasion,
    },
  };
}

export function parseEditorDraft(raw: string): EditorDraftParseOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", reason: "malformed_json" };
  }
  if (!isRecord(parsed)) {
    return { status: "invalid", reason: "invalid_envelope" };
  }

  const isVersioned = hasOwn(parsed, "schemaVersion");
  let savedAt: string | null = null;
  if (isVersioned) {
    if (parsed.schemaVersion !== EDITOR_DRAFT_SCHEMA_VERSION) {
      return { status: "invalid", reason: "unsupported_schema_version" };
    }
    if (typeof parsed.savedAt !== "string" || !isCanonicalSavedAt(parsed.savedAt)) {
      return { status: "invalid", reason: "invalid_envelope" };
    }
    savedAt = parsed.savedAt;
  }

  const normalized = normalizeEditorDraftData(parsed);
  if (!normalized.ok) {
    return { status: "invalid", reason: normalized.reason };
  }
  return {
    status: "restored",
    data: normalized.value,
    source: isVersioned ? "versioned" : "legacy",
    savedAt,
    needsMigration: !isVersioned,
  };
}

export function readEditorDraft(
  storage: Pick<EditorDraftStorage, "getItem">,
  key = EDITOR_DRAFT_STORAGE_KEY
): EditorDraftReadOutcome {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { status: "storage-unavailable", operation: "read" };
  }
  if (raw === null) {
    return { status: "empty" };
  }
  return parseEditorDraft(raw);
}

export function readEditorDraftFromHost(
  host: EditorDraftStorageHost,
  key = EDITOR_DRAFT_STORAGE_KEY
): EditorDraftReadOutcome {
  try {
    return readEditorDraft(host.localStorage, key);
  } catch {
    return { status: "storage-unavailable", operation: "read" };
  }
}

export function writeEditorDraft(
  storage: Pick<EditorDraftStorage, "setItem">,
  data: unknown,
  options: { key?: string; now?: () => Date } = {}
): EditorDraftWriteOutcome {
  const normalized = normalizeEditorDraftData(data);
  if (!normalized.ok) {
    return { status: "invalid", reason: normalized.reason };
  }

  const now = options.now?.() ?? new Date();
  if (!Number.isFinite(now.getTime())) {
    return { status: "invalid", reason: "invalid_envelope" };
  }
  const savedAt = now.toISOString();
  const envelope: EditorDraftEnvelope = {
    ...normalized.value,
    schemaVersion: EDITOR_DRAFT_SCHEMA_VERSION,
    savedAt,
  };

  try {
    storage.setItem(options.key ?? EDITOR_DRAFT_STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    return { status: "storage-unavailable", operation: "write" };
  }
  return { status: "saved", savedAt, envelope };
}

export function writeEditorDraftToHost(
  host: EditorDraftStorageHost,
  data: unknown,
  options: { key?: string; now?: () => Date } = {}
): EditorDraftWriteOutcome {
  try {
    return writeEditorDraft(host.localStorage, data, options);
  } catch {
    return { status: "storage-unavailable", operation: "write" };
  }
}
