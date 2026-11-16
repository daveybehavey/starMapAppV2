# TE21 report — run-te21, lane 1

## Scope and provenance

Work order: the owner's TE-2-1 bridge brief, with its issue/PR waiver and **BUNDLE ONLY** override. No issue, push, PR, merge, deploy, or outbound message was made.

Fresh full clone: `https://github.com/daveybehavey/starMapAppV2.git` into `C:\Users\ReuseTechBC\projects\te21-fresh-origin`. `git fetch origin` succeeded. Exact verified base: **45db4a4ace4e82089906986fe53a3f4e65b885bc** (PR #655), still current at fetch. `git rev-parse --is-shallow-repository` returned `false`.

The clone was detached at `origin/main`, then `git worktree add C:\Users\ReuseTechBC\projects\sm-te21 -b fix/personalized-star-map-ctr HEAD` created the fresh worktree. The only application file changed is `star-map-app-final/src/app/personalized-star-map/page.tsx`. This report is the other committed file.

Disk gate: C: had 34,811,854,848 bytes free (32.42 GiB), above the 6 GiB minimum. The existing `projects` directory is a junction to `D:\projects`; D: also had over 194 GiB free when checked. No files were deleted by the operator workflow.

## Evidence and intended effect

Source: owner-supplied GSC pull, 28 days, PC service-account runner **2026-11-16T14:45Z**, also referenced by the browser GSC health check. The raw GSC file was not independently retrieved for this job.

Page baseline: `https://starmapco.com/personalized-star-map` — **0 clicks / 205 impressions / 0% CTR** over 28 days.

| Query | Supplied baseline | Response in this change |
| --- | --- | --- |
| personalized star map print | 0 clicks; 4 impressions; position 21.0 | Put “Personalized Star Map Print” at the start of title/H1; retain gift intent and physical-format choice. |
| download and print star map | 0 clicks; 2 impressions; position 8.0 | Meta, hero and visible FAQ explain free preview, purchase, payment confirmation and HD download for printing. No immediate-delivery promise. |
| star map gift digital | 0 clicks; 1 impression; position 10.0 | Title/H1 explicitly offer a digital gift; occasion copy explains the printable HD gift option. |

This is a low-cost relevance/CTR experiment on **205 impressions**, not a traffic flood or a proven uplift. These query samples are very small. No ranking or CTR improvement is claimed. Re-measure on **2026-12-14** against the same page and 28-day baseline, recording clicks, impressions, CTR and query positions; note any deployment date and other changes before attributing movement.

## Exact before/after strings

| Field | Before | After |
| --- | --- | --- |
| Title | Personalized Star Map Gift &#124; StarMapCo | Personalized Star Map Print or Digital Gift &#124; StarMapCo |
| Meta description | Looking for a personalized star map gift? Capture any date and place with a free preview, then choose framed print, unframed print, or HD digital delivery. | Preview your personalized star map free. Buy an HD digital gift to download and print, or order a framed or unframed print of your chosen date and place. |
| H1 | Personalized Star Map Gift | Personalized Star Map Print or Digital Gift |

Open Graph title/description now match the new title/description. Canonical, URL, images and Twitter settings were left intact.

The hero links “free preview” to `/star-map-generator`. The first personalization/occasion section links wedding/anniversary/birthday gift copy to `/star-map-gift`, physical-print copy to `/star-map-poster`, and format comparison to `/star-map-gift-formats`. These are contextual links rather than a new link list. Existing purchase/preview CTAs, their source values and destinations are untouched.

## Claims and structured data

Repository evidence inspected before adding copy:

- Free preview: `src/components/EditorExperience.tsx` exposes Generate preview and the free-preview flow; `src/components/PreviewStartForm.tsx` starts that flow. Existing export/render smoke exercises the preview path.
- Date/time/place: `src/lib/astronomy.ts` parses the selected datetime (or date/time/timezone), constructs an `Observer` from latitude/longitude and computes star horizon positions using the selected date. Copy says “sky calculated from” those inputs, avoiding an unsupported exact-photograph claim.
- Paid HD download: `src/lib/hdExportFulfillment.ts` verifies paid/credit entitlement and handles browser download; `src/components/WhatYouReceiveModule.tsx` describes the printable HD PNG. The page now says preview free, purchase HD delivery, then download after payment confirmation. Download code was read only.
- Price verification, **not new price copy**: `src/lib/printCatalog.ts` has USD defaults of 3900 cents for the 16×16 poster, 4900 for the 18×18 poster and 9900 for the framed print; `src/lib/pricing.ts` defaults the single digital purchase to 900 cents. Thus the supplied poster/framed $39–$99 and digital $9 statements agree with repo defaults. Environment overrides exist; no production price/config access was used. No price, SKU, shipping threshold or promotion was changed or added.
- No new imagery, reviews, testimonials, popularity claims or instant-delivery claims.

JSON-LD already existed: Product via `StorefrontProductSchema` / `ProductSchema`, FAQ via `FaqSchema`, and BreadcrumbList via `BreadcrumbSchema`. Product offers read the existing pricing and print-availability helpers; these were left unchanged. The page-local FAQ answer previously said HD was “included” while the visible answer said “paired with HD digital”; its JSON-LD now matches the visible answer. The download FAQ and its schema now share the same payment-confirmation wording. All six FAQ questions/answers are checked for visible/schema parity at head.

## Validation

All repo commands used **Node v22.23.5**, npm from the same installation, and **TZ=UTC**. Commands ran sequentially, with one Playwright worker as specified by the repository scripts. No production secrets or `.env.local` were used. Playwright's existing local test placeholders were supplied by its unchanged config.

Environment prefix in PowerShell:

```powershell
$env:PATH='C:\Users\ReuseTechBC\agent-node\node-v22.23.5-win-x64;'+$env:PATH
$env:TZ='UTC'
$env:PW_FORCE_NEW_SERVER='true'
```

`npm ci` passed (755 packages; about 18 minutes with slow registry requests). It reported 19 dependency audit findings (1 low, 18 moderate); no dependency changes were made. `npx playwright install chromium` passed. The initial C: junction-path smoke startup failed before tests: Next constructed an invalid path mixing C: and D: and could not find `routes-manifest.json`. Render hit the 300000ms startup timeout; commerce reproduced it and this job's failed server was stopped. Both smokes were rerun from **D:\projects\sm-te21\star-map-app-final**, the exact same worktree, and head smokes used that path too. No app/config workaround was made.

Static commands ran from `C:\Users\ReuseTechBC\projects\sm-te21\star-map-app-final`. Successful browser smoke commands ran from its resolved D: path.

| Exact command | Base | Head |
| --- | --- | --- |
| `npm run lint` | PASS; 0 errors, 17 warnings | PASS; 0 errors, same 17 warnings |
| `npm run typecheck` | PASS | PASS |
| `npm run test:unit` | 3,137 pass / 17 fail, 3,154 total | 3,137 pass / identical 17 fail, 3,154 total |
| `npm run build` | PASS; 120/120 static pages generated | PASS; 120/120 static pages generated |
| `npm run qa:smoke:render` (resolved path) | PASS; 9 tests | PASS; 9 tests |
| `npm run qa:smoke:commerce` (resolved path) | PASS; 32 tests | PASS; 32 tests |
| Focused unit command below | PASS; 15 tests | PASS; 15 tests |
| Focused rendered-page command below | PASS; 7 tests | PASS; 7 tests |
| `git diff --check` | Clean before editing | PASS |

The desktop and mobile screenshots were also visually inspected. The new H1 and hero fit both widths; existing buttons remain visible and usable. All existing hero editor-link labels and destinations match the base snapshot exactly.

Full unit suite means the complete repository `npm run test:unit` suite, not a filtered subset. The focused unit command was:

```powershell
node --test scripts/unit/shopProductSchema.test.mjs scripts/unit/storefrontProductOffers.test.mjs scripts/unit/noInstantClaims.test.mjs scripts/unit/moneyPageGiftCheckout.test.mjs
```

Focused rendered-page checks used a local harness outside the repository:

```powershell
$env:TE21_PHASE='base' # then 'head' against the head production build
node --test C:\Users\ReuseTechBC\projects\te21-focused.mjs
```

The seven browser-backed checks cover: HTTP 200 and one H1; exact title/description/canonical; Product and Breadcrumb JSON-LD; six visible FAQ questions (plus full answer parity at head); unchanged existing hero purchase/preview destinations; all four contextual destinations returning HTTP 200 (and contextual placement at head); desktop 1280px/mobile 390px layout with no horizontal overflow or visible instant claim. Screenshots and rendered metadata/JSON-LD were saved locally at `C:\Users\ReuseTechBC\projects\te21-{base,head}-{1280,390}.png` and `te21-{base,head}-rendered.json`. The harness is reproduced below for review/reuse; adjust its app/artifact paths for another machine.

### Pre-existing unit failures

Base and head each ran 3,154 tests: **3,137 pass, 17 fail, 0 skipped/cancelled/todo**. All 17 failure names and normalized diagnostic blocks are identical (duration lines removed and internal Node stack locations normalized). No unrelated fix was attempted. Local comparison evidence: `te21-unit-failure-comparison.json`.

| Test file | Failures | Observed failure at both base and head |
| --- | ---: | --- |
| businessProfilePhoneFence.test.mjs | 1 | Windows module path becomes `C:\D:\projects\...`; `ERR_MODULE_NOT_FOUND`. |
| cityPagesPrune.test.mjs | 2 | Absolute Windows imports use `d:` rather than a file URL; `ERR_UNSUPPORTED_ESM_URL_SCHEME`. |
| deployProductionBridge.test.mjs | 1 | Assertion: “Deploy to Cloudflare step must exist”. |
| dl1Slice4Publication.test.mjs | 1 | Byte pin compares carriage return with newline (`'\r' !== '\n'`). |
| fathersDayBlogMerge.test.mjs | 1 | Absolute Windows import rejected with `ERR_UNSUPPORTED_ESM_URL_SCHEME`. |
| frameInsetPurpose.test.mjs | 1 | LF-specific source regex does not match CRLF source. |
| kvBackup.test.mjs | 1 | Permission-mode assertion: 438 versus 384. |
| personaSweepWaveD.test.mjs | 1 | LF-specific import/source regex does not match CRLF source. |
| playwrightSmokeManifest.test.mjs | 2 | `spawnSync npm.cmd EINVAL` in smoke-discovery fixture. |
| reviewCountsHidden.test.mjs | 2 | Windows path-based scanning flags `src\lib\googleRatings.ts` and the comparison page. |
| settlementMitigation.test.mjs | 1 | Assertion: “preservation is computed for refused carries only”. |
| textFontWeight.test.mjs | 1 | LF-specific sanitizer regex does not match CRLF source. |
| watermarkMaskAnchor.test.mjs | 2 | LF-specific source regexes do not match CRLF source. |

The full suite is therefore **not green locally**, even though this change introduces no additional unit failures. Lint's 17 warnings also pre-date the change. The browser dev-server logs include existing hydration/color warnings; the test summaries, rather than warning output, determine the smoke results.

GitHub Actions remains the authoritative validator. It was not triggered because this is a bundle-only handoff. These results are local Windows evidence.

## What did not change

- No other page, route, shared section component, layout, canonical or image.
- No checkout logic or purchase/preview CTA destination, event/source value or flow.
- No editor, astronomy/rendering implementation, saved design or download implementation.
- No payments, entitlement, order, fulfilment, print pipeline, customer data or database code.
- No prices, catalog, SKUs, shipping settings, promo code or production configuration.
- No dependencies, tests, workflow, secrets, deployment or infrastructure configuration.
- No new page, AI imagery, review, testimonial or customer claim.
- No issue, push, PR, send, merge or deploy.

Build side effects were kept out of the commit: the generated merchant feed was saved externally then restored to its base bytes; Next's auto-generated untracked app-level `AGENTS.md` was left uncommitted and not deleted. Logs, browser screenshots, local test scripts and test output remain outside the committed diff.

## Bundle handoff

Application commit: `6c99ede0c50d6cd4bf7592473e81febebd0bc266`. Validation above applies to this exact application tree; the following commit adds only this report. The fresh clone had no Git author configured, so commits use the explicit local agent identity `Codex <codex@localhost>` rather than an invented owner identity.

Preflight branch-only full-history bundle: `C:\Users\ReuseTechBC\projects\te21-source-verified.bundle`. `git bundle verify` passed, reported complete history with no prerequisites, and listed only `refs/heads/fix/personalized-star-map-ctr`. A fresh local clone into `C:\Users\ReuseTechBC\projects\te21-preflight-testclone` **passed**, checked out `6c99ede0c50d6cd4bf7592473e81febebd0bc266`, and had a clean working tree.

The delivery bundle is **C:\Users\ReuseTechBC\projects\qte21.bundle**. It is created after committing this report, with the same single-ref command, then test-cloned again before return. Final commit identity, bundle SHA-256, final test-clone outcome and report path are recorded in **C:\Users\ReuseTechBC\projects\run-te21.out**. A failed final test-clone must not be shipped.

```powershell
git bundle create C:\Users\ReuseTechBC\projects\qte21.bundle refs/heads/fix/personalized-star-map-ctr
git bundle verify C:\Users\ReuseTechBC\projects\qte21.bundle
git bundle list-heads C:\Users\ReuseTechBC\projects\qte21.bundle
git clone --branch fix/personalized-star-map-ctr --single-branch C:\Users\ReuseTechBC\projects\qte21.bundle C:\Users\ReuseTechBC\projects\te21-final-testclone
```

No remote push or PR is part of this handoff. Jack owns the push/PR and review gate.

## Appendix: focused rendered-page harness

```javascript
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
const app = 'D:/projects/sm-te21/star-map-app-final';
const require = createRequire(`${app}/package.json`);
const { chromium } = require('@playwright/test');
const phase = process.env.TE21_PHASE || 'base';
const url = 'http://127.0.0.1:3019';
let server, browser, page, schemas, evidence;
before(async () => {
  server = spawn(process.execPath, [`${app}/node_modules/next/dist/bin/next`, 'start', '-H', '127.0.0.1', '-p', '3019'], { cwd: app, env: process.env, stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, 'isolated production server starts');
  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const response = await page.goto(`${url}/personalized-star-map`, { waitUntil: 'networkidle' });
  schemas = await page.locator('script[type="application/ld+json"]').evaluateAll(nodes => nodes.map(n => JSON.parse(n.textContent)));
  evidence = { status: response.status(), title: await page.title(), description: await page.locator('meta[name="description"]').getAttribute('content'), h1: await page.locator('h1').allTextContents(), hero: await page.locator('main header').innerText(), schemas };
  writeFileSync(`C:/Users/ReuseTechBC/projects/te21-${phase}-rendered.json`, JSON.stringify(evidence, null, 2));
}, { timeout: 120000 });
after(async () => { await browser?.close(); server?.kill(); });
test('page renders successfully with one H1', () => { assert.equal(evidence.status, 200); assert.equal(evidence.h1.length, 1); });
test('title, description and canonical render correctly', async () => {
  assert.equal(evidence.title, phase === 'base' ? 'Personalized Star Map Gift | StarMapCo' : 'Personalized Star Map Print or Digital Gift | StarMapCo');
  assert.equal(evidence.description, phase === 'base' ? 'Looking for a personalized star map gift? Capture any date and place with a free preview, then choose framed print, unframed print, or HD digital delivery.' : 'Preview your personalized star map free. Buy an HD digital gift to download and print, or order a framed or unframed print of your chosen date and place.');
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://starmapco.com/personalized-star-map');
});
test('Product and Breadcrumb JSON-LD remain present and valid', () => {
  const product = schemas.find(s => s['@type'] === 'Product');
  assert.equal(product.name, 'Personalized star map');
  assert.ok(product.offers.length > 0);
  for (const offer of product.offers) { assert.ok(Number(offer.price) > 0); assert.ok(new URL(offer.url)); }
  const crumbs = schemas.find(s => s['@type'] === 'BreadcrumbList' && s.itemListElement.at(-1).item?.['@id']?.endsWith('/personalized-star-map'));
  assert.ok(crumbs);
});
test('FAQ JSON-LD has six visible matching questions', async () => {
  const faq = schemas.find(s => s['@type'] === 'FAQPage');
  assert.equal(faq.mainEntity.length, 6);
  for (const item of faq.mainEntity) {
    const heading = page.getByRole('heading', { name: item.name, exact: true });
    assert.equal(await heading.count(), 1);
    if (phase === 'head') {
      const text = await heading.locator('..').locator('p').innerText();
      assert.equal(text.replace(/\s+/g, ' ').trim(), item.acceptedAnswer.text.replace(/\s+/g, ' ').trim());
    }
  }
});
test('existing hero purchase and preview destinations remain unchanged', async () => {
  const links = await page.locator('main header a[href*="/editor?"]').evaluateAll(nodes => nodes.map(n => ({ text: n.textContent, href: n.getAttribute('href') })));
  if (phase === 'base') writeFileSync('C:/Users/ReuseTechBC/projects/te21-base-cta.json', JSON.stringify(links));
  else assert.deepEqual(links, JSON.parse(readFileSync('C:/Users/ReuseTechBC/projects/te21-base-cta.json', 'utf8')));
  assert.equal(links.length, 3);
});
test('contextual discovery links resolve to existing local pages', async () => {
  for (const path of ['/star-map-generator', '/star-map-gift', '/star-map-poster', '/star-map-gift-formats']) {
    assert.equal((await fetch(`${url}${path}`)).status, 200);
    if (phase === 'head') assert.ok(await page.locator(`main header a[href="${path}"], main section p a[href="${path}"]`).count());
  }
});
test('desktop and mobile page fit viewport and have no instant claims', async () => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `C:/Users/ReuseTechBC/projects/te21-${phase}-${width}.png` });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  const text = await page.locator('main').innerText();
  assert.doesNotMatch(text, /\binstant\b/i);
  if (phase === 'head') {
    assert.equal(evidence.h1[0], 'Personalized Star Map Print or Digital Gift');
    assert.match(evidence.hero, /download and print/i);
    assert.match(evidence.hero, /free preview/i);
    assert.doesNotMatch(text, /immediately after checkout/i);
  }
});


```
