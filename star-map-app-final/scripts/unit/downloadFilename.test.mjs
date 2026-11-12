/**
 * downloadFilename.ts — deterministic download name construction.
 *
 * Regression targets:
 * - title slug comes from the title text box (id/label), else first non-empty,
 *   else the custom-star-map fallback; punctuation collapses; length capped
 * - datetimeISO uses the UTC calendar date; missing/invalid → date-unknown
 * - mapId is alnum-only and truncated; absent mapId omits the suffix
 * - mode toggles hd vs preview in the filename
 */
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register("./tsAliasLoader.mjs", import.meta.url);

const { buildStarMapDownloadFilename } = await import(
  "../../src/lib/downloadFilename.ts"
);

test("fallback name when recipe is absent: custom-star-map + date-unknown + mode", () => {
  assert.equal(
    buildStarMapDownloadFilename({ mode: "preview" }),
    "starmap-custom-star-map-date-unknown-preview.png",
  );
  assert.equal(
    buildStarMapDownloadFilename({ recipe: null, mode: "hd" }),
    "starmap-custom-star-map-date-unknown-hd.png",
  );
});

test("title prefers id=title, then label=title, then first non-empty text box", () => {
  assert.equal(
    buildStarMapDownloadFilename({
      mode: "hd",
      recipe: {
        datetimeISO: "2024-07-04T12:00:00.000Z",
        textBoxes: [
          { id: "subtitle", text: "Ignored" },
          { id: "title", text: "Our First Date!!" },
        ],
      },
    }),
    "starmap-our-first-date-2024-07-04-hd.png",
  );

  assert.equal(
    buildStarMapDownloadFilename({
      mode: "preview",
      recipe: {
        datetimeISO: "2020-01-02T00:00:00.000Z",
        textBoxes: [{ label: "Title", text: "Anniversary Night" }],
      },
    }),
    "starmap-anniversary-night-2020-01-02-preview.png",
  );

  assert.equal(
    buildStarMapDownloadFilename({
      mode: "hd",
      recipe: {
        datetimeISO: "not-a-date",
        textBoxes: [{ id: "other", text: "   " }, { id: "msg", text: "Hello World" }],
      },
    }),
    "starmap-hello-world-date-unknown-hd.png",
  );
});

test("mapId suffix is sanitized and truncated; empty after sanitize is omitted", () => {
  assert.equal(
    buildStarMapDownloadFilename({
      mode: "hd",
      mapId: "AbC-123_XYZ!!!extra",
      recipe: { datetimeISO: "2021-12-25T08:00:00.000Z", textBoxes: [] },
    }),
    "starmap-custom-star-map-2021-12-25-hd-abc123xyze.png",
  );
  assert.equal(
    buildStarMapDownloadFilename({
      mode: "preview",
      mapId: "!!!",
      recipe: { textBoxes: [{ id: "title", text: "Sky" }] },
    }),
    "starmap-sky-date-unknown-preview.png",
  );
});

test("title slug length is capped at 48 characters after slugify", () => {
  const long = "A".repeat(80);
  const name = buildStarMapDownloadFilename({
    mode: "hd",
    recipe: { textBoxes: [{ id: "title", text: long }] },
  });
  const titlePart = name.split("-")[1]; // after "starmap"
  // full pattern: starmap-<title>-date-unknown-hd.png — title alone ≤ 48
  assert.ok(name.startsWith("starmap-"));
  assert.match(name, /^starmap-a{48}-date-unknown-hd\.png$/);
  void titlePart;
});
