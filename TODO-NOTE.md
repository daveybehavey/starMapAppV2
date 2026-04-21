## Homepage promo CTA UTMs + data attributes

- Added shared UTM and editor `source` values in `src/lib/homepagePromoCapture.ts`. The subscribe API appends them to `/editor` redirects when the form `source` is a homepage promo inline signup (including legacy `promotion_signup_static` and `homepage_static_signup`).
- Inline signup uses stable hooks: `data-promo-capture="homepage"`, `data-promo-slot="inline_signup"`, `data-promo-cta="inline_submit"`. The KV `lastSource` field for new submissions is now `homepage_promo_inline` (replacing `promotion_signup_static` on the Next.js form).
- Static `public/index.html` / `public/landing.html` signup blocks were aligned to the same `source` and `data-*` values for parity with `check:static-home`.
