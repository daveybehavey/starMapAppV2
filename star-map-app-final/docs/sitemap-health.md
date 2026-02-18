# Sitemap Health Check

Checks every URL in your sitemap and fails on any non-2xx response.

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

## CI

GitHub Actions workflow:

- `.github/workflows/sitemap-health.yml`

It runs daily and can also be launched manually from the Actions tab.
