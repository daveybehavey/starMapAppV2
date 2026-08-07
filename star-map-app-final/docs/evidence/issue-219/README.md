# Issue #219 — ChatGPT product-discovery / direct-feed readiness (read-only)

## Parent

- Issue: #219
- Lane: read-only research/audit (no provider, production, pricing, checkout, ads, Cloudflare, Stripe, Printful, or feed mutations)
- Researched: 2026-08-07
- Primary platform evidence: official OpenAI documentation
- Secondary evidence: repository + public live probes of `https://starmapco.com`

## Delivery note

The Cloud Agent GitHub App token could **read** #219 but returned `403 Resource not accessible by integration` on `addComment` / `updateIssueComment`. This documentation-only artifact + draft PR is the delivery vehicle so the required evidence table is reviewable. Owner may paste the summary onto #219.

## Verdict

ChatGPT **Search crawl** readiness is already broadly compatible. The gated unlock for a measurable **product-discovery** channel is **owner application** to OpenAI merchant product feeds at [chatgpt.com/merchants](https://chatgpt.com/merchants). Instant Checkout / ACP checkout is a separate approval track and is **not** justified yet.

## Official sources used

| Source | URL |
| --- | --- |
| OpenAI crawlers (OAI-SearchBot) | https://developers.openai.com/api/docs/bots |
| OAI-SearchBot IP ranges | https://openai.com/searchbot.json |
| Commerce get started (partner gate) | https://developers.openai.com/commerce/guides/get-started |
| Product feed / Google-compatible path | https://developers.openai.com/commerce/specs/feed |
| Agentic Checkout Spec | https://developers.openai.com/commerce/specs/checkout |
| Agentic commerce in production | https://developers.openai.com/commerce/guides/production |
| Merchant apply form | https://chatgpt.com/merchants |

## Evidence table

| Area | Evidence | Gap class |
| --- | --- | --- |
| Paid `chatgpt.com` signal | Issue cites Stripe 30d window: 4 paid digital orders, 2 with `marketing_source=chatgpt.com`. Proves commercial reality of the source; **does not** prove all ChatGPT sessions are human. | already compatible (attribution signal) |
| `robots.ts` / live `robots.txt` | Single `User-Agent: *` with `Allow: /`; no `Disallow` of `OAI-SearchBot`. Live matches repo (`star-map-app-final/src/app/robots.ts`). Official guidance: allow `OAI-SearchBot` for Search. Wildcard allow covers it; no explicit `OAI-SearchBot` group. | already compatible (crawl allow) |
| `/editor` robots disallow | `/editor` is disallowed (intentional). Feed item `print_poster_framed_hd_bundle` and several Product `Offer.url`s point at `/editor?...`. OAI-SearchBot should not index those URLs; PDPs like `/star-map-poster` remain allowed. | trivial repository-only adaptation *(hygiene only; not the channel unlock)* |
| Cloudflare / bot protection | Live probes with official OAI-SearchBot UA → **HTTP 200** for `/`, `/star-map-poster`, `/personalized-star-map`, `/hd-star-map`, `/merchant-feed.xml`, `/robots.txt`. `server: cloudflare` present; no challenge page observed in this probe. Repo has no CF bot-rule config to audit. Residual risk: CF could still block OpenAI published IP ranges without a robots change — cannot verify CF dashboard from repo/public alone. | already compatible *(public probe)* / residual unknown *(CF config)* |
| Merchant feed live inventory | `https://starmapco.com/merchant-feed.xml` → **3 items**: `print_poster_unframed`, `print_poster_framed`, `print_poster_framed_hd_bundle`. Digital SKU off by default (`MERCHANT_FEED_INCLUDE_DIGITAL`). Fields present: `id`, `title`, `description`, `link`, `image_link`, `additional_image_link`, `availability=in_stock`, `condition=new`, `price`+USD, `brand=StarMapCo`, `identifier_exists=no`, `product_type`, `google_product_category`, per-country `shipping` + handling/transit for **US, CA, GB, IE, AU, NZ**. Images HTTP 200. Generator: `scripts/generate-merchant-feed.mjs`. | already compatible *(Google Merchant core data)* |
| OpenAI Google-compatible upload format | Official feed docs: Google-compatible path accepts **UTF-8 TSV/CSV** (incl. `.gz`); **JSON/XML/RSS/Atom are not supported** on that path; `g:` XML names not supported. Current public artifact is **RSS/`g:` XML**. | trivial repository-only adaptation *(TSV/CSV export from existing generator — only valuable after merchant access)* |
| OpenAI native required extras (non-Ads) | Native schema also expects flags like `is_eligible_search` / `is_eligible_checkout`, plus merchant/return/geo fields (`seller_name`, `seller_url`, `return_policy`, `target_countries`, `store_country`, etc.). Policy pages already exist publicly: `/returns`, `/shipping`, `/privacy`, `/terms`, `/support`. Docs also note: for accepted products OpenAI **enables search and disables checkout** on the Google-compatible path. | trivial repository-only adaptation *(map existing pages/data)* after access |
| Product / Offer structured data | Live `/star-map-poster` emits Product+Offer JSON-LD (name, brand, images, price, currency, `InStock`, Offer URLs). Repo also emits Product schema on home + occasion landings (`ProductSchema`, home `@graph`). Canonicals present on sellable landings. Missing merchant-return / shippingDetails schema extensions — optional for OpenAI feed path. | already compatible *(public product facts)* |
| Direct product-feed onboarding | Official Get Started: **“Onboarding product feeds in ChatGPT is currently available to approved partners”** → apply at [chatgpt.com/merchants](https://chatgpt.com/merchants). | requires owner/provider application/access |
| Instant Checkout / ACP | Checkout + production guides require approved Instant Checkout participation, merchant checkout endpoints, webhooks, payment tokenization, certification. High cost/risk vs current digital SKU mix; docs separate this from feed discovery. | not justified yet |
| `llms.txt` / speculative GEO | `llms.txt` already exists live with product/pricing facts. Official OpenAI Search/commerce docs do **not** treat `llms.txt` as a product-discovery or feed mechanism. | not justified yet *(no speculative GEO work)* |
| OpenAI Ads | Out of scope; would need Ads eligibility + separate feed rules. | not justified yet |

## Gap summary

1. **Crawl/Search baseline:** Allowed and publicly reachable under OAI-SearchBot UA.
2. **Catalog data:** Strong Google-style core fields already generated; format must become delimited TSV/CSV for OpenAI upload compatibility.
3. **Hard gate:** Merchant product-feed **partner approval** — no upload/indexing of a direct feed without it.
4. **Checkout-in-ChatGPT:** Separate high-risk track — defer.
5. **No conclusive tiny repo fix** that unlocks the channel without owner application → **no implementation child issue** from this research lane. After access is granted, a follow-up issue to emit OpenAI-compatible TSV (+ seller/return/geo columns) from `generate-merchant-feed.mjs` would be appropriate.

## Recommended next action (one)

**Owner: submit the ChatGPT merchant product-feed application at [https://chatgpt.com/merchants](https://chatgpt.com/merchants)** for catalog discovery (`is_eligible_search` path; expect checkout disabled until/unless Instant Checkout is separately approved).

- Expected qualified-buyer impact: high relative to other options (turns proven `chatgpt.com` paid signal into an indexed product surface).
- Evidence confidence: high (official onboarding gate).
- Cost/risk: owner form only; **no** production, pricing, Cloudflare, Stripe, Printful, ads, or checkout changes.

Do **not** start Instant Checkout, Ads, Cloudflare bot-rule changes, feed submission, or `llms.txt` expansion until that application yields access (or a documented rejection).

## Live probe commands (non-mutating)

```bash
curl -sL https://starmapco.com/robots.txt
curl -sI -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot' https://starmapco.com/
curl -sL https://starmapco.com/merchant-feed.xml | grep -o '<g:id>[^<]*</g:id>'
```
