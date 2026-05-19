# Store branding assets

- **`source-icon.png`** — Master square logo (replace this file to re-run generation).
- **`generated/`** — Outputs from `npm run generate:brand-assets`.

## Play Console uploads

| File | Use |
|------|-----|
| `generated/play-store-icon-512.png` | High-res icon (512×512) |
| `generated/play-store-icon-1024.png` | Optional / some flows ask for 1024 |
| `generated/play-feature-graphic-1024x500.png` | **Vector-only** store banner (typography + abstract constellation; no pasted logo) |

Square Play icons still use letterboxing with app background `#060b14` to match splash.

## Favicon / web

| File | Use |
|------|-----|
| `generated/favicon.png` | 32×32; can replace `assets/favicon.png` for Expo web |
| `generated/favicon-16.png`, `favicon-32.png`, `favicon-48.png` | Classic HTML `<link rel="icon">` sizes |

## Expo app icon in builds (optional)

To ship this art as the **installed app icon**, copy or point `app.config.ts` at:

- `generated/expo-icon-1024.png` → `assets/icon.png` (after resizing if you prefer exact Expo defaults), or  
- `generated/expo-adaptive-foreground-1024.png` → `assets/adaptive-icon.png` (foreground only; background stays `#060b14` in config).

Regenerate icons, then run a new EAS build.
