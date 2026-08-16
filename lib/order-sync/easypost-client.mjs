const API_BASE = 'https://api.easypost.com/v2';

function requireApiKey() {
  const apiKey = process.env.EASYPOST_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Missing EASYPOST_API_KEY');
  }
  return apiKey;
}

function authHeader(apiKey) {
  return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
}

/**
 * @param {'GET' | 'POST'} method
 * @param {string} path
 * @param {Record<string, unknown> | undefined} body
 */
export async function easypostRequest(method, path, body) {
  const apiKey = requireApiKey();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(apiKey),
      'Content-Type': 'application/json',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = {raw: text};
  }

  if (!response.ok) {
    const detail =
      parsed?.error?.message ??
      parsed?.errors?.map((error) => error.message).join('; ') ??
      text;
    throw new Error(
      `EasyPost ${method} ${path} failed (${response.status}): ${detail}`,
    );
  }

  return parsed;
}

/** @param {Record<string, unknown>} shipmentInput */
export async function createEasypostShipment(shipmentInput) {
  const shipment = await easypostRequest('POST', '/shipments', {
    shipment: shipmentInput,
  });
  return shipment;
}

/** @param {string} shipmentId @param {string} rateId */
export async function buyEasypostShipment(shipmentId, rateId) {
  return easypostRequest('POST', `/shipments/${shipmentId}/buy`, {
    rate: {id: rateId},
  });
}

/** @param {string} idOrReference */
export async function retrieveEasypostShipment(idOrReference) {
  return easypostRequest(
    'GET',
    `/shipments/${encodeURIComponent(idOrReference)}`,
  );
}

function isEasypostShipmentId(value) {
  return String(value ?? '').startsWith('shp_');
}

/**
 * Find a purchased shipment by its reference field (e.g. Airtable fulfillment record id).
 * @param {string} reference
 */
export async function findEasypostShipmentByReference(reference) {
  const target = String(reference ?? '').trim();
  if (!target) {
    throw new Error('Missing EasyPost shipment reference');
  }

  let beforeId = null;
  for (let page = 0; page < 15; page++) {
    const params = new URLSearchParams({page_size: '100', purchased: 'true'});
    if (beforeId) params.set('before_id', beforeId);

    const response = await easypostRequest('GET', `/shipments?${params}`);
    const shipments = response.shipments ?? [];
    const match = shipments.find((shipment) => shipment.reference === target);
    if (match) return match;

    if (!response.has_more || shipments.length === 0) break;
    beforeId = shipments[shipments.length - 1]?.id ?? null;
    if (!beforeId) break;
  }

  throw new Error(
    `No purchased EasyPost shipment found with reference ${target}`,
  );
}

/**
 * Load a shipment for pickup scheduling using EasyPost id or fulfillment reference.
 * @param {string} fulfillmentRecordId
 */
export async function loadEasypostShipmentForFulfillment(fulfillmentRecordId) {
  const id = String(fulfillmentRecordId ?? '').trim();
  if (!id) {
    throw new Error('Missing fulfillment record id');
  }

  if (isEasypostShipmentId(id)) {
    return retrieveEasypostShipment(id);
  }

  return findEasypostShipmentByReference(id);
}

/** @param {Record<string, unknown>} pickupInput */
export async function createEasypostPickup(pickupInput) {
  const response = await easypostRequest('POST', '/pickups', {
    pickup: pickupInput,
  });
  return response;
}

/** @param {string} pickupId @param {string} carrier @param {string} service */
export async function buyEasypostPickup(pickupId, carrier, service) {
  return easypostRequest('POST', `/pickups/${pickupId}/buy`, {
    carrier,
    service,
  });
}

/** @param {string} url */
export async function downloadEasypostLabelPdf(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download EasyPost label (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error('Downloaded EasyPost label PDF was empty');
  }
  return buffer;
}
