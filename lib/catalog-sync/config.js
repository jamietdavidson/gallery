/**
 * Airtable → Shopify catalog sync config.
 * https://airtable.com/appC7O4qp56Rdaj7c
 */

export const AIRTABLE = {
  baseId: 'appC7O4qp56Rdaj7c',
  baseName: 'Operations',
  printsTable: 'Prints',
  printsTableId: 'tblcFW8sQcKON8zW4',
  variantsTable: 'Variants',
  variantsTableId: 'tblfD4UD5OCMI99nN',
  artistsTable: 'Artists',
  artistsTableId: 'tblPmfI2BWIUSzKBU',
  collectionsTable: 'Collections',
  collectionsTableId: 'tblo70cnCHTLuBnki',
  statuses: {
    pending: 'Pending',
    modified: 'Modified',
    queued: 'Queued',
    processing: 'Processing',
    committed: 'Committed',
  },
  queuedStatus: 'Queued',
  processingStatus: 'Processing',
  committedStatus: 'Committed',
  prints: {
    name: 'Name',
    description: 'Description',
    image: 'Picture',
    artist: 'Artist',
    collection: 'Collection',
    orientation: 'Orientation',
    status: 'Status',
  },
  variants: {
    sizeName: 'Name',
    frame: 'Frame',
    shortSide: 'Print: Short"',
    longSide: 'Print: Long"',
    padding: 'Padding: Width"',
    frameWidth: 'Frame: Width"',
    salePrice: 'Sale Price',
    rank: 'Rank',
    status: 'Status',
    predictedWeight: 'Predicted Weight (lb)',
  },
  artists: {
    name: 'Name',
    description: 'Description',
    hometown: 'Hometown',
    headshot: 'Headshot',
    status: 'Status',
  },
  collections: {
    name: 'Name',
    description: 'Decsription',
    status: 'Status',
  },
};

export const SHOPIFY = {
  shopDomain: 'thelonglookco.myshopify.com',
  apiVersion: '2025-01',
  productType: 'Fine Art Print',
  productOptions: {
    size: 'Size',
    frame: 'Frame',
    mount: 'Mount',
  },
  metafields: {
    namespace: 'print',
    shortInches: 'short_inches',
    longInches: 'long_inches',
    /**
     * Border mat width for the size tier (picture-lock reference).
     * Same value on every variant for a size — including Full Bleed.
     * Mount is expressed by the Mount option, not by zeroing this field.
     */
    paddingInches: 'padding_inches',
    /**
     * Moulding width for the size tier (picture-lock reference).
     * Same value on every framed variant for a size; 0 only on No Frame rows.
     */
    frameWidthInches: 'frame_width_inches',
    rank: 'rank',
    collectionHandles: 'collection_handles',
    artistRecordId: 'artist_record_id',
    collectionRecordIds: 'collection_record_ids',
    shippingPackageRegistry: 'shipping_package_registry',
    /** Airtable attachment id — skip re-uploading when unchanged. */
    pictureSourceId: 'picture_source_id',
  },
  metaobjectTypes: {
    artist: 'artist',
    collection: 'collection',
    picture: 'picture',
  },
  artistFields: {
    portrait: 'portrait',
    /** Airtable Headshot attachment id — skip re-uploading when unchanged. */
    portraitSourceId: 'portrait_source_id',
  },
  /** Metaobject field + product metafield for stable Airtable ↔ Shopify linking across renames. */
  airtableRecordIdField: 'airtable_record_id',
  airtableMetafield: {
    namespace: 'airtable',
    key: 'record_id',
  },
};

/** Catalog sync runtime tuning (env-overridable). */
export const SYNC = {
  /** Max parallel Shopify/Airtable operations per job (default 5, max 20). */
  concurrency: (() => {
    const parsed = Number(process.env.SYNC_CONCURRENCY);
    if (!Number.isFinite(parsed) || parsed < 1) return 5;
    return Math.min(20, Math.floor(parsed));
  })(),
  /** Min ms between deletion prune runs (default 5 min). */
  deletionPollIntervalMs: (() => {
    const parsed = Number(process.env.DELETION_POLL_INTERVAL_MS);
    if (!Number.isFinite(parsed) || parsed < 60_000) return 300_000;
    return Math.floor(parsed);
  })(),
};
