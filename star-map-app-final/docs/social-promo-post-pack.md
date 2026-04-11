# Social Promo Post Pack

Use this after the promo codes are live and before spending on paid distribution.

This pack turns the promo rollout into something executable:

- exact post angles
- exact landing URLs
- channel order
- rule-safe Reddit usage
- logging rules

Before using any of these links publicly, run:

```bash
npm run qa:promo-links
```

## Live offers

1. `PRINT10`
- `10% off` print only
- use in Google Merchant Center only

2. `REDDIT50`
- `50% off` single HD digital
- use only where a direct offer is allowed

3. `TIKTOK50`
- `50% off` single HD digital
- use on TikTok / Instagram-style short-form posts

## Recommended posting order

1. `TikTok / Reels`
- easiest fit for a direct offer
- use `TIKTOK50`

2. `Pinterest`
- use the same creative framing as TikTok, but do not lead with coupon language in the pin title
- use the TikTok landing URL or a Pinterest-specific variant later

3. `Reddit`
- use `REDDIT50` only in threads or communities that allow it
- do not lead with coupon-first copy in standalone posts

4. `Founder / build-in-public communities`
- use the story angle, not the hard-sell angle
- these are better for feedback and curiosity than direct buyer volume

## Landing URLs

### TikTok / Reels

`https://starmapco.com/editor?mode=quick&code=TIKTOK50&utm_source=tiktok&utm_medium=organic_promo&utm_campaign=apr2026_digital_offer&utm_content=tiktok_offer_01`

### Reddit

`https://starmapco.com/editor?mode=quick&code=REDDIT50&utm_source=reddit&utm_medium=organic_promo&utm_campaign=apr2026_digital_offer&utm_content=reddit_offer_01`

## TikTok / Reels posts

### Post 1: Hard part is done

Use first.

**Hook / on-screen text**

`If you already know the date, the hard part of the gift is done.`

**Shot list**

1. type a meaningful date
2. drop in a city/location
3. show the map render
4. show the personalized text
5. show the saved offer banner or final CTA

**Caption**

`If you already know the date, the hard part is done. Use the moment that changed everything and turn it into a gift that actually feels personal. Use code TIKTOK50 for 50% off the HD digital version.`

**CTA**

`Open the editor and start with the date.`

### Post 2: Last-minute gift

Use when you want a more direct buyer angle.

**Hook / on-screen text**

`Last-minute gift. Still personal.`

**Caption**

`Still need a gift but do not want it to feel rushed? Start with the exact night sky from a date that matters. Code TIKTOK50 gives you 50% off the HD digital version right now.`

**CTA**

`Start with the date and place that matter most.`

### Post 3: Mother's Day

Use as soon as you start Mother’s Day content.

**Hook / on-screen text**

`Give mom the sky from the day she became a mom.`

**Caption**

`A stronger Mother’s Day gift starts with a real moment. Use the birth date or the day your family changed. Code TIKTOK50 gives you 50% off the HD digital version.`

**CTA**

`Preview the moment first.`

## Reddit posts

### Default rule

Do not post a coupon link into random subreddits.

Use Reddit in one of three ways:

1. deal / promo thread where allowed
2. story-led standalone post where self-promo is allowed
3. founder/build-in-public post in founder communities

### Rule note already verified

`r/weddingplanning` currently directs discounts and deals into the `Daily Chat & Quick Questions` thread rather than standalone posts.

### Reddit thread version

Use this only where direct offers are allowed.

`If anyone here is looking for a more personal gift angle, I run StarMapCo and we make custom star maps from a real date and location. I set up a small Reddit offer for early users: REDDIT50 for 50% off the single HD digital version. Start with the date that matters most: https://starmapco.com/editor?mode=quick&code=REDDIT50&utm_source=reddit&utm_medium=organic_promo&utm_campaign=apr2026_digital_offer&utm_content=reddit_offer_01`

### Reddit story-led version

Use this in communities that allow brand sharing but punish obvious ad copy.

**Title**

`A simple gift idea that works better when you already know the exact date`

**Body**

`One thing I have learned building StarMapCo is that the date usually matters more than the design. The night you met, the proposal, the wedding, a birth, or another date that still means something every time you think about it. If anyone wants to try the editor, I set up a small Reddit code for early users: REDDIT50.`

### Founder / build-in-public version

Use in founder communities, not gift-buyer communities.

**Title**

`I turned our gift product into a measurable promo test instead of another vague "brand awareness" push`

**Body**

`I run StarMapCo, a custom star map product. Instead of spraying one generic discount everywhere, I split the first promo pass by channel: a print code for Merchant Center and separate digital codes for Reddit and TikTok. Cleaner attribution, cleaner offer fit, and less confusion at checkout. If anyone wants to see the product side, I can share the editor link.`

## Best communities to inspect first

### Consumer

1. `r/weddingplanning`
2. `r/Gifts`
3. `r/LongDistance`
4. `r/Mommit`
5. `r/NewParents`

### Founder / distribution

1. `r/SideProject`
2. `r/smallbusiness`
3. `r/Entrepreneur`

## Logging rules

Every post should be logged in:

1. `docs/social-content-tracker.csv`
2. `docs/promo-offer-tracker.csv`

Track at minimum:

- date posted
- platform
- post ID or link
- code used
- views
- link clicks
- preview starts
- checkout starts
- purchases

## Success threshold

Do not scale anything paid until one of these happens:

1. one post drives at least `3+` preview starts
2. one post drives at least `1` real checkout start
3. one channel clearly outperforms the others on clicks or previews

## Guardrails

1. do not use `PRINT10` in social posts
2. do not use `REDDIT50` in communities that ban self-promo
3. do not lead with the code before the story on TikTok / Reels
4. do not post the same copy everywhere without adapting it
5. do not spend paid budget until one organic frame looks alive
