#!/usr/bin/env node
/**
 * Retry EasyPost pickup scheduling for Requested Pickups rows.
 *
 * Usage:
 *   set -a && source services/catalog-sync/.env.railway && set +a
 *   node scripts/schedule-pickup.mjs
 *   node scripts/schedule-pickup.mjs recXXXXXXXXXXXXXX
 */
import {
  listPickupsNeedingSchedule,
  schedulePickupRecord,
} from '../lib/order-sync/fulfillment-pickup.mjs';
import {SHIPPING_AUTOMATION} from '../lib/order-sync/config.js';

if (!process.env.AIRTABLE_PAT) {
  console.error('Set AIRTABLE_PAT');
  process.exit(1);
}

if (!SHIPPING_AUTOMATION.isEnabled()) {
  console.error(
    'Set ORDER_SYNC_SHIPPING_AUTOMATION_ENABLED=true before running pickup scheduling',
  );
  process.exit(1);
}

const pickupId = process.argv[2]?.trim();
const $ = {};

if (pickupId) {
  const result = await schedulePickupRecord(pickupId);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.action === 'scheduled' ? 0 : 1);
}

const pickups = await listPickupsNeedingSchedule($);
if (!pickups.length) {
  console.log('No pickups with Status = Requested');
  process.exit(0);
}

let failed = 0;
for (const pickup of pickups) {
  const result = await schedulePickupRecord(pickup.id);
  console.log(JSON.stringify({pickupId: pickup.id, ...result}, null, 2));
  if (result.action !== 'scheduled') failed += 1;
}

process.exit(failed > 0 ? 1 : 0);
