/**
 * SQ-58 / issue #429 — shared Sentry privacy policy for StarMapCo.
 *
 * One policy, applied identically by the browser SDK (@sentry/react) and the
 * Worker SDK (@sentry/cloudflare) through `beforeSend`. The policy is
 * deny-by-default: instead of redacting fields out of the SDK's event, it
 * reconstructs a minimal event from an allowlist, so any field the SDK (or a
 * future SDK version) adds is dropped unless it is explicitly permitted here.
 *
 * Never permitted (SQ-42 PII inventory): customer emails, names, phone
 * numbers, addresses or precise locations; order payloads and Stripe /
 * Printful objects; payment / session / customer / order identifiers; magic
 * links, claim tokens, cookies, authorization headers, capability or download
 * URLs, referral bearer material; asset / map identifiers,
 * `publicationArtifactId`, artwork or uploaded bytes, map titles, customer
 * content, storage keys; customer IPs or stable device identifiers.
 *
 * What survives: a fixed error operation code, the exception TYPE (never its
 * message — provider/customer text rides in messages), sanitized stack frames
 * (application paths only, no query/fragment, no frame variables or context
 * lines), release / environment, the runtime tag, and bounded enum tags.
 *
 * If scrubbing itself fails, the event is dropped (`safeScrubSentryEvent`
 * returns null), never sent unscrubbed.
 */

export const SENTRY_OPERATION_CODES = [
  "browser_unhandled",
  "browser_react_boundary",
  "worker_fetch_unhandled",
  "worker_scheduled_unhandled",
  "review_tick_failed",
  "print_authority_failure",
  "entitlement_authority_failure",
  "referral_discovery_failure",
  "checkout_failure",
  "download_failure",
] as const;

export type SentryOperationCode = (typeof SENTRY_OPERATION_CODES)[number];

export const SENTRY_RUNTIMES = ["browser", "worker"] as const;
export type SentryRuntime = (typeof SENTRY_RUNTIMES)[number];

/**
 * SDK data-collection posture (Sentry v11 `dataCollection`, the successor of
 * `sendDefaultPii: false`): every automatic collection channel is off —
 * user info, cookies, headers, bodies, query params, frame variables and
 * source context lines included. This is defense in depth; the beforeSend
 * scrubber below is the hard fence that rebuilds the event regardless of
 * what the SDK collected.
 */
export const SENTRY_DATA_COLLECTION_OFF = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
};

/**
 * Browser integration allowlist (names as reported by @sentry/browser v11).
 * Everything else the SDK enables by default is excluded on purpose:
 * Breadcrumbs (console/fetch/DOM capture), Console (log capture), HttpContext
 * (request URL), BrowserSession (session tracking), CultureContext and
 * ConversationId (ambient identifiers) must never run.
 */
export const SENTRY_BROWSER_INTEGRATION_ALLOWLIST: readonly string[] = [
  "BrowserApiErrors",
  "Dedupe",
  "FunctionToString",
  "GlobalHandlers",
  "InboundFilters",
  "LinkedErrors",
];

const OPERATION_CODE_SET: ReadonlySet<string> = new Set(SENTRY_OPERATION_CODES);
const RUNTIME_SET: ReadonlySet<string> = new Set(SENTRY_RUNTIMES);
const LEVEL_SET: ReadonlySet<string> = new Set(["fatal", "error", "warning", "info", "debug"]);
const STAGE_SET: ReadonlySet<string> = new Set(["capture", "render", "submit", "fulfil", "deliver", "tick"]);
const STATUS_CLASS_SET: ReadonlySet<string> = new Set(["2xx", "3xx", "4xx", "5xx", "timeout", "aborted"]);
const DO_NAME_SET: ReadonlySet<string> = new Set([
  "PrintOrderAuthorityDO",
  "ReviewRequestLedgerDO",
  "ReviewRequestSuppressionDO",
  "EntitlementAuthorityDO",
  "ConsistencyCoordinatorDO",
  "ReferralDiscoveryDO",
]);
const TAG_KEY_SET: ReadonlySet<string> = new Set([
  "runtime",
  "operation",
  "stage",
  "status_class",
  "do_name",
]);

const SAFE_TOKEN = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const EXCEPTION_TYPE = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
const RELEASE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9@._-]{0,127}$/;
const VERSION_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const EVENT_ID_TOKEN = /^[a-f0-9]{32}$/i;
const DSN_SHAPE = /^https:\/\/[^\s/@]+@[^\s/]+\/\S+$/;
const MAX_FRAMES = 50;
const MAX_EXCEPTION_VALUES = 5;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeToken(value: unknown): value is string {
  return typeof value === "string" && SAFE_TOKEN.test(value);
}

