import {AIRTABLE, PICKUP_SCHEDULE, SHIPPING} from './config.js';
import {
  airtableRequest,
  getFulfillmentRecordsByIds,
  getFulfillmentRecord,
  getPickupRecord,
  listFulfillmentsForPickup,
  updateFulfillmentRecord,
} from './airtable.mjs';
import {scheduleEasypostCarrierPickup} from './easypost-pickup.mjs';
import {
  computeNextPickupSlot,
  formatPickupName,
  parseAirtableDate,
  pickupSlotKey,
} from './pickup-schedule.mjs';
import {shippingAutomationSkipped} from './shipping-automation.mjs';

function pickupsTablePath() {
  return `/${AIRTABLE.baseId}/${AIRTABLE.pickupsTableId}`;
}

function isPickupClosed(record) {
  const pf = AIRTABLE.pickupFields;
  const status = record?.fields?.[pf.status];
  return status === AIRTABLE.pickupStatus.confirmed;
}

function sortPickupsByWhen(records) {
  const pf = AIRTABLE.pickupFields;
  return [...records].sort((left, right) => {
    const leftAt =
      parseAirtableDate(left.fields?.[pf.when])?.getTime() ?? Infinity;
    const rightAt =
      parseAirtableDate(right.fields?.[pf.when])?.getTime() ?? Infinity;
    return leftAt - rightAt;
  });
}

/** Open pickup rows with a future scheduled time. */
export async function listUpcomingPickups($) {
  const pf = AIRTABLE.pickupFields;
  const formula = `AND(IS_AFTER({${pf.when}}, NOW()), {${pf.status}} != "${AIRTABLE.pickupStatus.confirmed}")`;
  const params = new URLSearchParams({
    filterByFormula: formula,
    pageSize: '100',
  });

  const records = [];
  let offset = null;

  do {
    if (offset) params.set('offset', offset);
    const response = await airtableRequest($, {
      path: `${pickupsTablePath()}?${params}`,
    });
    records.push(...(response.records ?? []));
    offset = response.offset ?? null;
  } while (offset);

  return sortPickupsByWhen(records).filter((record) => !isPickupClosed(record));
}

export async function findPickupBySlotKey($, slotKey) {
  const upcoming = await listUpcomingPickups($);
  for (const record of upcoming) {
    const when = parseAirtableDate(record.fields?.[AIRTABLE.pickupFields.when]);
    if (!when) continue;
    if (pickupSlotKey(when, PICKUP_SCHEDULE.timeZone) === slotKey) {
      return record;
    }
  }
  return null;
}

function pickupNotesContainEasypostPickup(notes) {
  return /easypost_pickup:/i.test(String(notes ?? ''));
}

