import {axios} from '../http.mjs';
import {AIRTABLE, SHOPIFY} from './config.js';
import {getSyncConcurrency, mapWithConcurrency} from './concurrency.mjs';

// ─── Text helpers ─────────────────────────────────────────────────────────────

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function attachmentUrl(field) {
  return field?.[0]?.url ?? null;
}

/** First Airtable attachment with stable id for change detection. */
export function attachmentInfo(field) {
  const file = field?.[0];
  if (!file?.url) return null;
  return {
    id: file.id ?? file.url,
    url: file.url,
  };
}

export function textValue(field) {
  if (field == null) return '';
  if (typeof field === 'string') return field.trim();
  if (Array.isArray(field)) return String(field[0] ?? '').trim();
  return String(field).trim();
}

export function plainText(value) {
  return textValue(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function linkedRecordIds(field) {
  if (!Array.isArray(field)) return [];
  return field.filter((id) => typeof id === 'string');
}

export function normalizeVariant(fields) {
  const v = AIRTABLE.variants;
  const padding = Number(fields[v.padding] ?? 0);
  const frameWidth = Number(fields[v.frameWidth] ?? 0);
  const frameRaw = textValue(fields[v.frame]);
  const frame = frameRaw && frameRaw !== 'No Frame' ? frameRaw : 'No Frame';

  const predictedWeight = Number(fields[v.predictedWeight]);

  return {
    sizeName: textValue(fields[v.sizeName]),
    frame,
    mount: padding === 0 ? 'Full Bleed' : 'Border',
    shortSide: Number(fields[v.shortSide]),
    longSide: Number(fields[v.longSide]),
    padding,
    frameWidth,
    price: String(fields[v.salePrice] ?? ''),
    rank: Number(fields[v.rank] ?? 999),
    predictedWeightLb:
      Number.isFinite(predictedWeight) && predictedWeight > 0
        ? predictedWeight
        : null,
  };
}

export function normalizeVariantRecord(record) {
  const normalized = normalizeVariant(record.fields ?? {});
  return {
    recordId: record.id,
    ...normalized,
  };
}

function isCompleteCatalogVariant(variant) {
  return Boolean(
    variant.sizeName && variant.shortSide && variant.longSide && variant.price,
  );
}

/** Bordered print dimensions + mat/moulding reference insets per size tier. */
export function buildCanonicalSizeSizingMap(catalog) {
  const map = new Map();

  for (const variant of catalog) {
    const entry = map.get(variant.sizeName) ?? {
      shortSide: variant.shortSide,
      longSide: variant.longSide,
      referencePadding: null,
      referenceFrame: null,
      rank: variant.rank,
    };

    if (variant.mount === 'Border' && variant.padding > 0) {
      entry.shortSide = variant.shortSide;
      entry.longSide = variant.longSide;
      entry.referencePadding = variant.padding;
      entry.rank = variant.rank;
    }

    if (variant.frame !== 'No Frame' && variant.frameWidth > 0) {
      entry.referenceFrame = Math.max(
        entry.referenceFrame ?? 0,
        variant.frameWidth,
      );
    }

    map.set(variant.sizeName, entry);
  }

  return map;
}

/** Canonical print metafields written to every Shopify variant for a size tier. */
export function getCanonicalVariantMetafieldSizing(variant, sizingMap) {
  const canonical = sizingMap.get(variant.sizeName);
  const referencePadding =
    canonical?.referencePadding ?? (variant.padding > 0 ? variant.padding : 2);

  return {
    shortSide: canonical?.shortSide ?? variant.shortSide,
    longSide: canonical?.longSide ?? variant.longSide,
    referencePadding,
    frameWidth:
      canonical?.referenceFrame ??
      (variant.frameWidth > 0 ? variant.frameWidth : 2),
    rank: canonical?.rank ?? variant.rank,
  };
}

function canonicalVariantMetafieldSizing(variant, sizingMap) {
  return getCanonicalVariantMetafieldSizing(variant, sizingMap);
}

// ─── Airtable API ─────────────────────────────────────────────────────────────

const TABLE_REF = {
  prints: {id: AIRTABLE.printsTableId, name: AIRTABLE.printsTable},
  variants: {id: AIRTABLE.variantsTableId, name: AIRTABLE.variantsTable},
  artists: {id: AIRTABLE.artistsTableId, name: AIRTABLE.artistsTable},
  collections: {
    id: AIRTABLE.collectionsTableId,
    name: AIRTABLE.collectionsTable,
  },
};

const PRINT_FIELD_IDS = {
  [AIRTABLE.prints.name]: 'fldodweSrQJrDeTof',
  [AIRTABLE.prints.description]: 'fldLpQ5eALLzTiGh0',
  [AIRTABLE.prints.image]: 'fldyM2cKNOWimkTHy',
  [AIRTABLE.prints.orientation]: 'fldwzuXg1F2f5ZGdZ',
  [AIRTABLE.prints.artist]: 'fld27VD19QKXTMdJr',
  [AIRTABLE.prints.collection]: 'fldx68uBGY28whBD9',
  [AIRTABLE.prints.status]: 'fldhLQ5qh9X9aIklx',
};

export function tableRef(tableKey) {
  return TABLE_REF[tableKey] ?? {id: null, name: tableKey};
}

function tablePath(tableKey) {
  const ref = tableRef(tableKey);
  return ref.id ?? ref.name;
}

export function normalizeNamedFields(fields, fieldIdsByName) {
  if (!fields || typeof fields !== 'object') return {};
  const hasNamedKeys = Object.keys(fieldIdsByName).some(
    (name) => name in fields,
  );
  if (hasNamedKeys) return fields;

  const normalized = {};
  for (const [name, fieldId] of Object.entries(fieldIdsByName)) {
    if (fieldId in fields) normalized[name] = fields[fieldId];
  }
  return Object.keys(normalized).length ? normalized : fields;
}

export function normalizePrintRecord(record) {
  if (!record?.id) return record;
  return {
    ...record,
    fields: normalizeNamedFields(record.fields, PRINT_FIELD_IDS),
  };
}

export function extractPrintRecordId(steps, explicitId) {
  if (explicitId) return explicitId;

  const candidates = [
    steps?.trigger?.event,
    steps?.trigger?.context?.event,
    steps?.trigger,
    steps?.trigger?.event?.record,
  ].filter(Boolean);

  for (const event of candidates) {
    if (typeof event === 'string' && event.startsWith('rec')) return event;
    if (event?.id?.startsWith?.('rec')) return event.id;
    if (event?.recordId?.startsWith?.('rec')) return event.recordId;
  }

  return null;
}

export async function resolvePrintRecord($, airtable, steps, explicitId) {
  const recordId = extractPrintRecordId(steps, explicitId);
  if (!recordId) {
    throw new Error(
      'No print record ID found. Use an Airtable "New or Modified Records in View" trigger on Prints → Committed, or set Print Record ID for manual tests.',
    );
  }

  // Always fetch the latest row — trigger payloads can be stale after renames.
  const fetched = await getTableRecord($, airtable, 'prints', recordId);
  return normalizePrintRecord(fetched);
}

/** @deprecated use resolvePrintRecord */
export function getTriggerPrintRecord(steps) {
  const recordId = extractPrintRecordId(steps);
  const candidates = [
    steps?.trigger?.event,
    steps?.trigger?.context?.event,
    steps?.trigger?.event?.record,
  ].filter(Boolean);

  for (const event of candidates) {
    const record = normalizePrintRecord(event?.record ?? event);
    if (record?.id && record?.fields && Object.keys(record.fields).length) {
      return record;
    }
  }

  throw new Error(
    `No print fields on trigger event${recordId ? ` for ${recordId}` : ''}. The sync will fetch the record by ID when run in a workflow.`,
  );
}

export function getShopifyConnection(component) {
  const raw = component.shopify_developer_app;
  const auth = raw?.$auth;
  if (!auth) {
    throw new Error(
      'Connect Shopify on this step (Shopify Key Required or shopify_developer_app).',
    );
  }

  const shopId = String(auth.shop_id ?? auth.shopId ?? 'thelonglookco').replace(
    /\.myshopify\.com$/,
    '',
  );
  const accessToken = auth.access_token ?? auth.api_key;
  if (!accessToken) {
    throw new Error(
      'Shopify access token missing — reconnect the Shopify account on this step.',
    );
  }

  return {$auth: {shop_id: shopId, access_token: accessToken}};
}

export async function airtableRequest(
  $,
  airtable,
  {method = 'get', path, data},
) {
  const token = airtable?.$auth?.oauth_access_token;
  if (!token) {
    throw new Error(
      'Airtable OAuth token missing — connect airtable_oauth on this action step (not just the trigger).',
    );
  }

  try {
    return await axios($, {
      method,
      url: `https://api.airtable.com/v0${path}`,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data,
    });
  } catch (error) {
    const status = error?.response?.status;
    const body = error?.response?.data;
    if (status === 403) {
      throw new Error(
        `Airtable denied access to ${path}. Reconnect airtable_oauth on this step with access to base ${AIRTABLE.baseId}, or verify table/record IDs. ${JSON.stringify(body ?? {})}`,
      );
    }
    throw error;
  }
}

export async function listTableRecords(
  $,
  airtable,
  tableKey,
  {sortField, filterByFormula} = {},
) {
  const records = [];
  let offset;

  do {
    const params = new URLSearchParams();
    if (sortField) {
      params.set('sort[0][field]', sortField);
      params.set('sort[0][direction]', 'asc');
    }
    if (filterByFormula) params.set('filterByFormula', filterByFormula);
    if (offset) params.set('offset', offset);

    const query = params.toString() ? `?${params}` : '';
    const response = await airtableRequest($, airtable, {
      path: `/${AIRTABLE.baseId}/${tablePath(tableKey)}${query}`,
    });

    records.push(...(response.records ?? []));
    offset = response.offset;
  } while (offset);

  return records;
}

function tableStatusField(tableKey) {
  if (tableKey === 'prints') return AIRTABLE.prints.status;
  if (tableKey === 'variants') return AIRTABLE.variants.status;
  if (tableKey === 'artists') return AIRTABLE.artists.status;
  if (tableKey === 'collections') return AIRTABLE.collections.status;
  throw new Error(`Unknown table key: ${tableKey}`);
}

export function recordHasStatus(record, status, statusField) {
  return textValue(record?.fields?.[statusField]) === status;
}

/** All record ids in an Airtable table (any status). */
export async function listTableRecordIds($, airtable, tableKey) {
  const records = await listTableRecords($, airtable, tableKey);
  return records.map((record) => record.id);
}

/** Records with Status = Queued. */
export async function listQueuedRecords($, airtable, tableKey) {
  const statusField = tableStatusField(tableKey);
  const filterByFormula = `{${statusField}} = "${AIRTABLE.queuedStatus}"`;
  return listTableRecords($, airtable, tableKey, {filterByFormula});
}

export async function getTableRecord($, airtable, tableKey, recordId) {
  return airtableRequest($, airtable, {
    path: `/${AIRTABLE.baseId}/${tablePath(tableKey)}/${recordId}`,
  });
}

export async function updateTableRecord(
  $,
  airtable,
  tableKey,
  recordId,
  fields,
) {
  return airtableRequest($, airtable, {
    method: 'patch',
    path: `/${AIRTABLE.baseId}/${tablePath(tableKey)}/${recordId}`,
    data: {fields},
  });
}

export async function markRecordProcessing(
  $,
  airtable,
  {tableKey, tableName, statusField, recordId, currentStatus, dryRun},
) {
  const resolvedTableKey =
    tableKey ??
    (tableName === AIRTABLE.artistsTable
      ? 'artists'
      : tableName === AIRTABLE.collectionsTable
        ? 'collections'
        : tableName);

  const status = textValue(currentStatus);
  if (status === AIRTABLE.committedStatus) {
    return {recordId, status: 'already_committed'};
  }
  if (status === AIRTABLE.processingStatus) {
    return {recordId, status: 'already_processing'};
  }
  if (status !== AIRTABLE.queuedStatus) {
    return {
      recordId,
      status: 'skipped',
      reason: `Not ${AIRTABLE.queuedStatus} (${status || 'empty'})`,
    };
  }

  if (dryRun) {
    return {recordId, status: 'pending', dryRun: true};
  }

  await updateTableRecord($, airtable, resolvedTableKey, recordId, {
    [statusField]: AIRTABLE.processingStatus,
  });
  return {recordId, status: 'processing'};
}

export async function markRecordCommitted(
  $,
  airtable,
  {
    tableKey,
    tableName,
    statusField,
    recordId,
    currentStatus,
    committedStatus,
    dryRun,
  },
) {
  const resolvedTableKey =
    tableKey ??
    (tableName === AIRTABLE.artistsTable
      ? 'artists'
      : tableName === AIRTABLE.collectionsTable
        ? 'collections'
        : tableName);

  if (textValue(currentStatus) === committedStatus) {
    return {recordId, status: 'already_committed'};
  }

  if (dryRun) {
    return {recordId, status: 'pending', dryRun: true};
  }

  await updateTableRecord($, airtable, resolvedTableKey, recordId, {
    [statusField]: committedStatus,
  });
  return {recordId, status: 'committed'};
}

export async function listCommittedPrints($, airtable) {
  const records = await listAllPrintRecords($, airtable);
  return records.filter((record) =>
    recordHasStatus(record, AIRTABLE.committedStatus, AIRTABLE.prints.status),
  );
}

/** Every print row in Airtable (any status) — used to detect deleted records. */
export async function listAllPrintRecords($, airtable) {
  const records = [];
  let offset;

  do {
    const params = new URLSearchParams();
    if (offset) params.set('offset', offset);

    const response = await airtableRequest($, airtable, {
      path: `/${AIRTABLE.baseId}/${tablePath('prints')}?${params}`,
    });

    records.push(...(response.records ?? []).map(normalizePrintRecord));
    offset = response.offset;
  } while (offset);

  return records;
}

export function printHandle(record) {
  return slugify(textValue(record?.fields?.[AIRTABLE.prints.name]));
}

export async function listFineArtPrintProducts($, shopify) {
  const products = [];
  let cursor = null;

  do {
    const data = await shopifyRequest($, shopify, {
      query: `query($cursor: String, $query: String!) {
        products(first: 100, after: $cursor, query: $query) {
          nodes {
            id
            handle
            airtableId: metafield(namespace: "${SHOPIFY.airtableMetafield.namespace}", key: "${SHOPIFY.airtableMetafield.key}") {
              value
            }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: {
        cursor,
        query: `product_type:'${SHOPIFY.productType}'`,
      },
    });

    products.push(
      ...(data.products?.nodes ?? []).map((node) => ({
        id: node.id,
        handle: node.handle,
        airtableRecordId: node.airtableId?.value ?? null,
      })),
    );
    const pageInfo = data.products?.pageInfo;
    cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return products;
}

const METAOBJECT_DISPLAY_FIELD = {
  artist: 'name',
  collection: 'title',
};

/** Stable Shopify handle derived from an Airtable record id (fallback when airtable_record_id field is unavailable). */
export function airtableStableHandle(recordId) {
  return String(recordId ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function metaobjectDisplayFieldKey(type) {
  return METAOBJECT_DISPLAY_FIELD[type] ?? 'name';
}

export async function listMetaobjectsByType($, shopify, type) {
  const metaobjects = [];
  let cursor = null;
  const fieldKey = SHOPIFY.airtableRecordIdField;
  const displayFieldKey = metaobjectDisplayFieldKey(type);

  do {
    const data = await shopifyRequest($, shopify, {
      query: `query($cursor: String, $type: String!) {
        metaobjects(first: 100, after: $cursor, type: $type) {
          nodes {
            id
            handle
            airtableId: field(key: "${fieldKey}") { value }
            display: field(key: "${displayFieldKey}") { value }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      variables: {cursor, type},
    });

    metaobjects.push(
      ...(data.metaobjects?.nodes ?? []).map((node) => ({
        id: node.id,
        handle: node.handle,
        airtableRecordId: node.airtableId?.value ?? null,
        displayValue: node.display?.value ?? null,
      })),
    );
    const pageInfo = data.metaobjects?.pageInfo;
    cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return metaobjects;
}

async function findMetaobjectIdByDisplayName($, shopify, type, displayName) {
  const normalized = textValue(displayName).toLowerCase();
  if (!normalized) return null;

  const metaobjects = await listMetaobjectsByType($, shopify, type);
  const match = metaobjects.find(
    (entry) => textValue(entry.displayValue).toLowerCase() === normalized,
  );
  return match?.id ?? null;
}

/**
 * Resolve an artist/collection metaobject for sync — Airtable record id first, then legacy handle/name.
 * @returns {{ id: string | null, useStableHandle: boolean }}
 */
export async function resolveMetaobjectForSync(
  $,
  shopify,
  type,
  {recordId, displayName},
) {
  const stableHandle = airtableStableHandle(recordId);
  const displayHandle = slugify(displayName);

  if (recordId) {
    const byAirtableId = await getMetaobjectIdByAirtableId(
      $,
      shopify,
      type,
      recordId,
    );
    if (byAirtableId) {
      return {id: byAirtableId, useStableHandle: false};
    }
  }

  const byStableHandle = await getMetaobjectIdByHandle(
    $,
    shopify,
    type,
    stableHandle,
  );
  if (byStableHandle) {
    return {id: byStableHandle, useStableHandle: true};
  }

  const byDisplayHandle = await getMetaobjectIdByHandle(
    $,
    shopify,
    type,
    displayHandle,
  );
  if (byDisplayHandle) {
    return {id: byDisplayHandle, useStableHandle: true};
  }

  const byDisplayName = await findMetaobjectIdByDisplayName(
    $,
    shopify,
    type,
    displayName,
  );
  if (byDisplayName) {
    return {id: byDisplayName, useStableHandle: true};
  }

  return {id: null, useStableHandle: true};
}

export async function listPictureMetaobjects($, shopify) {
  return listMetaobjectsByType($, shopify, SHOPIFY.metaobjectTypes.picture);
}

function isPrintInAirtable(
  {airtableRecordId, handle},
  validRecordIds,
  validHandles,
) {
  if (airtableRecordId && validRecordIds.has(airtableRecordId)) return true;
  if (handle && validHandles.has(handle)) return true;
  return false;
}

function buildMetaobjectValiditySets(records, nameField) {
  const validRecordIds = new Set();
  const validHandles = new Set();

  for (const record of records) {
    validRecordIds.add(record.id);
    const displayName = textValue(record.fields?.[nameField]);
    if (displayName) validHandles.add(slugify(displayName));
    validHandles.add(airtableStableHandle(record.id));
  }

  return {validRecordIds, validHandles};
}

function isMetaobjectInAirtable(metaobject, {validRecordIds, validHandles}) {
  if (
    metaobject.airtableRecordId &&
    validRecordIds.has(metaobject.airtableRecordId)
  ) {
    return true;
  }
  if (metaobject.handle && validHandles.has(metaobject.handle)) return true;
  if (
    metaobject.displayValue &&
    validHandles.has(slugify(metaobject.displayValue))
  ) {
    return true;
  }
  return false;
}

export async function deleteProduct($, shopify, productId) {
  const data = await shopifyRequest($, shopify, {
    query: `mutation($id: ID!) {
      productDelete(input: {id: $id}) {
        deletedProductId
        userErrors { field message }
      }
    }`,
    variables: {id: productId},
  });
  const errors = data.productDelete?.userErrors ?? [];
  if (errors.length)
    throw new Error(`productDelete: ${JSON.stringify(errors)}`);
  return data.productDelete?.deletedProductId ?? null;
}

export async function deleteMetaobject($, shopify, metaobjectId) {
  const data = await shopifyRequest($, shopify, {
    query: `mutation($id: ID!) {
      metaobjectDelete(id: $id) {
        deletedId
        userErrors { field message }
      }
    }`,
    variables: {id: metaobjectId},
  });
  const errors = data.metaobjectDelete?.userErrors ?? [];
  if (errors.length)
    throw new Error(`metaobjectDelete: ${JSON.stringify(errors)}`);
  return data.metaobjectDelete?.deletedId ?? null;
}

export async function removePrintByAirtableId(
  $,
  shopify,
  recordId,
  handle,
  dryRun,
) {
  if (!recordId && !handle) {
    return {status: 'skipped', reason: 'Missing Airtable record ID'};
  }

  const productId = await resolveProductId($, shopify, {recordId, handle});
  const pictureId = await resolveMetaobjectId($, shopify, 'picture', {
    recordId,
    handle,
  });

  if (!productId && !pictureId) {
    return {status: 'not_found', recordId, handle};
  }

  if (dryRun) {
    return {
      status: 'pending',
      dryRun: true,
      recordId,
      handle,
      productId,
      pictureId,
    };
  }

  if (productId) await deleteProduct($, shopify, productId);
  if (pictureId) await deleteMetaobject($, shopify, pictureId);

  return {status: 'removed', recordId, handle, productId, pictureId};
}

/** @deprecated use removePrintByAirtableId */
export async function removePrintByHandle($, shopify, handle, dryRun) {
  return removePrintByAirtableId($, shopify, null, handle, dryRun);
}

/** Remove Fine Art Print products (and legacy picture metaobjects) not in Airtable. */
export async function pruneOrphanedPrints($, airtable, shopify, dryRun) {
  const airtablePrints = await listAllPrintRecords($, airtable);
  const validRecordIds = new Set(airtablePrints.map((record) => record.id));
  const validHandles = new Set(
    airtablePrints.map((record) => printHandle(record)),
  );

  const shopifyProducts = await listFineArtPrintProducts($, shopify);
  const productOrphans = shopifyProducts.filter(
    (product) => !isPrintInAirtable(product, validRecordIds, validHandles),
  );

  const legacyPictures = await listPictureMetaobjects($, shopify);

  const orphanTargets = productOrphans.map((product) => ({
    airtableRecordId: product.airtableRecordId,
    handle: product.handle,
    productId: product.id,
  }));

  if (!orphanTargets.length && !legacyPictures.length) {
    return {
      removed: [],
      wouldRemove: [],
      legacyPicturesRemoved: 0,
      count: 0,
      shopifyTotal: shopifyProducts.length,
    };
  }

  if (dryRun) {
    return {
      dryRun: true,
      wouldRemove: orphanTargets,
      legacyPicturesWouldRemove: legacyPictures.map((picture) => ({
        handle: picture.handle,
        pictureId: picture.id,
      })),
      count: orphanTargets.length + legacyPictures.length,
      shopifyTotal: shopifyProducts.length,
    };
  }

  const removed = await mapWithConcurrency(
    orphanTargets,
    getSyncConcurrency(),
    async (orphan) => {
      const result = await removePrintByAirtableId(
        $,
        shopify,
        orphan.airtableRecordId,
        orphan.handle,
        dryRun,
      );
      return {...orphan, ...result};
    },
  );

  let legacyPicturesRemoved = 0;
  if (legacyPictures.length) {
    await mapWithConcurrency(
      legacyPictures,
      getSyncConcurrency(),
      async (picture) => {
        await deleteMetaobject($, shopify, picture.id);
      },
    );
    legacyPicturesRemoved = legacyPictures.length;
  }

  return {
    removed,
    legacyPicturesRemoved,
    count: removed.length + legacyPicturesRemoved,
    shopifyTotal: shopifyProducts.length,
  };
}

/** Remove artist metaobjects not linked to any Airtable Artists row. */
export async function pruneOrphanedArtists($, airtable, shopify, dryRun) {
  const records = await listTableRecords($, airtable, 'artists');
  const validity = buildMetaobjectValiditySets(records, AIRTABLE.artists.name);
  const shopifyArtists = await listMetaobjectsByType(
    $,
    shopify,
    SHOPIFY.metaobjectTypes.artist,
  );
  const orphans = shopifyArtists.filter(
    (metaobject) => !isMetaobjectInAirtable(metaobject, validity),
  );

  if (!orphans.length) {
    return {
      removed: [],
      wouldRemove: [],
      count: 0,
      shopifyTotal: shopifyArtists.length,
    };
  }

  if (dryRun) {
    return {
      dryRun: true,
      wouldRemove: orphans.map((metaobject) => ({
        recordId: metaobject.airtableRecordId,
        handle: metaobject.handle,
        shopifyId: metaobject.id,
      })),
      count: orphans.length,
      shopifyTotal: shopifyArtists.length,
    };
  }

  const removed = await mapWithConcurrency(
    orphans,
    getSyncConcurrency(),
    async (metaobject) => {
      await deleteMetaobject($, shopify, metaobject.id);
      return {
        recordId: metaobject.airtableRecordId,
        handle: metaobject.handle,
        shopifyId: metaobject.id,
        status: 'removed',
      };
    },
  );

  return {removed, count: removed.length, shopifyTotal: shopifyArtists.length};
}

/** Remove collection metaobjects not linked to any Airtable Collections row. */
export async function pruneOrphanedCollections($, airtable, shopify, dryRun) {
  const records = await listTableRecords($, airtable, 'collections');
  const validity = buildMetaobjectValiditySets(
    records,
    AIRTABLE.collections.name,
  );
  const shopifyCollections = await listMetaobjectsByType(
    $,
    shopify,
    SHOPIFY.metaobjectTypes.collection,
  );
  const orphans = shopifyCollections.filter(
    (metaobject) => !isMetaobjectInAirtable(metaobject, validity),
  );

  if (!orphans.length) {
    return {
      removed: [],
      wouldRemove: [],
      count: 0,
      shopifyTotal: shopifyCollections.length,
    };
  }

  if (dryRun) {
    return {
      dryRun: true,
      wouldRemove: orphans.map((metaobject) => ({
        recordId: metaobject.airtableRecordId,
        handle: metaobject.handle,
        shopifyId: metaobject.id,
      })),
      count: orphans.length,
      shopifyTotal: shopifyCollections.length,
    };
  }

  const {deleteNativeCollectionByAirtableRecordId} =
    await import('./native-collections.mjs');
  const removed = await mapWithConcurrency(
    orphans,
    getSyncConcurrency(),
    async (metaobject) => {
      if (metaobject.airtableRecordId) {
        await deleteNativeCollectionByAirtableRecordId(
          $,
          shopify,
          metaobject.airtableRecordId,
        );
      }
      await deleteMetaobject($, shopify, metaobject.id);
      return {
        recordId: metaobject.airtableRecordId,
        handle: metaobject.handle,
        shopifyId: metaobject.id,
        status: 'removed',
      };
    },
  );

  return {
    removed,
    count: removed.length,
    shopifyTotal: shopifyCollections.length,
  };
}

/** Remove Shopify prints, artists, collections, and variants whose Airtable rows no longer exist. */
export async function syncCatalogDeletions($, airtable, shopify, dryRun) {
  const {pruneOrphanedProductVariants} = await import('./variant-catalog.mjs');

  const [printPrune, artistPrune, collectionPrune, variantPrune] =
    await Promise.all([
      pruneOrphanedPrints($, airtable, shopify, dryRun),
      pruneOrphanedArtists($, airtable, shopify, dryRun),
      pruneOrphanedCollections($, airtable, shopify, dryRun),
      pruneOrphanedProductVariants($, airtable, shopify, dryRun),
    ]);

  const printRemoved = dryRun
    ? (printPrune.wouldRemove ?? [])
    : (printPrune.removed ?? []);
  const artistRemoved = dryRun
    ? (artistPrune.wouldRemove ?? [])
    : (artistPrune.removed ?? []);
  const collectionRemoved = dryRun
    ? (collectionPrune.wouldRemove ?? [])
    : (collectionPrune.removed ?? []);

  return {
    removed: {
      prints: printRemoved,
      artists: artistRemoved,
      collections: collectionRemoved,
      variants: variantPrune.removed,
    },
    count:
      printRemoved.length +
      artistRemoved.length +
      collectionRemoved.length +
      variantPrune.count,
    printPrune,
    artistPrune,
    collectionPrune,
    variantPrune,
  };
}

/** Variant rows with Status = Committed (live Shopify catalog). */
export async function fetchCommittedVariantCatalog($, airtable) {
  const records = await listTableRecords($, airtable, 'variants', {
    sortField: AIRTABLE.variants.rank,
  });
  return records
    .filter((record) =>
      recordHasStatus(
        record,
        AIRTABLE.committedStatus,
        AIRTABLE.variants.status,
      ),
    )
    .map((record) => normalizeVariantRecord(record))
    .filter(isCompleteCatalogVariant);
}

/** Committed + Queued rows — used when pushing catalog changes to Shopify. */
export async function fetchLiveVariantCatalog($, airtable) {
  const records = await listTableRecords($, airtable, 'variants', {
    sortField: AIRTABLE.variants.rank,
  });
  return records
    .filter((record) => {
      const status = textValue(record.fields?.[AIRTABLE.variants.status]);
      return (
        status === AIRTABLE.committedStatus ||
        status === AIRTABLE.queuedStatus ||
        status === AIRTABLE.processingStatus
      );
    })
    .map((record) => normalizeVariantRecord(record))
    .filter(isCompleteCatalogVariant);
}

export async function listQueuedVariants($, airtable) {
  return listQueuedRecords($, airtable, 'variants');
}

export async function fetchVariantCatalog($, airtable) {
  return fetchCommittedVariantCatalog($, airtable);
}

// ─── Shopify API ──────────────────────────────────────────────────────────────

function shopifyGraphqlUrl(shopId) {
  return `https://${shopId}.myshopify.com/admin/api/${SHOPIFY.apiVersion}/graphql.json`;
}

export async function shopifyRequest($, shopify, {query, variables}) {
  const response = await axios($, {
    method: 'post',
    url: shopifyGraphqlUrl(shopify.$auth.shop_id),
    headers: {
      'X-Shopify-Access-Token': shopify.$auth.access_token,
      'Content-Type': 'application/json',
    },
    data: {query, variables},
  });

  if (response.errors?.length) {
    throw new Error(`Shopify GraphQL: ${JSON.stringify(response.errors)}`);
  }
  return response.data ?? response;
}

export function withAirtableRecordId(fields, recordId) {
  const fieldKey = SHOPIFY.airtableRecordIdField;
  const without = fields.filter((field) => field.key !== fieldKey);
  return [...without, {key: fieldKey, value: recordId}];
}

export function productAirtableMetafield(recordId) {
  const mf = SHOPIFY.airtableMetafield;
  return {
    namespace: mf.namespace,
    key: mf.key,
    type: 'single_line_text_field',
    value: recordId,
  };
}

async function findMetaobjectIdByAirtableRecordId($, shopify, type, recordId) {
  const metaobjects = await listMetaobjectsByType($, shopify, type);
  return (
    metaobjects.find((entry) => entry.airtableRecordId === recordId)?.id ?? null
  );
}

export async function getMetaobjectIdByAirtableId($, shopify, type, recordId) {
  if (!recordId) return null;

  const fromList = await findMetaobjectIdByAirtableRecordId(
    $,
    shopify,
    type,
    recordId,
  );
  if (fromList) return fromList;

  const fieldKey = SHOPIFY.airtableRecordIdField;
  const data = await shopifyRequest($, shopify, {
    query: `query($type: String!, $query: String!) {
      metaobjects(first: 10, type: $type, query: $query) {
        nodes {
          id
          airtableId: field(key: "${fieldKey}") { value }
        }
      }
    }`,
    variables: {
      type,
      query: `fields.${fieldKey}:${recordId}`,
    },
  });
  const match = (data.metaobjects?.nodes ?? []).find(
    (node) => node.airtableId?.value === recordId,
  );
  return match?.id ?? null;
}

export async function resolveMetaobjectId(
  $,
  shopify,
  type,
  {recordId, handle},
) {
  if (recordId) {
    const byId = await getMetaobjectIdByAirtableId($, shopify, type, recordId);
    if (byId) return byId;

    const byStableHandle = await getMetaobjectIdByHandle(
      $,
      shopify,
      type,
      airtableStableHandle(recordId),
    );
    if (byStableHandle) return byStableHandle;
  }
  if (handle) {
    return getMetaobjectIdByHandle($, shopify, type, handle);
  }
  return null;
}

export async function resolveProductId($, shopify, {recordId, handle}) {
  if (recordId) {
    const byId = await getProductIdByAirtableId($, shopify, recordId);
    if (byId) return byId;

    const byStableHandle = await getProductIdByHandle(
      $,
      shopify,
      airtableStableHandle(recordId),
    );
    if (byStableHandle) return byStableHandle;
  }
  if (handle) {
    const byHandle = await getProductIdByHandle($, shopify, handle);
    if (!byHandle) return null;
    if (!recordId) return byHandle;

    const existingRecordId = await getProductAirtableRecordIdByProductId(
      $,
      shopify,
      byHandle,
    );
    if (!existingRecordId || existingRecordId === recordId) return byHandle;
  }
  return null;
}

export async function getMetaobjectIdByHandle($, shopify, type, handle) {
  const data = await shopifyRequest($, shopify, {
    query: `query($handle: MetaobjectHandleInput!) {
      metaobjectByHandle(handle: $handle) { id }
    }`,
    variables: {handle: {type, handle}},
  });
  return data.metaobjectByHandle?.id ?? null;
}

async function findProductIdByAirtableRecordId($, shopify, recordId) {
  const products = await listFineArtPrintProducts($, shopify);
  return (
    products.find((product) => product.airtableRecordId === recordId)?.id ??
    null
  );
}

export async function getProductIdByAirtableId($, shopify, recordId) {
  if (!recordId) return null;

  const fromList = await findProductIdByAirtableRecordId($, shopify, recordId);
  if (fromList) return fromList;

  // Search index can return unrelated products — verify metafield value before matching.
  const mf = SHOPIFY.airtableMetafield;
  const data = await shopifyRequest($, shopify, {
    query: `query($query: String!) {
      products(first: 10, query: $query) {
        nodes {
          id
          airtableId: metafield(namespace: "${mf.namespace}", key: "${mf.key}") {
            value
          }
        }
      }
    }`,
    variables: {
      query: `metafields.${mf.namespace}.${mf.key}:${recordId}`,
    },
  });
  const match = (data.products?.nodes ?? []).find(
    (node) => node.airtableId?.value === recordId,
  );
  return match?.id ?? null;
}

export async function getProductIdByHandle($, shopify, handle) {
  const data = await shopifyRequest($, shopify, {
    query: `query($handle: String!) { productByHandle(handle: $handle) { id } }`,
    variables: {handle},
  });
  return data.productByHandle?.id ?? null;
}

async function getProductAirtableRecordIdByProductId($, shopify, productId) {
  const mf = SHOPIFY.airtableMetafield;
  const data = await shopifyRequest($, shopify, {
    query: `query($id: ID!) {
      product(id: $id) {
        airtableId: metafield(namespace: "${mf.namespace}", key: "${mf.key}") { value }
      }
    }`,
    variables: {id: productId},
  });
  return data.product?.airtableId?.value ?? null;
}

function isHandleInUseError(message) {
  return /handle.*already in use/i.test(message);
}

function airtableRecordIdFromProductInput(input) {
  const mf = SHOPIFY.airtableMetafield;
  const match = input.metafields?.find(
    (field) =>
      field.namespace === mf.namespace && field.key === mf.key && field.value,
  );
  return match?.value ?? null;
}

export async function getPublicationIds($, shopify) {
  const data = await shopifyRequest($, shopify, {
    query: `query { publications(first: 25) { nodes { id name } } }`,
  });
  const nodes = data.publications?.nodes ?? [];
  // Hydrogen/headless channels often use the store name (e.g. "The Long Look"), not
  // "Hydrogen" in the publication name — publish everywhere except POS.
  const wanted = nodes.filter((pub) => !/point of sale/i.test(pub.name));
  return wanted.map((pub) => pub.id);
}

export async function createFileFromUrl($, shopify, {url, alt}) {
  const data = await shopifyRequest($, shopify, {
    query: `mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id }
        userErrors { field message }
      }
    }`,
    variables: {
      files: [{alt, contentType: 'IMAGE', originalSource: url}],
    },
  });
  const errors = data.fileCreate?.userErrors ?? [];
  if (errors.length) throw new Error(`fileCreate: ${JSON.stringify(errors)}`);
  const fileId = data.fileCreate?.files?.[0]?.id;
  if (!fileId) throw new Error('fileCreate returned no file id');
  return fileId;
}

async function getMetaobjectFieldValue($, shopify, metaobjectId, fieldKey) {
  const data = await shopifyRequest($, shopify, {
    query: `query($id: ID!) {
      metaobject(id: $id) {
        field(key: "${fieldKey}") { value }
      }
    }`,
    variables: {id: metaobjectId},
  });
  return data.metaobject?.field?.value ?? null;
}

function isMissingMetaobjectFieldError(message) {
  return (
    /field.*does not exist/i.test(message) ||
    /key.*is not defined/i.test(message)
  );
}

async function syncArtistPortrait(
  $,
  shopify,
  {metaobjectId, name, handle, headshot, dryRun},
) {
  const artistFields = SHOPIFY.artistFields;
  if (dryRun) {
    return headshot
      ? {status: 'pending', dryRun: true, hasHeadshot: true}
      : {status: 'skipped', reason: 'No headshot'};
  }

  let storedSourceId = null;
  let trackSourceId = true;
  if (metaobjectId) {
    try {
      storedSourceId = await getMetaobjectFieldValue(
        $,
        shopify,
        metaobjectId,
        artistFields.portraitSourceId,
      );
    } catch {
      trackSourceId = false;
    }
  }

  let headshotChanged = headshot?.id !== storedSourceId;
  if (!trackSourceId && metaobjectId && headshot) {
    const existingPortrait = await getMetaobjectFieldValue(
      $,
      shopify,
      metaobjectId,
      artistFields.portrait,
    );
    if (existingPortrait) headshotChanged = false;
  }
  const portraitUpdates = [];

  if (headshot && headshotChanged) {
    const {prepareProductImageForShopify} = await import('./product-image.mjs');
    const upload = await prepareProductImageForShopify($, shopify, {
      sourceUrl: headshot.url,
      alt: name,
      handle: `artist-${handle}`,
    });
    const fileId = await createFileFromUrl($, shopify, {
      url: upload.resourceUrl,
      alt: name,
    });
    portraitUpdates.push({key: artistFields.portrait, value: fileId});
    if (trackSourceId) {
      portraitUpdates.push({
        key: artistFields.portraitSourceId,
        value: headshot.id,
      });
    }
    return {status: 'synced', portraitUpdates, imageOptimized: true};
  }

  if (!headshot && storedSourceId) {
    portraitUpdates.push({key: artistFields.portrait, value: ''});
    if (trackSourceId) {
      portraitUpdates.push({key: artistFields.portraitSourceId, value: ''});
    }
    return {status: 'synced', portraitUpdates, cleared: true};
  }

  return {
    status: 'skipped',
    reason: headshot ? 'Headshot unchanged' : 'No headshot',
  };
}

function isMissingAirtableFieldError(errors) {
  const text = JSON.stringify(errors ?? []);
  return (
    /airtable_record_id.*does not exist/i.test(text) ||
    /record_id.*does not exist/i.test(text)
  );
}

function stripAirtableRecordId(fields) {
  const fieldKey = SHOPIFY.airtableRecordIdField;
  return fields.filter((field) => field.key !== fieldKey);
}

const metaobjectAirtableFieldSupported = new Map();

async function upsertMetaobject(
  $,
  shopify,
  {type, handle, stableHandle, fields, airtableRecordId, existingId},
) {
  const resolvedId =
    existingId ??
    (await resolveMetaobjectId($, shopify, type, {
      recordId: airtableRecordId,
      handle,
    }));
  const fallbackHandle = stableHandle ?? handle;
  const mutationHandle =
    metaobjectAirtableFieldSupported.get(type) === false
      ? fallbackHandle
      : handle;

  const runMutation = async (mutationHandleValue, mutationFields) => {
    if (resolvedId) {
      const data = await shopifyRequest($, shopify, {
        query: `mutation($id: ID!, $metaobject: MetaobjectUpdateInput!) {
          metaobjectUpdate(id: $id, metaobject: $metaobject) {
            metaobject { id handle }
            userErrors { field message }
          }
        }`,
        variables: {
          id: resolvedId,
          metaobject: {handle: mutationHandleValue, fields: mutationFields},
        },
      });
      const errors = data.metaobjectUpdate?.userErrors ?? [];
      if (errors.length)
        throw new Error(`metaobjectUpdate: ${JSON.stringify(errors)}`);
      return data.metaobjectUpdate.metaobject;
    }

    const data = await shopifyRequest($, shopify, {
      query: `mutation($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject { id handle }
          userErrors { field message }
        }
      }`,
      variables: {
        metaobject: {type, handle: mutationHandleValue, fields: mutationFields},
      },
    });
    const errors = data.metaobjectCreate?.userErrors ?? [];
    if (errors.length)
      throw new Error(`metaobjectCreate: ${JSON.stringify(errors)}`);
    return data.metaobjectCreate.metaobject;
  };

  const payloadFields = airtableRecordId
    ? withAirtableRecordId(fields, airtableRecordId)
    : fields;

  try {
    const metaobject = await runMutation(mutationHandle, payloadFields);
    if (airtableRecordId) metaobjectAirtableFieldSupported.set(type, true);
    return metaobject;
  } catch (error) {
    const message = String(error.message);
    if (!airtableRecordId || !isMissingAirtableFieldError(message)) throw error;

    metaobjectAirtableFieldSupported.set(type, false);
    return runMutation(fallbackHandle, stripAirtableRecordId(fields));
  }
}

export function buildProductInput({
  title,
  description,
  imageUrl,
  includeImage = Boolean(imageUrl),
  pictureSourceId,
  productId,
  catalog,
  vendor,
  handle,
  airtableRecordId,
  artistRecordId,
  collectionRecordIds = [],
  collectionHandles = [],
}) {
  const sizeNames = [...new Set(catalog.map((v) => v.sizeName))].sort(
    (a, b) => {
      const rankA = catalog.find((v) => v.sizeName === a)?.rank ?? 999;
      const rankB = catalog.find((v) => v.sizeName === b)?.rank ?? 999;
      return rankA - rankB;
    },
  );
  const frameNames = ['Black', 'White', 'No Frame'].filter((name) =>
    catalog.some((v) => v.frame === name),
  );
  const mountNames = ['Border', 'Full Bleed'].filter((name) =>
    catalog.some((v) => v.mount === name),
  );
  const mf = SHOPIFY.metafields;
  const sizingMap = buildCanonicalSizeSizingMap(catalog);
  const productMetafields = [];
  if (airtableRecordId) {
    productMetafields.push(productAirtableMetafield(airtableRecordId));
  }
  if (artistRecordId) {
    productMetafields.push({
      namespace: mf.namespace,
      key: mf.artistRecordId,
      type: 'single_line_text_field',
      value: artistRecordId,
    });
  }
  productMetafields.push({
    namespace: mf.namespace,
    key: mf.collectionRecordIds,
    type: 'json',
    value: JSON.stringify(collectionRecordIds),
  });
  productMetafields.push({
    namespace: mf.namespace,
    key: mf.collectionHandles,
    type: 'json',
    value: JSON.stringify(collectionHandles),
  });
  if (pictureSourceId) {
    productMetafields.push({
      namespace: mf.namespace,
      key: mf.pictureSourceId,
      type: 'single_line_text_field',
      value: pictureSourceId,
    });
  }

  const input = {
    title,
    handle,
    descriptionHtml: description ? `<p>${description}</p>` : undefined,
    vendor,
    productType: SHOPIFY.productType,
    status: 'ACTIVE',
    metafields: productMetafields.length ? productMetafields : undefined,
    productOptions: [
      {name: 'Size', values: sizeNames.map((name) => ({name}))},
      {name: 'Frame', values: frameNames.map((name) => ({name}))},
      {name: 'Mount', values: mountNames.map((name) => ({name}))},
    ],
    variants: catalog.map((variant) => ({
      optionValues: [
        {optionName: 'Size', name: variant.sizeName},
        {optionName: 'Frame', name: variant.frame},
        {optionName: 'Mount', name: variant.mount},
      ],
      price: variant.price,
      inventoryPolicy: 'CONTINUE',
      metafields: buildVariantMetafields(variant, sizingMap),
    })),
  };

  if (includeImage && imageUrl) {
    input.files = [
      {originalSource: imageUrl, alt: title, contentType: 'IMAGE'},
    ];
  }

  if (productId) input.id = productId;
  return input;
}

export function variantSelectionKey({sizeName, frame, mount}) {
  return [sizeName, frame, mount].join('|||');
}

export function selectedOptionsKey(selectedOptions) {
  const byName = Object.fromEntries(
    (selectedOptions ?? []).map((option) => [option.name, option.value]),
  );
  return [byName.Size, byName.Frame, byName.Mount].join('|||');
}

export function buildVariantMetafields(variant, sizingMap) {
  const mf = SHOPIFY.metafields;
  const airtableMf = SHOPIFY.airtableMetafield;
  const sizing = canonicalVariantMetafieldSizing(variant, sizingMap);
  const fields = [
    {
      namespace: mf.namespace,
      key: mf.shortInches,
      type: 'number_decimal',
      value: String(sizing.shortSide),
    },
    {
      namespace: mf.namespace,
      key: mf.longInches,
      type: 'number_decimal',
      value: String(sizing.longSide),
    },
    {
      namespace: mf.namespace,
      key: mf.paddingInches,
      type: 'number_decimal',
      value: String(sizing.referencePadding),
    },
    {
      namespace: mf.namespace,
      key: mf.frameWidthInches,
      type: 'number_decimal',
      value: String(sizing.frameWidth),
    },
    {
      namespace: mf.namespace,
      key: mf.rank,
      type: 'number_integer',
      value: String(sizing.rank),
    },
  ];

  if (variant.recordId) {
    fields.push({
      namespace: airtableMf.namespace,
      key: airtableMf.key,
      type: 'single_line_text_field',
      value: variant.recordId,
    });
  }

  return fields;
}

async function listProductVariants($, shopify, productId) {
  const variants = [];
  let cursor = null;

  do {
    const data = await shopifyRequest($, shopify, {
      query: `query($id: ID!, $cursor: String) {
        product(id: $id) {
          variants(first: 100, after: $cursor) {
            nodes {
              id
              price
              selectedOptions { name value }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }`,
      variables: {id: productId, cursor},
    });

    variants.push(...(data.product?.variants?.nodes ?? []));
    const pageInfo = data.product?.variants?.pageInfo;
    cursor = pageInfo?.hasNextPage ? pageInfo.endCursor : null;
  } while (cursor);

  return variants;
}

/** Refresh variant prices and print dimension metafields from the Airtable catalog. */
export async function updateProductVariantCatalog(
  $,
  shopify,
  {productId, catalog},
) {
  const existingVariants = await listProductVariants($, shopify, productId);
  const variantsByKey = new Map(
    existingVariants.map((variant) => [
      selectedOptionsKey(variant.selectedOptions),
      variant,
    ]),
  );

  const bulkInputs = [];
  const metafieldInputs = [];
  const missingKeys = [];
  const sizingMap = buildCanonicalSizeSizingMap(catalog);

  for (const catalogVariant of catalog) {
    const key = variantSelectionKey(catalogVariant);
    const existingVariant = variantsByKey.get(key);
    if (!existingVariant) {
      missingKeys.push(key);
      continue;
    }

    bulkInputs.push({
      id: existingVariant.id,
      price: catalogVariant.price,
      inventoryPolicy: 'CONTINUE',
    });

    for (const field of buildVariantMetafields(catalogVariant, sizingMap)) {
      metafieldInputs.push({
        ownerId: existingVariant.id,
        ...field,
      });
    }
  }

  if (bulkInputs.length) {
    const data = await shopifyRequest($, shopify, {
      query: `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id }
          userErrors { field message }
        }
      }`,
      variables: {productId, variants: bulkInputs},
    });
    const errors = data.productVariantsBulkUpdate?.userErrors ?? [];
    if (errors.length) {
      throw new Error(`productVariantsBulkUpdate: ${JSON.stringify(errors)}`);
    }
  }

  for (let index = 0; index < metafieldInputs.length; index += 25) {
    const chunk = metafieldInputs.slice(index, index + 25);
    const data = await shopifyRequest($, shopify, {
      query: `mutation($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id }
          userErrors { field message }
        }
      }`,
      variables: {metafields: chunk},
    });
    const errors = data.metafieldsSet?.userErrors ?? [];
    if (errors.length)
      throw new Error(`metafieldsSet: ${JSON.stringify(errors)}`);
  }

  return {
    updatedVariants: bulkInputs.length,
    missingVariants: missingKeys.length,
    missingKeys,
  };
}

/** Apply scalar product fields (title, handle, description, vendor) on an existing row. */
async function updateProductScalars(
  $,
  shopify,
  {productId, title, handle, descriptionHtml, vendor},
) {
  const data = await shopifyRequest($, shopify, {
    query: `mutation($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        product { id handle title }
        userErrors { field message }
      }
    }`,
    variables: {
      product: {
        id: productId,
        title,
        handle,
        descriptionHtml,
        vendor,
      },
    },
  });
  const errors = data.productUpdate?.userErrors ?? [];
  if (errors.length)
    throw new Error(`productUpdate: ${JSON.stringify(errors)}`);
  return data.productUpdate.product;
}

/** Force sync metafields on an existing product (Airtable id + artist/collection links). */
async function updateProductSyncMetafields(
  $,
  shopify,
  {
    productId,
    airtableRecordId,
    artistRecordId,
    collectionRecordIds = [],
    collectionHandles = [],
  },
) {
  const mf = SHOPIFY.metafields;
  const airtableMf = SHOPIFY.airtableMetafield;
  const metafields = [
    {
      namespace: airtableMf.namespace,
      key: airtableMf.key,
      type: 'single_line_text_field',
      value: airtableRecordId,
    },
    {
      namespace: mf.namespace,
      key: mf.collectionRecordIds,
      type: 'json',
      value: JSON.stringify(collectionRecordIds),
    },
    {
      namespace: mf.namespace,
      key: mf.collectionHandles,
      type: 'json',
      value: JSON.stringify(collectionHandles),
    },
  ];

  if (artistRecordId) {
    metafields.push({
      namespace: mf.namespace,
      key: mf.artistRecordId,
      type: 'single_line_text_field',
      value: artistRecordId,
    });
  }

  const data = await shopifyRequest($, shopify, {
    query: `mutation($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id key namespace }
        userErrors { field message }
      }
    }`,
    variables: {
      metafields: metafields.map((field) => ({
        ownerId: productId,
        ...field,
      })),
    },
  });
  const errors = data.metafieldsSet?.userErrors ?? [];
  if (errors.length)
    throw new Error(`metafieldsSet: ${JSON.stringify(errors)}`);
}

export async function upsertProduct($, shopify, input) {
  const productId = input.id ?? null;
  const run = async (productInput) => {
    const data = await shopifyRequest($, shopify, {
      query: `mutation($input: ProductSetInput!, $sync: Boolean!) {
        productSet(synchronous: $sync, input: $input) {
          product { id handle title variantsCount { count } }
          userErrors { field message }
        }
      }`,
      variables: {sync: true, input: productInput},
    });
    const errors = data.productSet?.userErrors ?? [];
    if (errors.length) throw new Error(`productSet: ${JSON.stringify(errors)}`);
    return data.productSet.product;
  };

  const runWithHandleFallback = async (productInput) => {
    try {
      return await run(productInput);
    } catch (error) {
      const message = String(error.message);
      const airtableRecordId = airtableRecordIdFromProductInput(productInput);
      if (
        !productId &&
        airtableRecordId &&
        isHandleInUseError(message) &&
        productInput.handle !== airtableStableHandle(airtableRecordId)
      ) {
        return run({
          ...productInput,
          handle: airtableStableHandle(airtableRecordId),
        });
      }
      throw error;
    }
  };

  try {
    const product = await runWithHandleFallback(input);
    if (productId) {
      await updateProductScalars($, shopify, {
        productId: product.id,
        title: input.title,
        handle: input.handle,
        descriptionHtml: input.descriptionHtml,
        vendor: input.vendor,
      });
    }
    return product;
  } catch (error) {
    const message = String(error.message);
    if (!input.metafields?.length || !isMissingAirtableFieldError(message))
      throw error;
    const {metafields, ...rest} = input;
    const product = await runWithHandleFallback(rest);
    if (productId) {
      await updateProductScalars($, shopify, {
        productId: product.id,
        title: rest.title,
        handle: rest.handle,
        descriptionHtml: rest.descriptionHtml,
        vendor: rest.vendor,
      });
    }
    return product;
  }
}

export async function publishProduct($, shopify, productId, publicationIds) {
  if (!publicationIds.length) return;
  const data = await shopifyRequest($, shopify, {
    query: `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    variables: {
      id: productId,
      input: publicationIds.map((publicationId) => ({publicationId})),
    },
  });
  const errors = data.publishablePublish?.userErrors ?? [];
  if (errors.length)
    throw new Error(`publishablePublish: ${JSON.stringify(errors)}`);
}

// ─── Entity sync ──────────────────────────────────────────────────────────────

export async function syncArtist($, shopify, record, dryRun) {
  const f = AIRTABLE.artists;
  const fields = record.fields ?? {};
  const name = textValue(fields[f.name]);
  if (!name)
    return {recordId: record.id, status: 'skipped', reason: 'Missing name'};

  const displayHandle = slugify(name);
  const stableHandle = airtableStableHandle(record.id);
  const bio = plainText(fields[f.description]);
  const location = textValue(fields[f.hometown]);
  const headshot = attachmentInfo(fields[f.headshot]);

  if (dryRun) {
    return {
      recordId: record.id,
      status: 'pending',
      dryRun: true,
      handle: displayHandle,
      stableHandle,
      name,
      hasHeadshot: Boolean(headshot),
    };
  }

  const resolved = await resolveMetaobjectForSync($, shopify, 'artist', {
    recordId: record.id,
    displayName: name,
  });

  const portraitResult = await syncArtistPortrait($, shopify, {
    metaobjectId: resolved.id,
    name,
    handle: displayHandle,
    headshot,
    dryRun,
  });

  const metaFields = [{key: 'name', value: name}];
  if (bio) metaFields.push({key: 'bio', value: bio});
  if (location) metaFields.push({key: 'location', value: location});
  if (portraitResult.portraitUpdates?.length) {
    metaFields.push(...portraitResult.portraitUpdates);
  }

  let metaobject;
  try {
    metaobject = await upsertMetaobject($, shopify, {
      type: 'artist',
      handle: displayHandle,
      stableHandle,
      airtableRecordId: record.id,
      fields: metaFields,
      existingId: resolved.id,
    });
  } catch (error) {
    if (
      !portraitResult.portraitUpdates?.length ||
      !isMissingMetaobjectFieldError(String(error.message))
    ) {
      throw error;
    }

    const fallbackFields = metaFields.filter(
      (field) => field.key !== SHOPIFY.artistFields.portraitSourceId,
    );
    metaobject = await upsertMetaobject($, shopify, {
      type: 'artist',
      handle: displayHandle,
      stableHandle,
      airtableRecordId: record.id,
      fields: fallbackFields,
      existingId: resolved.id,
    });
  }

  return {
    recordId: record.id,
    status: 'synced',
    mode: resolved.id ? 'updated' : 'created',
    handle: metaobject.handle,
    name,
    shopifyId: metaobject.id,
    portrait: portraitResult.status === 'synced' ? portraitResult : undefined,
  };
}

export async function syncCollection($, shopify, record, dryRun) {
  const f = AIRTABLE.collections;
  const fields = record.fields ?? {};
  const title = textValue(fields[f.name]);
  if (!title)
    return {recordId: record.id, status: 'skipped', reason: 'Missing name'};

  const displayHandle = slugify(title);
  const stableHandle = airtableStableHandle(record.id);
  const description = plainText(fields[f.description]);

  if (dryRun) {
    return {
      recordId: record.id,
      status: 'pending',
      dryRun: true,
      handle: displayHandle,
      stableHandle,
      title,
    };
  }

  const metaFields = [{key: 'title', value: title}];
  if (description) metaFields.push({key: 'description', value: description});

  const resolved = await resolveMetaobjectForSync($, shopify, 'collection', {
    recordId: record.id,
    displayName: title,
  });
  const metaobject = await upsertMetaobject($, shopify, {
    type: 'collection',
    handle: displayHandle,
    stableHandle,
    airtableRecordId: record.id,
    fields: metaFields,
    existingId: resolved.id,
  });

  const {ensureNativeEditorialCollection} =
    await import('./native-collections.mjs');
  const nativeCollection = await ensureNativeEditorialCollection($, shopify, {
    title,
    handle: metaobject.handle,
    description,
    airtableRecordId: record.id,
  });

  return {
    recordId: record.id,
    status: 'synced',
    mode: resolved.id ? 'updated' : 'created',
    handle: metaobject.handle,
    title,
    shopifyId: metaobject.id,
    nativeCollectionId: nativeCollection.id,
  };
}

export async function listQueuedArtists($, airtable) {
  return listQueuedRecords($, airtable, 'artists');
}

export async function listQueuedCollections($, airtable) {
  return listQueuedRecords($, airtable, 'collections');
}

export async function listQueuedPrints($, airtable) {
  const records = await listQueuedRecords($, airtable, 'prints');
  return records.map(normalizePrintRecord);
}

/** Sync artists and collections marked Queued in Airtable (including those with no prints). */
export async function syncQueuedArtistsAndCollections(
  $,
  airtable,
  shopify,
  dryRun,
) {
  const [artists, collections] = await Promise.all([
    listQueuedArtists($, airtable),
    listQueuedCollections($, airtable),
  ]);

  const concurrency = getSyncConcurrency();

  const [artistResults, collectionResults] = await Promise.all([
    mapWithConcurrency(artists, concurrency, async (record) => {
      await markRecordProcessing($, airtable, {
        tableKey: 'artists',
        statusField: AIRTABLE.artists.status,
        recordId: record.id,
        currentStatus: record.fields?.[AIRTABLE.artists.status],
        dryRun,
      });
      const result = await syncArtist($, shopify, record, dryRun);
      if (result.status === 'synced') {
        await markRecordCommitted($, airtable, {
          tableKey: 'artists',
          statusField: AIRTABLE.artists.status,
          recordId: record.id,
          currentStatus: AIRTABLE.processingStatus,
          committedStatus: AIRTABLE.committedStatus,
          dryRun,
        });
      }
      return result;
    }),
    mapWithConcurrency(collections, concurrency, async (record) => {
      await markRecordProcessing($, airtable, {
        tableKey: 'collections',
        statusField: AIRTABLE.collections.status,
        recordId: record.id,
        currentStatus: record.fields?.[AIRTABLE.collections.status],
        dryRun,
      });
      const result = await syncCollection($, shopify, record, dryRun);
      if (result.status === 'synced') {
        await markRecordCommitted($, airtable, {
          tableKey: 'collections',
          statusField: AIRTABLE.collections.status,
          recordId: record.id,
          currentStatus: AIRTABLE.processingStatus,
          committedStatus: AIRTABLE.committedStatus,
          dryRun,
        });
      }
      return result;
    }),
  ]);

  return {
    artists: artistResults,
    collections: collectionResults,
    artistCount: artistResults.length,
    collectionCount: collectionResults.length,
  };
}

export async function syncPrint(
  $,
  {
    shopify,
    record,
    catalog,
    artistNameByRecordId,
    collectionHandleByRecordId = new Map(),
    publicationIds,
    shippingPackageRegistry,
    dryRun,
    forceImageResync = false,
  },
) {
  const f = AIRTABLE.prints;
  const fields = record.fields ?? {};
  const title = textValue(fields[f.name]);
  const handle = slugify(title);
  const description = plainText(fields[f.description]);
  const picture = attachmentInfo(fields[f.image]);

  if (!title)
    return {recordId: record.id, status: 'skipped', reason: 'Missing name'};
  if (!picture)
    return {recordId: record.id, status: 'skipped', reason: 'Missing picture'};

  const artistRecordId = linkedRecordIds(fields[f.artist])[0];
  if (!artistRecordId || !artistNameByRecordId.has(artistRecordId)) {
    return {
      recordId: record.id,
      status: 'skipped',
      reason: 'Missing or unsynced artist',
    };
  }

  const collectionRecordIds = linkedRecordIds(fields[f.collection]);
  const collectionHandles = collectionRecordIds
    .map((id) => collectionHandleByRecordId.get(id))
    .filter(Boolean);

  if (dryRun) {
    return {
      recordId: record.id,
      status: 'pending',
      dryRun: true,
      handle,
      title,
      artistRecordId,
      collectionRecordIds,
      variantCount: catalog.length,
      collectionCount: collectionRecordIds.length,
    };
  }

  const vendor = artistNameByRecordId.get(artistRecordId) ?? 'The Long Look';
  const productId = await resolveProductId($, shopify, {
    recordId: record.id,
    handle,
  });

  const {getProductPictureSourceId, prepareProductImageForShopify} =
    await import('./product-image.mjs');

  let imageUpload = null;
  const storedPictureSourceId = productId
    ? await getProductPictureSourceId($, shopify, productId)
    : null;
  const pictureChanged = storedPictureSourceId !== picture.id;

  if (!productId || pictureChanged || forceImageResync) {
    imageUpload = await prepareProductImageForShopify($, shopify, {
      sourceUrl: picture.url,
      alt: title,
      handle,
    });
  }

  const productInput = buildProductInput({
    title,
    description,
    imageUrl: imageUpload?.resourceUrl,
    includeImage: Boolean(imageUpload),
    pictureSourceId: imageUpload ? picture.id : undefined,
    productId,
    catalog,
    vendor,
    handle,
    airtableRecordId: record.id,
    artistRecordId,
    collectionRecordIds,
    collectionHandles,
  });

  const product = await upsertProduct($, shopify, productInput);
  await updateProductSyncMetafields($, shopify, {
    productId: product.id,
    airtableRecordId: record.id,
    artistRecordId,
    collectionRecordIds,
    collectionHandles,
  });
  const variantSync = await updateProductVariantCatalog($, shopify, {
    productId: product.id,
    catalog,
  });
  if (variantSync.missingVariants > 0) {
    throw new Error(
      `Variant catalog mismatch for ${record.id}: missing ${variantSync.missingVariants} variant(s) (${variantSync.missingKeys.slice(0, 3).join(', ')})`,
    );
  }

  let shippingAssignment = null;
  if (shippingPackageRegistry && !dryRun) {
    const {assignProductVariantShippingPackages} =
      await import('./shipping-packages.mjs');
    shippingAssignment = await assignProductVariantShippingPackages(
      $,
      shopify,
      {
        productId: product.id,
        catalog,
        registry: shippingPackageRegistry,
      },
    );
  }

  await publishProduct($, shopify, product.id, publicationIds);

  const {syncProductNativeCollectionMembership} =
    await import('./native-collections.mjs');
  const nativeMembership = await syncProductNativeCollectionMembership(
    $,
    shopify,
    {
      productId: product.id,
      collectionRecordIds,
      collectionHandleByRecordId: collectionHandleByRecordId,
    },
  );

  return {
    recordId: record.id,
    status: 'synced',
    mode: productId ? 'updated' : 'created',
    handle,
    title,
    imageOptimized: Boolean(imageUpload),
    imageBytes: imageUpload?.byteLength,
    artistRecordId,
    collectionRecordIds,
    productId: product.id,
    variantCount: variantSync.updatedVariants,
    shippingPackagesAssigned: shippingAssignment?.assigned ?? 0,
    collectionCount: collectionRecordIds.length,
    nativeCollectionsAdded: nativeMembership.added,
    nativeCollectionsRemoved: nativeMembership.removed,
  };
}