/**
 * Path prefixes recognized as build/source artifacts whose frames are safe
 * to retain verbatim (chunk hashes and source paths carry no customer
 * identifiers). Everything else — notably document/route URLs such as
 * `/m/<map-id>`, whose path segments can BE customer identifiers — collapses
 * to the fixed unknown value.
 */
const ARTIFACT_PATH_PREFIXES: readonly string[] = [
  "/_next/",
  "/src/",
  "/app/",
  "/chunks/",
  "/node_modules/",
  "/server-functions/",
];
const CODE_BASENAME = /^[A-Za-z0-9._-]+\.(?:m?js|jsx?|tsx?)$/;

/**
 * Reduce a stack-frame filename to a recognized artifact path: scheme and
 * host are stripped, query string and fragment are removed, and the path is
 * retained only when it matches a known build/source artifact shape (or is
 * a bare code-file basename, e.g. a bundled worker entry). Anything else —
 * including route/document URLs with identifiers in their path segments —
 * becomes `app://unknown`.
 */
export function sanitizeSentryFilename(raw: unknown): string {
  if (typeof raw !== "string") return "app://unknown";
  let path = raw.trim();
  if (!path) return "app://unknown";
  const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(path);
  if (scheme) {
    path = path.slice(scheme[0].length);
    const slash = path.indexOf("/");
    if (slash > 0) {
      const firstSegment = path.slice(0, slash);
      // Drop a host segment ("starmapco.com") or a webpack-style "./" root.
      if (firstSegment === "." || firstSegment === ".." || firstSegment.includes(".")) {
        path = path.slice(slash + 1);
      }
    } else if (slash === 0) {
      path = path.slice(1);
    }
  }
  path = path.split(/[?#]/)[0] ?? "";
  path = path.replace(/^\/+/, "");
  while (path.startsWith("./") || path.startsWith("../")) {
    path = path.slice(path.indexOf("/") + 1);
  }
  if (!path) return "app://unknown";
  const normalized = `/${path}`;
  if (ARTIFACT_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return normalized.length > 200 ? normalized.slice(normalized.length - 200) : normalized;
  }
  if (!path.includes("/") && CODE_BASENAME.test(path)) return normalized;
  return "app://unknown";
}

function scrubFrame(frame: unknown): UnknownRecord | null {
  if (!isRecord(frame)) return null;
  const out: UnknownRecord = {
    filename: sanitizeSentryFilename(frame.filename ?? frame.abs_path),
  };
  if (
    typeof frame.function === "string" &&
    frame.function.length <= 128 &&
    !/[\s?&#@/\\]/.test(frame.function)
  ) {
    out.function = frame.function;
  } else {
    out.function = "<anonymous>";
  }
  if (typeof frame.module === "string" && /^[A-Za-z0-9_./-]{1,128}$/.test(frame.module)) {
    out.module = frame.module;
  }
  if (typeof frame.lineno === "number" && Number.isInteger(frame.lineno) && frame.lineno >= 0) {
    out.lineno = frame.lineno;
  }
  if (typeof frame.colno === "number" && Number.isInteger(frame.colno) && frame.colno >= 0) {
    out.colno = frame.colno;
  }
  if (typeof frame.in_app === "boolean") out.in_app = frame.in_app;
  return out;
}

function scrubExceptionValue(value: unknown, operation: string | undefined): UnknownRecord | null {
  if (!isRecord(value)) return null;
  const out: UnknownRecord = {
    type: typeof value.type === "string" && EXCEPTION_TYPE.test(value.type) ? value.type : "Error",
    // The raw exception message is NEVER forwarded: provider and customer
    // text rides in messages. The fixed operation code takes its place.
    value: operation ? `operation:${operation}` : "[scrubbed exception]",
  };
  if (isRecord(value.mechanism)) {
    out.mechanism = {
      type: isSafeToken(value.mechanism.type) ? value.mechanism.type : "generic",
      handled: typeof value.mechanism.handled === "boolean" ? value.mechanism.handled : false,
    };
  }
  if (isRecord(value.stacktrace) && Array.isArray(value.stacktrace.frames)) {
    const frames = value.stacktrace.frames
      .map((frame) => scrubFrame(frame))
      .filter((frame): frame is UnknownRecord => frame !== null)
      .slice(-MAX_FRAMES);
    if (frames.length > 0) out.stacktrace = { frames };
  }
  if (typeof value.thread_id === "number" && Number.isInteger(value.thread_id)) {
    out.thread_id = value.thread_id;
  }
  return out;
}

function scrubTags(input: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(input)) return out;
  for (const key of Object.keys(input)) {
    if (!TAG_KEY_SET.has(key)) continue;
    const value = input[key];
    if (typeof value !== "string") continue;
    if (key === "runtime" && RUNTIME_SET.has(value)) out[key] = value;
    else if (key === "operation" && OPERATION_CODE_SET.has(value)) out[key] = value;
    else if (key === "stage" && STAGE_SET.has(value)) out[key] = value;
    else if (key === "status_class" && STATUS_CLASS_SET.has(value)) out[key] = value;
    else if (key === "do_name" && DO_NAME_SET.has(value)) out[key] = value;
  }
  return out;
}

/**
 * Reconstruct the minimal shippable event from an SDK event. Returns null to
 * drop the event (non-object input, or no exception payload — this wiring
 * only ships error events).
 */
export function scrubSentryEvent(input: unknown): UnknownRecord | null {
  if (!isRecord(input)) return null;

  const tags = scrubTags(input.tags);
  const operation = tags.operation;

  const out: UnknownRecord = { platform: "javascript" };
  if (typeof input.event_id === "string" && EVENT_ID_TOKEN.test(input.event_id)) {
    out.event_id = input.event_id;
  }
  if (typeof input.timestamp === "number" && Number.isFinite(input.timestamp)) {
    out.timestamp = input.timestamp;
  }
  out.level = typeof input.level === "string" && LEVEL_SET.has(input.level) ? input.level : "error";
  if (isSafeToken(input.environment)) out.environment = input.environment;
  if (typeof input.release === "string" && RELEASE_TOKEN.test(input.release)) {
    out.release = input.release;
  }
  if (Object.keys(tags).length > 0) out.tags = tags;

  // Contexts are rebuilt from scratch: runtime name/version only. app,
  // browser, device, os and trace contexts are dropped — they can carry
  // ambient identifiers and request URLs.
  if (isRecord(input.contexts) && isRecord(input.contexts.runtime)) {
    const runtime: UnknownRecord = {};
    if (isSafeToken(input.contexts.runtime.name)) {
      runtime.name = input.contexts.runtime.name;
    }
    if (
      typeof input.contexts.runtime.version === "string" &&
      VERSION_TOKEN.test(input.contexts.runtime.version)
    ) {
      runtime.version = input.contexts.runtime.version;
    }
    if (Object.keys(runtime).length > 0) out.contexts = { runtime };
  }

  if (isRecord(input.sdk)) {
    const sdk: UnknownRecord = {};
    if (typeof input.sdk.name === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(input.sdk.name)) {
      sdk.name = input.sdk.name;
    }
    if (typeof input.sdk.version === "string" && VERSION_TOKEN.test(input.sdk.version)) {
      sdk.version = input.sdk.version;
    }
    if (Object.keys(sdk).length > 0) out.sdk = sdk;
  }

  if (Array.isArray(input.fingerprint)) {
    const fingerprint = input.fingerprint.filter(
      (entry): entry is string =>
        typeof entry === "string" && (entry === "{{ default }}" || OPERATION_CODE_SET.has(entry))
    );
    if (fingerprint.length > 0) out.fingerprint = fingerprint;
  }

  if (!isRecord(input.exception) || !Array.isArray(input.exception.values)) {
    return null;
  }
  const values = input.exception.values
    .map((value) => scrubExceptionValue(value, operation))
    .filter((value): value is UnknownRecord => value !== null)
    .slice(0, MAX_EXCEPTION_VALUES);
  if (values.length === 0) return null;
  out.exception = { values };

  return out;
}

/** `beforeSend` entry point: any scrubber failure drops the event. */
export function safeScrubSentryEvent(input: unknown): UnknownRecord | null {
  try {
    return scrubSentryEvent(input);
  } catch {
    return null;
  }
}

export interface SentryRuntimeConfig {
  dsn: string;
  release?: string;
  environment: string;
}

/**
 * Resolve the runtime configuration for one SDK instance. Returns null when
 * no usable DSN is configured — both SDKs stay fully inert in that case, so
 * this wiring ships dark and activates only when the owner sets the DSN
 * (browser: NEXT_PUBLIC_SENTRY_DSN at build time; Worker: SENTRY_DSN env).
 */
export function resolveSentryConfig(input: {
  dsn?: unknown;
  release?: unknown;
  environment?: unknown;
}): SentryRuntimeConfig | null {
  const dsn = typeof input.dsn === "string" ? input.dsn.trim() : "";
  if (!dsn || !DSN_SHAPE.test(dsn)) return null;
  const config: SentryRuntimeConfig = {
    dsn,
    environment: isSafeToken(input.environment) ? input.environment : "production",
  };
  if (typeof input.release === "string" && RELEASE_TOKEN.test(input.release)) {
    config.release = input.release;
  }
  return config;
}

/** Keep only the allowlisted browser integrations, in SDK order. */
export function filterSentryIntegrationsByName<T extends { name: string }>(integrations: readonly T[]): T[] {
  return integrations.filter((integration) =>
    SENTRY_BROWSER_INTEGRATION_ALLOWLIST.includes(integration.name)
  );
}
