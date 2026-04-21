# Merchant API Setup

Use this if you want Merchant Center shipping settings managed from the terminal instead of the GMC UI.

## Required pieces

1. A Google Cloud project
2. `Merchant API` enabled in that project
3. A service account in that project
4. That service account added to Merchant Center with admin access
5. Local credentials wired into the repo environment

## Recommended credential path

Use a service account key file outside the repo and point to it with:

```bash
GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH=/absolute/path/to/google-merchant-service-account.json
```

You can also use:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-merchant-service-account.json
```

Do not commit the JSON key into the repo.

## Required env

Add to `.env.local`:

```bash
GOOGLE_MERCHANT_ACCOUNT_ID=5702040685
GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON_PATH=/absolute/path/to/google-merchant-service-account.json
GOOGLE_MERCHANT_SHIPPING_SERVICE_PREFIX="StarMapCo Print"
```

## Merchant Center access

In Merchant Center:

1. Go to account access / users
2. Add the service account email
3. Grant admin access

The service account email will look like:

```text
merchant-api-admin@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

## Commands

Verify auth:

```bash
npm run merchant:api:verify
```

Generate the local shipping-service plan:

```bash
npm run merchant:shipping:plan
```

Fetch current shipping settings:

```bash
npm run merchant:shipping:get
```

Preview the payload that would be applied:

```bash
npm run merchant:shipping:preview
```

Apply generated shipping services while preserving unmanaged existing services:

```bash
npm run merchant:shipping:apply
```

Apply generated shipping services and replace all existing services:

```bash
npm run merchant:shipping:apply -- --replace-all-services
```

## Shipping model used by the scripts

The feed is split by shipping label:

- `print_framed`
- `print_unframed`

That is required because framed and unframed physical products have different country-level shipping rates.

The scripts group countries by:

- variant
- flat shipping price
- delivery-day range

Then generate Merchant shipping services from those groups.

## Reports

The scripts write reports under `reports/`:

- `merchant-shipping-plan.json`
- `merchant-shipping-settings.current.json`
- `merchant-shipping-settings.preview.json`
- `merchant-shipping-settings.applied.json`

Product and program status (see `docs/merchant-center-fix-playbook.md`, section 8, for PASS/WARN/FAIL meaning):

```bash
npm run merchant:products:status
```

- `merchant-products-status.json`
