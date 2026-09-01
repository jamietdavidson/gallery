# Catalog sync (Railway)

Replaces Pipedream for **Airtable → Shopify** print catalog sync. Core logic lives in `lib/catalog-sync/`.

**Railway project:** [the-long-look catalog sync](https://railway.com/project/b3ab32a9-416f-48f6-ad0b-10b92ec53e47)

## How it works

The service **polls** Airtable on an interval (default 60s, starting immediately after each tick completes). Records with Status **Queued** are marked **Processing** before Shopify updates, then **Committed** when done. Each tick: variant sync → artists/collections → prints. Orphan pruning runs on a separate interval (default 5 minutes).

Queued **variants** update shipping packages and push the catalog (prices, dimensions, new Size/Frame/Mount combinations) to every Fine Art Print product in parallel (`SYNC_CONCURRENCY`, default 5). Print sync uses only **Committed** variant rows.

On each deletion pass, the service compares Airtable rows to Shopify entities and removes orphans: print products (by record id or handle), artist/collection metaobjects (by record id, slugified name, or stable handle), matching native Shopify collections (by `airtable.record_id`), and product variants (by `airtable.record_id` or Size/Frame/Mount).

**Storefront vs Admin:** Collection pages on the site read **collection metaobjects** only. Catalog sync also mirrors each editorial collection to a native Shopify collection (same handle, `airtable.record_id` metafield) and keeps print membership in sync. A smart **Fine Art Prints** collection (`product_type` rule) is created automatically for Shopify Admin merchandising.

## Endpoints

| Method | Path      | Description                            |
| ------ | --------- | -------------------------------------- |
| `GET`  | `/health` | Liveness check + current poll interval |

Optional manual sync (for debugging): `POST /sync/:recordId` — set `SYNC_SECRET` and pass `Authorization: Bearer <secret>`.

## Environment variables

| Variable                               | Required | Description                                                           |
| -------------------------------------- | -------- | --------------------------------------------------------------------- |
| `AIRTABLE_PAT`                         | yes      | Airtable personal access token                                        |
| `SHOPIFY_ACCESS_TOKEN`                 | yes      | Shopify Admin API token (`shpat_…`) for `thelonglookco`               |
| `POLL_INTERVAL_MS`                     | no       | Default `60000` (1 minute). Minimum `60000`.                          |
| `SYNC_CONCURRENCY`                     | no       | Parallel Shopify/Airtable ops per job (default `5`, max `20`).        |
| `DELETION_POLL_INTERVAL_MS`            | no       | How often to run orphan pruning (default `300000` / 5 min).           |
| `SHOPIFY_SHOP_ID`                      | no       | Default `thelonglookco`                                               |
| `SYNC_SECRET`                          | no       | Optional auth for manual `POST /sync/…` only                          |
| `PRINT_IMAGE_MAX_PX`                   | no       | Long-edge cap before WebP encode (default `2400`)                     |
| `PRINT_IMAGE_WEBP_QUALITY`             | no       | WebP quality 1–100 (default `82`)                                     |
| `PORT`                                 | no       | Set by Railway                                                        |
| `SHOPIFY_ALL_PRINTS_COLLECTION_HANDLE` | no       | Smart collection handle for all prints (default `fine-art-prints`)    |
| `SHOPIFY_ALL_PRINTS_COLLECTION_TITLE`  | no       | Title for the all-prints smart collection (default `Fine Art Prints`) |

Print images are downloaded from Airtable, resized, encoded as WebP, and uploaded to Shopify via staged upload. Re-sync skips image processing when the Airtable attachment id is unchanged (`print.picture_source_id` metafield).

Artist **Headshot** attachments sync to the `portrait` field on artist metaobjects (same WebP pipeline). Add an optional `portrait_source_id` single-line text field on the artist metaobject definition to skip re-uploads when the headshot is unchanged.

### Shipping packages (box dimensions)

Shopify **does not show package GIDs** in Admin, and the public Admin API has **no query to list packages** — only `shippingPackageUpdate` / `shippingPackageDelete` / `shippingPackageMakeDefault` (which require a GID you already have).

**Variant weights** sync from Airtable `Predicted Weight (lb)` without package IDs. To also sync **box dimensions** and link variants to packages:

1. In Shopify Admin, open **Settings → Shipping and delivery → Packages**
2. Open browser **DevTools → Network**, filter `graphql` or `Fetch`
3. Refresh the page or click a package — find a response containing your package names (`Small`, `Medium`, …) and `gid://shopify/ShippingPackage/…`
4. Copy that JSON response and run:

```bash
pbpaste | node services/catalog-sync/bootstrap-shipping-packages.mjs --stdin
```

Or pass a manual map:

```bash
node services/catalog-sync/bootstrap-shipping-packages.mjs --ids '{
  "small": "gid://shopify/ShippingPackage/…",
  "medium": "gid://shopify/ShippingPackage/…"
}'
```

One-off weight push (no package IDs needed):

```bash
node services/catalog-sync/sync-shipping.mjs
```

## Deploy to Railway

1. Log in: `railway login`
2. Link project: `railway link -p b3ab32a9-416f-48f6-ad0b-10b92ec53e47`
3. Set variables:

```bash
railway variable set AIRTABLE_PAT=pat… \
  SHOPIFY_ACCESS_TOKEN=shpat_… \
  POLL_INTERVAL_MS=60000
```

4. Deploy from repo root: `railway up`
5. **Networking → Generate Domain** (only needed for `/health` monitoring)

### Railway dashboard

1. [Open project](https://railway.com/project/b3ab32a9-416f-48f6-ad0b-10b92ec53e47) → connect `jamietdavidson/the-long-look`
2. Variables: `AIRTABLE_PAT`, `SHOPIFY_ACCESS_TOKEN`, `POLL_INTERVAL_MS=60000`
3. Deploy from `main`

## Local dev

```bash
AIRTABLE_PAT=pat… \
SHOPIFY_ACCESS_TOKEN=shpat_… \
POLL_INTERVAL_MS=60000 \
node services/catalog-sync/server.mjs
```

```bash
curl http://localhost:3000/health
```

## Docker

```bash
docker build -f services/catalog-sync/Dockerfile -t catalog-sync .
docker run --rm -p 3000:3000 \
  -e AIRTABLE_PAT=pat… \
  -e SHOPIFY_ACCESS_TOKEN=shpat_… \
  -e POLL_INTERVAL_MS=60000 \
  catalog-sync
```
