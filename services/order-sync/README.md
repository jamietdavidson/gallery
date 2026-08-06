# Order sync (Railway)

Polling-only worker: pulls recent Shopify orders into Airtable, then watches **Fullfillments** and **Pickups** for label purchase, pickup linking, and carrier scheduling. No inbound webhooks.

**Shipping automation is disabled by default.** Set `ORDER_SYNC_SHIPPING_AUTOMATION_ENABLED=true` to run label purchase, pickup linking, carrier scheduling, and pickup confirmation from Airtable status changes.

## HTTP surface

| Method | Path      | Description                 |
| ------ | --------- | --------------------------- |
| `GET`  | `/health` | Railway liveness check only |

There are no public webhook endpoints. Remove the Railway public domain if you do not need external health checks.

## Flow (all via polling)

1. **Shopify orders** — every 10 minutes on the clock (:00, :10, :20, … in shop timezone), fetch orders updated in the last `ORDER_POLL_LOOKBACK_HOURS` (default 48h) → create/update **Orders** + **Fullfillments** rows.
2. **In Progress** — buy EasyPost parcel label via the standard API → **Shipping: Label** + Shopify `fulfillmentCreate` tracking. Museum-tier can optionally use Enterprise LTL when enabled.
3. **Pickup Requested** — link fulfillment to next **Pickups** row (**Pending**).
4. **Pickups → Requested** — EasyPost schedules carrier pickup → **Scheduled**.
5. After the pickup window passes → **Confirmed**.

Labels are **not** purchased at checkout time.

## Environment variables

| Variable                                 | Required         | Description                                                                                                   |
| ---------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| `AIRTABLE_PAT`                           | yes              | Airtable personal access token (write access to Orders, Fullfillments, and Pickups)                           |
| `EASYPOST_API_KEY`                       | for labels       | EasyPost API key (`EZTK…` test, `EZAK…` production)                                                           |
| `EASYPOST_ENTERPRISE_API_KEY`            | for Museum/LTL   | EasyPost Enterprise / GlobalShip API key (contact EasyPost sales)                                             |
| `EASYPOST_ENTERPRISE_ENABLED`            | no               | Set `true` to route Museum-tier shipments via Enterprise LTL (default off — standard parcel API otherwise)    |
| `EASYPOST_ENTERPRISE_API_BASE`           | no               | Enterprise API base URL if EasyPost provides a custom host (default `https://api.easypost.com/v2`)            |
| `EASYPOST_FREIGHT_SIZE_TIERS`            | no               | Comma-separated size tiers that route to Enterprise LTL (default `Museum`)                                    |
| `EASYPOST_FREIGHT_CLASS`                 | no               | NMFC freight class for LTL quotes (default `70`)                                                              |
| `SHOPIFY_ACCESS_TOKEN`                   | for Shopify sync | Static Admin token (`shpat_…`) or use client credentials below                                                |
| `SHOPIFY_CLIENT_ID`                      | for Shopify sync | App client ID — with `SHOPIFY_CLIENT_SECRET`, tokens auto-refresh every 24h                                   |
| `SHOPIFY_CLIENT_SECRET`                  | for Shopify sync | App client secret from `shopify app env show`                                                                 |
| `ORDER_SYNC_POLL_INTERVAL_MS`            | no               | Poll interval (default `600000` = 10 minutes, min `60000`)                                                    |
| `ORDER_SYNC_POLL_ALIGN_CLOCK`            | no               | Align polls to wall-clock marks (default `true`; set `false` for fixed delay from each tick)                  |
| `ORDER_SYNC_POLL_TIMEZONE`               | no               | Timezone for clock alignment (default `America/Vancouver`, or `PICKUP_SCHEDULE_TIMEZONE`)                     |
| `ORDER_SYNC_SHIPPING_AUTOMATION_ENABLED` | no               | Set `true` to run automatic labels, pickup linking, carrier scheduling, and pickup confirmation (default off) |
| `ORDER_POLL_LOOKBACK_HOURS`              | no               | How far back to scan Shopify orders each tick (default `48`)                                                  |
| `FULFILLMENT_POLL_INTERVAL_MS`           | no               | Legacy alias for `ORDER_SYNC_POLL_INTERVAL_MS`                                                                |
| `EASYPOST_FROM_*`                        | no               | Ship-from / pickup address (defaults to The Print Lab, 3370 Tennyson Ave, Victoria)                           |
| `EASYPOST_PREFERRED_CARRIERS`            | no               | Pickup-capable carriers only (default `CanadaPost,UPS,FedExDefault`)                                          |
| `EASYPOST_OVERSIZED_CARRIERS`            | no               | Oversized pickup-capable carriers (default `UPS,FedExDefault`)                                                |
| `EASYPOST_CHECKOUT_CARRIER_MAP`          | no               | Checkout shipping line → carrier map                                                                          |
| `AIRTABLE_PICKUPS_TABLE_ID`              | no               | Pickups table id (default `tbld2RYHB2XL9ELXA`)                                                                |
| `PICKUP_SCHEDULE_*`                      | no               | Pickup auto-create schedule (see `lib/order-sync/config.js`)                                                  |
| `SHOPIFY_SHOP_ID`                        | no               | Default `thelonglookco`                                                                                       |
| `SHOPIFY_GRAPHQL_VERSION`                | no               | Default `2026-07` (for `fulfillmentCreate`)                                                                   |
| `SHIPPING_PACKAGE_*`                     | no               | Fallback box dimensions/weight                                                                                |
| `PORT`                                   | no               | Set by Railway                                                                                                |

**Recommended:** set `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET` so access tokens refresh automatically.

## Airtable schema

Base `appC7O4qp56Rdaj7c`. Field names are in `lib/order-sync/config.js`.

| Table             | Role                                                        |
| ----------------- | ----------------------------------------------------------- |
| **Orders**        | One row per Shopify order                                   |
| **Fullfillments** | One row per physical unit                                   |
| **Pickups**       | **Pending** → **Requested** → **Scheduled** → **Confirmed** |

No Airtable automations need to call Railway — the poller watches status fields directly.

## Shopify app setup

1. Deploy updated app config (webhooks removed): `shopify app deploy --allow-updates --no-build`
2. Re-authorize if scopes changed (`read_orders`, `write_orders`, `write_merchant_managed_fulfillment_orders`)

## EasyPost Enterprise (optional, off by default)

Museum-tier fulfillments exceed Canada Post parcel limits. Enterprise LTL is **optional** and **disabled by default** — all tiers use the standard EasyPost parcel API unless you opt in.

To enable later:

1. Contact [EasyPost sales](https://www.easypost.com/talk-to-easypost) for Enterprise / GlobalShip + LTL carriers.
2. Set `EASYPOST_ENTERPRISE_ENABLED=true`, `EASYPOST_ENTERPRISE_API_KEY`, and optionally `EASYPOST_ENTERPRISE_API_BASE`.

Until then, leave `EASYPOST_ENTERPRISE_ENABLED` unset (or `false`). Museum labels will attempt standard parcel rating like every other tier.

## Local dev

```bash
AIRTABLE_PAT=pat… \
SHOPIFY_ACCESS_TOKEN=shpat_… \
EASYPOST_API_KEY=EZTK… \
node services/order-sync/server.mjs
```

## Deploy to Railway

1. Service: `order-sync`
2. Variables: `AIRTABLE_PAT`, `EASYPOST_API_KEY`, Shopify credentials
3. Optional: remove the public domain under **Networking** if you only want outbound polling (keep `/health` reachable for Railway deploy checks)
