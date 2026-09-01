import {AIRTABLE} from './config.js';
import {getSyncConcurrency, mapWithConcurrency} from './concurrency.mjs';
import {
  assignProductVariantShippingPackages,
  ensureShippingPackages,
  readShippingPackageRegistry,
} from './shipping-packages.mjs';
import {syncCatalogToAllProducts} from './variant-catalog.mjs';
import {
  fetchLiveVariantCatalog,
  listQueuedVariants,
  markRecordCommitted,
  markRecordProcessing,
  recoverStuckProcessingVariants,
  updateTableRecord,
} from './utils.js';

/**
 * Sync Queued variant rows: shipping packages, all print products, then mark Committed.
 */
export async function runVariantCatalogSync(clients, {dryRun = false} = {}) {
  const {$, airtable, shopify} = clients;

  const recovered = await recoverStuckProcessingVariants($, airtable, {dryRun});
  if (recovered.recovered > 0) {
    console.log(
      `[variant-sync] recovered ${recovered.recovered} stuck Processing row(s) → Queued`,
    );
  }

  const queuedRecords = await listQueuedVariants($, airtable);

  if (!queuedRecords.length) {
    return {
      skipped: true,
      reason: 'No queued variants',
      queuedCount: 0,
      recoveredCount: recovered.recovered,
    };
  }

  const processingStatuses = await mapWithConcurrency(
    queuedRecords,
    getSyncConcurrency(),
    (record) =>
      markRecordProcessing($, airtable, {
        tableKey: 'variants',
        statusField: AIRTABLE.variants.status,
        recordId: record.id,
        currentStatus: record.fields?.[AIRTABLE.variants.status],
        dryRun,
      }),
  );

  try {
    const catalog = await fetchLiveVariantCatalog($, airtable);
    if (!catalog.length) {
      throw new Error('No complete variant rows found (Committed or Queued).');
    }

    const shippingPackages = await ensureShippingPackages($, shopify, catalog, {dryRun});
    const productSync = await syncCatalogToAllProducts($, shopify, catalog, {dryRun});

    if (!dryRun) {
      const registry =
        shippingPackages.registry ?? (await readShippingPackageRegistry($, shopify));
      const concurrency = getSyncConcurrency();

      await mapWithConcurrency(productSync.products, concurrency, (product) =>
        assignProductVariantShippingPackages($, shopify, {
          productId: product.id,
          catalog,
          registry,
        }),
      );
    }

    const commitStatuses = await mapWithConcurrency(
      queuedRecords,
      getSyncConcurrency(),
      (record) =>
        markRecordCommitted($, airtable, {
          tableKey: 'variants',
          statusField: AIRTABLE.variants.status,
          recordId: record.id,
          currentStatus: AIRTABLE.processingStatus,
          committedStatus: AIRTABLE.committedStatus,
          dryRun,
        }),
    );

    return {
      queuedCount: queuedRecords.length,
      catalogSize: catalog.length,
      shippingPackages,
      products: productSync,
      processingStatuses,
      commitStatuses,
      recoveredCount: recovered.recovered,
      dryRun,
    };
  } catch (error) {
    if (!dryRun) {
      await mapWithConcurrency(queuedRecords, getSyncConcurrency(), (record) =>
        updateTableRecord($, airtable, 'variants', record.id, {
          [AIRTABLE.variants.status]: AIRTABLE.queuedStatus,
        }),
      );
    }
    throw error;
  }
}