function appendEasypostPickupNote(existingNotes, easypostPickup) {
  const base = stripScheduleErrorNotes(String(existingNotes ?? '').trim());
  const lines = [
    base,
    `easypost_pickup:${easypostPickup.easypostPickupId}`,
    easypostPickup.confirmation
      ? `confirmation:${easypostPickup.confirmation}`
      : null,
    easypostPickup.carrier ? `carrier:${easypostPickup.carrier}` : null,
    easypostPickup.service ? `service:${easypostPickup.service}` : null,
    easypostPickup.skipped ? `note:${easypostPickup.reason}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function stripScheduleErrorNotes(notes) {
  return notes
    .split('\n')
    .filter((line) => !line.startsWith('schedule_error:'))
    .join('\n')
    .trim();
}

function appendScheduleErrorNote(existingNotes, error) {
  const base = stripScheduleErrorNotes(String(existingNotes ?? '').trim());
  const line = `schedule_error:${new Date().toISOString()}:${error}`;
  return [base, line].filter(Boolean).join('\n');
}

async function resolveLinkedFulfillments($, pickupRecordId, linkedIds) {
  const ids = [...new Set(linkedIds)].filter(Boolean);
  if (ids.length) {
    return getFulfillmentRecordsByIds($, ids);
  }

  return listFulfillmentsForPickup($, pickupRecordId);
}

async function updatePickupRecord($, pickupId, fields) {
  const response = await airtableRequest($, {
    method: 'patch',
    path: pickupsTablePath(),
    data: {records: [{id: pickupId, fields}]},
  });
  return response.records?.[0] ?? null;
}

export async function createPickupRecord($, when) {
  const pf = AIRTABLE.pickupFields;
  const fields = {
    [pf.when]: when.toISOString(),
    [pf.status]: AIRTABLE.pickupStatus.pending,
    [pf.notes]: formatPickupName(when, PICKUP_SCHEDULE.timeZone),
  };

  const response = await airtableRequest($, {
    method: 'post',
    path: pickupsTablePath(),
    data: {records: [{fields}]},
  });

  return response.records?.[0] ?? null;
}

/**
 * Return the earliest upcoming pickup, creating the next Tue/Fri afternoon slot if needed.
 */
export async function findOrCreateNextPickup($) {
  const upcoming = await listUpcomingPickups($);
  if (upcoming.length > 0) {
    return upcoming[0];
  }

  const slot = computeNextPickupSlot(new Date(), PICKUP_SCHEDULE);
  const slotKey = pickupSlotKey(slot, PICKUP_SCHEDULE.timeZone);
  const existing = await findPickupBySlotKey($, slotKey);
  if (existing) return existing;

  const created = await createPickupRecord($, slot);
  if (!created) {
    throw new Error('Failed to create Pickups row in Airtable');
  }
  return created;
}

function fulfillmentNeedsPickup(record) {
  const ff = AIRTABLE.fulfillmentFields;
  const fields = record?.fields ?? {};
  return (
    fields[ff.status] === AIRTABLE.fulfillmentStatus.pickupRequested &&
    !(Array.isArray(fields[ff.pickup]) && fields[ff.pickup].length > 0)
  );
}

/** Fulfillments ready to link to the next pickup (Status = Pickup Requested, no Pickup yet). */
export async function listFulfillmentsNeedingPickup($) {
  const ff = AIRTABLE.fulfillmentFields;
  const formula = `AND({${ff.status}} = "${AIRTABLE.fulfillmentStatus.pickupRequested}", {${ff.pickup}} = BLANK())`;
  const params = new URLSearchParams({
    filterByFormula: formula,
    pageSize: '100',
  });

  const records = [];
  let offset = null;

  do {
    if (offset) params.set('offset', offset);
    const response = await airtableRequest($, {
      path: `/${AIRTABLE.baseId}/${AIRTABLE.fulfillmentsTableId}?${params}`,
    });
    records.push(...(response.records ?? []));
    offset = response.offset ?? null;
  } while (offset);

  return records;
}

/** Pickup rows waiting for EasyPost carrier scheduling. */
export async function listPickupsNeedingSchedule($) {
  const pf = AIRTABLE.pickupFields;
  const formula = `{${pf.status}} = "${AIRTABLE.pickupStatus.requested}"`;
  const params = new URLSearchParams({
    filterByFormula: formula,
    pageSize: '100',
  });

  const records = [];
  let offset = null;

  do {
    if (offset) params.set('offset', offset);
    const response = await airtableRequest($, {
      path: `${pickupsTablePath()}?${params}`,
    });
    records.push(...(response.records ?? []));
    offset = response.offset ?? null;
  } while (offset);

  return sortPickupsByWhen(records);
}

/** Scheduled pickups whose window has passed — ready to mark Confirmed. */
export async function listPickupsReadyToConfirm($) {
  const pf = AIRTABLE.pickupFields;
  const formula = `AND({${pf.status}} = "${AIRTABLE.pickupStatus.scheduled}", IS_BEFORE({${pf.when}}, NOW()))`;
  const params = new URLSearchParams({
    filterByFormula: formula,
    pageSize: '100',
  });

  const records = [];
  let offset = null;

  do {
    if (offset) params.set('offset', offset);
    const response = await airtableRequest($, {
      path: `${pickupsTablePath()}?${params}`,
    });
    records.push(...(response.records ?? []));
    offset = response.offset ?? null;
  } while (offset);

  return records;
}

function labeledFulfillmentsForPickup(fulfillmentRecords) {
  const ff = AIRTABLE.fulfillmentFields;
  return fulfillmentRecords.filter((record) =>
    Boolean(record.fields?.[ff.shippingLabel]),
  );
}

/**
 * Link a fulfillment to the next upcoming pickup, creating that pickup if needed.
 * Pickup rows start as Pending; set the pickup to Requested to book the carrier.
 * @param {string} fulfillmentRecordId
 */
export async function linkFulfillmentToPickup(fulfillmentRecordId) {
  const disabled = shippingAutomationSkipped({fulfillmentRecordId});
  if (disabled) return disabled;

  const $ = {};
  const fulfillment = await getFulfillmentRecord($, fulfillmentRecordId);
  if (!fulfillment) {
    throw new Error(`Fulfillment record not found: ${fulfillmentRecordId}`);
  }

  if (!fulfillmentNeedsPickup(fulfillment)) {
    const ff = AIRTABLE.fulfillmentFields;
    const fields = fulfillment.fields ?? {};
    const linkedPickupId = fields[ff.pickup]?.[0] ?? null;
    return {
      action: 'skipped',
      fulfillmentRecordId,
      reason: linkedPickupId
        ? 'Fulfillment already linked to a pickup'
        : 'Fulfillment is not Pickup Requested',
      pickupRecordId: linkedPickupId,
    };
  }

  const pickup = await findOrCreateNextPickup($);
  const ff = AIRTABLE.fulfillmentFields;

  await updateFulfillmentRecord($, fulfillmentRecordId, {
    [ff.pickup]: [pickup.id],
  });

  const when = parseAirtableDate(pickup.fields?.[AIRTABLE.pickupFields.when]);

  return {
    action: 'linked',
    fulfillmentRecordId,
    pickupRecordId: pickup.id,
    pickupStatus: pickup.fields?.[AIRTABLE.pickupFields.status] ?? null,
    pickupLabel:
      pickup.fields?.[AIRTABLE.pickupFields.notes] ??
      formatPickupName(when, PICKUP_SCHEDULE.timeZone),
    scheduledAt: when?.toISOString() ?? null,
  };
}

/**
 * Book a carrier pickup in EasyPost when the Pickups row is Requested.
 * @param {string} pickupRecordId
 */
export async function schedulePickupRecord(pickupRecordId) {
  const disabled = shippingAutomationSkipped({pickupRecordId});
  if (disabled) return disabled;

  const $ = {};
  const pickup = await getPickupRecord($, pickupRecordId);
  if (!pickup) {
    throw new Error(`Pickup record not found: ${pickupRecordId}`);
  }

  const pf = AIRTABLE.pickupFields;
  const fields = pickup.fields ?? {};
  const status = fields[pf.status];

  if (status === AIRTABLE.pickupStatus.scheduled) {
    return {
      action: 'skipped',
      pickupRecordId,
      reason: 'Pickup is already scheduled',
    };
  }

  if (status !== AIRTABLE.pickupStatus.requested) {
    return {
      action: 'skipped',
      pickupRecordId,
      reason: `Pickup status must be Requested to schedule (current: "${status ?? 'unknown'}")`,
    };
  }

  if (pickupNotesContainEasypostPickup(fields[pf.notes])) {
    await updatePickupRecord($, pickupRecordId, {
      [pf.status]: AIRTABLE.pickupStatus.scheduled,
    });
    return {
      action: 'skipped',
      pickupRecordId,
      reason: 'EasyPost pickup already recorded on this row — marked Scheduled',
    };
  }

  const when = parseAirtableDate(fields[pf.when]);
  if (!when) {
    return {
      action: 'failed',
      pickupRecordId,
      error: 'Pickup row is missing a When date',
    };
  }

  const linkedIds = fields[pf.fulfillments] ?? [];
  const fulfillments = await resolveLinkedFulfillments(
    $,
    pickupRecordId,
    linkedIds,
  );
  const labeled = labeledFulfillmentsForPickup(fulfillments);

  if (!labeled.length) {
    const error =
      fulfillments.length > 0
        ? 'Linked fulfillments are missing shipping labels — set them to In Progress first'
        : 'No fulfillments are linked to this pickup row';
    await updatePickupRecord($, pickupRecordId, {
      [pf.notes]: appendScheduleErrorNote(fields[pf.notes], error),
    });
    return {
      action: 'failed',
      pickupRecordId,
      error,
    };
  }

  if (!SHIPPING.isConfigured()) {
    return {
      action: 'skipped',
      pickupRecordId,
      reason: 'EasyPost is not configured (set EASYPOST_API_KEY)',
    };
  }

  const easypostResults = [];
  for (const fulfillment of labeled) {
    easypostResults.push({
      fulfillmentRecordId: fulfillment.id,
      result: await scheduleEasypostCarrierPickup({
        fulfillmentRecordId: fulfillment.id,
        scheduledAt: when,
        pickupReference: `pickup-${pickupRecordId}-${fulfillment.id}`,
      }),
    });
  }

  const scheduled = easypostResults.filter(
    (entry) => entry.result?.action === 'scheduled',
  );
  const existingNotes = fields[pf.notes] ?? '';

  if (scheduled.length > 0) {
    let notes = existingNotes;
    for (const entry of scheduled) {
      notes = appendEasypostPickupNote(notes, entry.result);
    }
    await updatePickupRecord($, pickupRecordId, {
      [pf.status]: AIRTABLE.pickupStatus.scheduled,
      [pf.notes]: notes,
    });

    return {
      action: 'scheduled',
      pickupRecordId,
      scheduledAt: when.toISOString(),
      easypostPickups: easypostResults,
      confirmation: scheduled[0]?.result?.confirmation ?? null,
    };
  }

  const skipped = easypostResults.filter((entry) => entry.result?.skipped);
  const error =
    skipped
      .map((entry) => entry.result?.reason)
      .filter(Boolean)
      .join('; ') || 'EasyPost could not schedule a carrier pickup';

  await updatePickupRecord($, pickupRecordId, {
    [pf.notes]: appendScheduleErrorNote(existingNotes, error),
  });

  return {
    action: 'failed',
    pickupRecordId,
    error,
    easypostPickups: easypostResults,
  };
}

/** Mark past scheduled pickups as Confirmed after their window has passed. */
export async function confirmCompletedPickups($ = {}) {
  const disabled = shippingAutomationSkipped();
  if (disabled) return [];

  const records = await listPickupsReadyToConfirm($);
  const pf = AIRTABLE.pickupFields;
  const results = [];

  for (const record of records) {
    const updated = await updatePickupRecord($, record.id, {
      [pf.status]: AIRTABLE.pickupStatus.confirmed,
    });
    results.push({
      action: 'confirmed',
      pickupRecordId: record.id,
      when: record.fields?.[pf.when] ?? null,
      updated,
    });
  }

  return results;
}
