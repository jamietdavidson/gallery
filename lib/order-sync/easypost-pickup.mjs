import {EASYPOST, PICKUP_SCHEDULE} from './config.js';
import {isPickupSupportedCarrier} from './easypost-carriers.mjs';
import {
  buyEasypostPickup,
  createEasypostPickup,
  loadEasypostShipmentForFulfillment,
} from './easypost-client.mjs';
import {dateInTimeZone, getZonedComponents} from './pickup-schedule.mjs';

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatLocalWallClock(date, timeZone) {
  const parts = getZonedComponents(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)} ${pad2(parts.hour)}:${pad2(parts.minute)}:00`;
}

/** Use today when the pickup slot date has already passed. */
function effectivePickupDate(scheduledAt, timeZone = PICKUP_SCHEDULE.timeZone) {
  const now = new Date();
  const scheduledParts = getZonedComponents(scheduledAt, timeZone);
  const nowParts = getZonedComponents(now, timeZone);
  const scheduledDay = Date.UTC(
    scheduledParts.year,
    scheduledParts.month - 1,
    scheduledParts.day,
  );
  const todayDay = Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day);

  if (scheduledDay < todayDay) {
    return dateInTimeZone(
      timeZone,
      nowParts.year,
      nowParts.month,
      nowParts.day,
      scheduledParts.hour,
      scheduledParts.minute,
    );
  }

  return scheduledAt;
}

/** Canada Post pickups must fall between noon and 4pm local time. */
function formatPickupWindow(scheduledAt, timeZone = PICKUP_SCHEDULE.timeZone) {
  const pickupDate = effectivePickupDate(scheduledAt, timeZone);
  const parts = getZonedComponents(pickupDate, timeZone);
  const min = dateInTimeZone(
    timeZone,
    parts.year,
    parts.month,
    parts.day,
    12,
    0,
  );
  const max = dateInTimeZone(
    timeZone,
    parts.year,
    parts.month,
    parts.day,
    15,
    30,
  );
  return {
    min_datetime: formatLocalWallClock(min, timeZone),
    max_datetime: formatLocalWallClock(max, timeZone),
    pickupDate,
  };
}

function buildPickupAddress() {
  const from = EASYPOST.fromAddress;
  const phone = String(from.phone ?? '').trim();
  const email = String(from.email ?? '').trim();
  if (!phone) {
    throw new Error('Missing pickup phone (set EASYPOST_FROM_PHONE)');
  }
  if (!email) {
    throw new Error('Missing pickup email (set EASYPOST_FROM_EMAIL)');
  }

  return {
    name: from.name,
    company: from.company || undefined,
    street1: from.street1,
    street2: from.street2 || undefined,
    city: from.city,
    state: from.state,
    zip: from.zip,
    country: from.country,
    phone,
    email,
  };
}

function isEasypostTestMode() {
  return process.env.EASYPOST_API_KEY?.trim().startsWith('EZTK');
}

function carrierMatches(rateCarrier, shipmentCarrier) {
  const left = String(rateCarrier ?? '').toLowerCase();
  const right = String(shipmentCarrier ?? '').toLowerCase();
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

function pickupSupportedCarrier(carrier) {
  return isPickupSupportedCarrier(carrier);
}

function pickPickupRate(rates, carrier) {
  const available = [...(rates ?? [])].filter(
    (rate) => rate?.carrier && rate?.service,
  );
  if (!available.length) return null;

  const preferred = available.filter((rate) =>
    carrierMatches(rate.carrier, carrier),
  );
  const pool = preferred.length ? preferred : available;
  pool.sort((left, right) => Number(left.rate) - Number(right.rate));
  return pool[0] ?? null;
}

/**
 * Schedule a carrier pickup in EasyPost for a labeled fulfillment.
 * @param {{
 *   fulfillmentRecordId: string;
 *   scheduledAt: Date;
 *   pickupReference?: string | null;
 * }} params
 */
export async function scheduleEasypostCarrierPickup(params) {
  const {fulfillmentRecordId, scheduledAt, pickupReference = null} = params;

  if (!EASYPOST.isConfigured()) {
    return {
      skipped: true,
      reason: 'EasyPost is not configured (set EASYPOST_API_KEY)',
    };
  }

  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return {
      skipped: true,
      reason: 'Pickup slot is missing a valid scheduled time',
    };
  }

  let shipment;
  try {
    shipment = await loadEasypostShipmentForFulfillment(fulfillmentRecordId);
  } catch (error) {
    return {
      skipped: true,
      reason: `Could not load EasyPost shipment for fulfillment ${fulfillmentRecordId}: ${error.message}`,
    };
  }

  const carrier =
    shipment.selected_rate?.carrier ?? shipment.rates?.[0]?.carrier ?? null;
  if (!carrier) {
    return {
      skipped: true,
      reason: 'EasyPost shipment has no purchased carrier rate',
    };
  }

  if (!pickupSupportedCarrier(carrier)) {
    return {
      skipped: true,
      reason: `Carrier ${carrier} does not support scheduled pickup via EasyPost`,
      carrier,
      easypostShipmentId: shipment.id ?? null,
    };
  }

  const window = formatPickupWindow(scheduledAt);

  let pickup;
  try {
    pickup = await createEasypostPickup({
      reference: pickupReference ?? `pickup-${fulfillmentRecordId}`,
      shipment: {id: shipment.id},
      address: buildPickupAddress(),
      is_account_address: true,
      instructions: 'Fine art prints — handle with care',
      min_datetime: window.min_datetime,
      max_datetime: window.max_datetime,
    });
  } catch (error) {
    return {
      skipped: true,
      reason: `EasyPost could not create pickup: ${error.message}`,
      carrier,
      easypostShipmentId: shipment.id ?? null,
    };
  }

  const rate = pickPickupRate(pickup.pickup_rates, carrier);
  if (!rate) {
    const messages = (pickup.messages ?? [])
      .map((message) => `${message.carrier}: ${message.message}`)
      .join('; ');

    if (isEasypostTestMode() && pickup.id) {
      return {
        action: 'scheduled',
        easypostPickupId: pickup.id,
        confirmation: 'test-mode-stub',
        status: pickup.status ?? 'unknown',
        carrier,
        service: null,
        pickupCost: 0,
        easypostShipmentId: shipment.id ?? null,
        minDatetime: window.min_datetime,
        maxDatetime: window.max_datetime,
        testMode: true,
        note: 'EasyPost test keys do not return purchasable pickup rates; marked Scheduled for workflow validation',
      };
    }

    return {
      skipped: true,
      reason:
        messages ||
        'EasyPost returned no pickup rates for this shipment and time window',
      easypostPickupId: pickup.id ?? null,
      carrier,
      easypostShipmentId: shipment.id ?? null,
    };
  }

  let purchased;
  try {
    purchased = await buyEasypostPickup(pickup.id, rate.carrier, rate.service);
  } catch (error) {
    return {
      skipped: true,
      reason: `EasyPost could not purchase pickup: ${error.message}`,
      easypostPickupId: pickup.id ?? null,
      carrier,
      easypostShipmentId: shipment.id ?? null,
    };
  }

  return {
    action: 'scheduled',
    easypostPickupId: purchased.id ?? pickup.id,
    confirmation: purchased.confirmation ?? null,
    status: purchased.status ?? null,
    carrier: rate.carrier,
    service: rate.service,
    pickupCost: Number(rate.rate),
    easypostShipmentId: shipment.id ?? null,
    minDatetime: window.min_datetime,
    maxDatetime: window.max_datetime,
  };
}
