# Sitemap Health Check

Checks every URL in your sitemap and fails when any of these are true:

- URL returns non-2xx
- sitemap includes parameterized URLs (`?foo=bar`)
- canonical tag is missing or does not match the sitemap URL
- page is in sitemap but has `noindex` in robots meta / `x-robots-tag`

## Run locally

```bash
npm run qa:sitemap-health
```

Custom sitemap URL:

```bash
npm run qa:sitemap-health -- --sitemap https://starmapco.com/sitemap.xml
```

Strict mode (also fail on redirects):

```bash
npm run qa:sitemap-health -- --fail-on-redirect
```

Skip on-page canonical/robots checks (response status only):

```bash
npm run qa:sitemap-health -- --skip-onpage
```

## CI

GitHub Actions workflow:

- `.github/workflows/sitemap-health.yml`

It runs daily and can also be launched manually from the Actions tab.
