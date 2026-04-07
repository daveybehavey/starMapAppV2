# Testimonial Intake Template

Use this format before adding anything to [`src/data/testimonials.ts`](/home/davidheslop/starMap/star-map-app-final/src/data/testimonials.ts).

Only publish testimonials that meet all of these:

- real buyer
- explicit permission to publish
- clear occasion or use case
- no medical, legal, or misleading claims
- no unverifiable star-rating claims unless they came from a real review source

## Required fields

- `quote`
- `author`
- `context`

## Recommended structure

```text
Quote:
Author:
Context:
Permission:
Source:
Photo approved:
Photo path:
Photo alt text:
Photo note:
Approved example link:
```

## Example

```text
Quote: The framed print looked better in person than on the preview, and it arrived in time for our anniversary dinner.
Author: Sarah K.
Context: Anniversary gift, framed print
Permission: Approved by email on 2026-03-12
Source: Post-purchase email reply
Photo approved: Yes
Photo path: public/testimonials/sarah-k-anniversary.jpg
Photo alt text: Framed StarMapCo anniversary print displayed on a living-room shelf
Photo note: Buyer photo, used with permission
Approved example link: /m/12345678-abcd-1234-abcd-1234567890ab
```

## Publish rule

After a testimonial is approved:

1. Add the quote to `src/data/testimonials.ts`
2. Add the buyer photo only if written approval includes image usage
3. If a photo is approved, set `imageSrc`, `imageAlt`, and optional `imageNote`
4. If website-review consent covers the exact saved map, you can optionally add `exampleHref` (usually `/m/<mapId>`) and optional `exampleLabel`
5. Keep context concrete: occasion + product format
6. Avoid editing the buyer's meaning for polish
