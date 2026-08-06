import {Link} from 'react-router';
import {useEffect, useState} from 'react';
import {motion, useReducedMotion} from 'framer-motion';
import {Money} from '@shopify/hydrogen';
import {FavoriteButton} from '~/components/FavoriteButton';
import {HeroVideoBackground} from '~/components/HeroVideoBackground';
import {PaginatedResourceSection} from '~/components/PaginatedResourceSection';
import {FramedPicture} from '~/components/FramedPicture';
import {
  FRAMED_PICTURE_IMAGE_SIZES,
  FramedPictureWall,
} from '~/components/FramedPictureWall';
import {
  FRAMED_PICTURE_CATALOG_DISPLAY_SIZE,
  FRAMED_PICTURE_GRID_CONTAINER_FILL,
  getCatalogFramedPictureSpec,
} from '~/lib/framed-picture';
import {cn} from '~/lib/utils';
import {type} from '~/lib/typography';
import {printPath, printsPath, artistPath} from '~/lib/paths';
import {
  getPrintLinkState,
  warmPrintDetailFromCard,
} from '~/lib/warm-print-detail';
import {cachePrintCatalogCards} from '~/lib/print-product-client-cache';
import {usePrintCardWarmup} from '~/lib/use-print-card-warmup';
import {useProgressiveVisibleCount} from '~/lib/use-progressive-visible-count';

export const printGridClassName =
  'grid w-full gap-1 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 min-[100rem]:grid-cols-4';

/** Three columns max — single column on mobile, three from tablet up. */
export const printGridThreeColumnClassName =
  'grid w-full gap-px grid-cols-1 md:grid-cols-3';

/** Split-layout catalog grid — Shop all, More like this, etc. */
export const printCatalogGridProps = {
  gridClassName: printGridThreeColumnClassName,
  cardLayout: 'split',
};

/** Reduced wall padding for catalog grid cards. */
export const printGridWallClassName = 'px-2 pt-3 pb-2';

/** Minimal inset inside split-layout image wells. */
export const printGridSplitWellClassName = 'p-0';

/** @typedef {'default' | 'compact'} ProductCardSize */
/** @typedef {'integrated' | 'split'} ProductCardLayout */

/**
 * @param {{
 *   product: import('~/lib/content-api').PictureCard & {
 *     priceRange: {minVariantPrice: {amount: string; currencyCode: string}};
 *   };
 *   loading?: 'eager' | 'lazy';
 *   className?: string;
 *   wallClassName?: string;
 *   splitWellClassName?: string;
 *   textAlign?: 'left' | 'center';
 *   showPrice?: boolean;
 *   size?: ProductCardSize;
 *   layout?: ProductCardLayout;
 *   containerFill?: number;
 * }}
 */
export function ProductCard({
  product,
  loading = 'lazy',
  className,
  wallClassName,
  splitWellClassName,
  textAlign = 'center',
  showPrice = true,
  size = 'default',
  layout = 'integrated',
  containerFill = FRAMED_PICTURE_GRID_CONTAINER_FILL,
}) {
  if (layout === 'split') {
    return (
      <SplitProductCard
        product={product}
        loading={loading}
        className={className}
        textAlign={textAlign}
        showPrice={showPrice}
        size={size}
        containerFill={containerFill}
        splitWellClassName={splitWellClassName}
      />
    );
  }

  const variantUrl = printPath(product.handle);
  const isCompact = size === 'compact';
  const [hovered, setHovered] = useState(false);
  const catalogFramedSpec = getCatalogFramedPictureSpec(product);
  const warmupRef = usePrintCardWarmup(product);

  const warmDetailImage = () => {
    warmPrintDetailFromCard(product, warmupRef.current);
  };

  return (
    <article ref={warmupRef} className={cn('block h-full w-full', className)}>
      <div
        className="relative"
        onMouseEnter={() => {
          setHovered(true);
          warmDetailImage();
        }}
        onMouseLeave={() => setHovered(false)}
        onPointerDown={warmDetailImage}
      >
        <Link
          to={variantUrl}
          prefetch="viewport"
          state={getPrintLinkState(product)}
          onMouseEnter={warmDetailImage}
          onFocus={warmDetailImage}
          onClick={warmDetailImage}
          className="block"
        >
          <FramedPictureWall
            variant="gridCard"
            className={cn(isCompact && 'px-3 pt-6 pb-4', wallClassName)}
          >
            <div className="flex w-full flex-1 items-center justify-center">
              <FramedPicture
                image={product.featuredImage}
                alt={product.title}
                size={catalogFramedSpec}
                loading={loading}
                sizes={FRAMED_PICTURE_IMAGE_SIZES.grid}
                containerFill={containerFill}
                hovered={hovered}
                interactive
              />
            </div>
          </FramedPictureWall>
        </Link>
        <FavoriteButton
          productId={product.id}
          className="absolute right-3 bottom-3 z-10"
        />
      </div>
      <div
        className={cn(
          'flex flex-col',
          isCompact ? 'px-2 pt-3 pb-4' : 'px-2.5 pt-3.5 pb-6',
          textAlign === 'center'
            ? 'items-center text-center'
            : 'items-start text-left',
        )}
      >
        <ProductCardContent
          product={product}
          showPrice={showPrice}
          size={size}
        />
      </div>
    </article>
  );
}

/**
 * House of Spoils–style card: fixed-aspect image well + caption block below.
 * @param {Omit<Parameters<typeof ProductCard>[0], 'layout' | 'wallClassName'>}
 */
function SplitProductCard({
  product,
  loading = 'lazy',
  className,
  textAlign = 'center',
  showPrice = true,
  size = 'default',
  containerFill,
  splitWellClassName = printGridSplitWellClassName,
}) {
  const variantUrl = printPath(product.handle);
  const isCompact = size === 'compact';
  const [hovered, setHovered] = useState(false);
  const catalogFramedSpec = getCatalogFramedPictureSpec(product);
  const warmupRef = usePrintCardWarmup(product);

  const warmDetailImage = () => {
    warmPrintDetailFromCard(product, warmupRef.current);
  };

  return (
    <article ref={warmupRef} className={cn('block h-full bg-white', className)}>
      <div
        className="relative"
        onMouseEnter={() => {
          setHovered(true);
          warmDetailImage();
        }}
        onMouseLeave={() => setHovered(false)}
        onPointerDown={warmDetailImage}
      >
        <Link
          to={variantUrl}
          prefetch="viewport"
          state={getPrintLinkState(product)}
          onMouseEnter={warmDetailImage}
          onFocus={warmDetailImage}
          onClick={warmDetailImage}
          className="block"
        >
          <div
            className={cn(
              '@container flex aspect-8/9 items-center justify-center overflow-hidden bg-[#ececea]',
              splitWellClassName,
            )}
          >
            <div className="flex size-full min-h-0 min-w-0 items-center justify-center">
              <FramedPicture
                image={product.featuredImage}
                alt={product.title}
                size={catalogFramedSpec}
                loading={loading}
                sizes={FRAMED_PICTURE_IMAGE_SIZES.grid}
                containerFill={containerFill}
                hovered={hovered}
                interactive
              />
            </div>
          </div>
        </Link>
        <FavoriteButton
          productId={product.id}
          className="absolute right-3 bottom-3 z-10"
        />
      </div>
      <div
        className={cn(
          'flex flex-col',
          isCompact ? 'px-2 pt-3 pb-4' : 'px-2.5 pt-3.5 pb-6',
          textAlign === 'center'
            ? 'items-center text-center'
            : 'items-start text-left',
        )}
      >
        <ProductCardContent
          product={product}
          showPrice={showPrice}
          size={size}
        />
      </div>
    </article>
  );
}

/**
 * @param {{
 *   product: import('~/lib/content-api').PictureCard & {
 *     priceRange: {minVariantPrice: {amount: string; currencyCode: string}};
 *   };
 *   showPrice?: boolean;
 *   size?: ProductCardSize;
 * }}
 */
function ProductCardContent({product, showPrice = true, size = 'default'}) {
  const isCompact = size === 'compact';

  return (
    <>
      <h3
        className={cn(
          'mb-[0.2rem] font-medium leading-snug text-neutral-800',
          isCompact ? type.body.sm : cn(type.body.lg, 'md:text-body-xl'),
        )}
      >
        <Link
          to={printPath(product.handle)}
          prefetch="intent"
          className="hover:text-neutral-950"
        >
          {product.title}
        </Link>
      </h3>
      {product.artistName ? (
        <p
          className={cn(
            'mb-[0.15rem] leading-snug text-neutral-500',
            isCompact ? type.body.xs : cn(type.body.sm, 'md:text-body-md'),
          )}
        >
          {product.artistHandle ? (
            <Link
              to={artistPath(product.artistHandle)}
              prefetch="intent"
              className="underline underline-offset-2 transition-colors hover:text-neutral-800"
            >
              {product.artistName}
            </Link>
          ) : (
            product.artistName
          )}
        </p>
      ) : null}
      {showPrice && Number(product.priceRange.minVariantPrice.amount) > 0 ? (
        <div
          className={cn(
            'inline-flex items-baseline gap-1 whitespace-nowrap leading-snug text-neutral-500',
            isCompact ? type.body.xs : cn(type.body.sm, 'md:text-body-md'),
          )}
        >
          <span>From</span>
          <Money
            data={product.priceRange.minVariantPrice}
            withoutTrailingZeros
          />
        </div>
      ) : null}
    </>
  );
}

/**
 * Centered title block for catalog listing pages (prints, collections, etc.).
 * @param {{title: string, description?: string | null}}
 */
export function CatalogPageHeader({title, description}) {
  return (
    <div className="border-b border-neutral-100 px-6 py-12 text-center">
      <h1 className={type.title.md}>{title}</h1>
      {description ? (
        <p
          className={cn(type.body.md, 'mx-auto mt-4 max-w-xl text-neutral-500')}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** @typedef {import('~/lib/print-catalog').PrintCatalogCard} PrintCatalogCard */

const DEFAULT_LAZY_BATCH_SIZE = 12;

const LAZY_GRID_ITEM_TRANSITION = {
  duration: 0.4,
  ease: [0.25, 0.1, 0.25, 1],
};

function lazyGridItemDelay(index, batchSize, prefersReducedMotion) {
  if (prefersReducedMotion) return 0;
  return (index % batchSize) * 0.05;
}

function connectionHasPagination(connection) {
  return Boolean(
    connection?.pageInfo?.hasNextPage || connection?.pageInfo?.hasPreviousPage,
  );
}

/**
 * @param {{
 *   products: PrintCatalogCard[];
 *   gridClassName: string;
 *   cardProps: Record<string, unknown>;
 *   lazyLoadInitialCount?: number;
 *   lazyLoadBatchSize?: number;
 * }}
 */
function LazyProductGridBody({
  products,
  gridClassName,
  cardProps,
  lazyLoadInitialCount,
  lazyLoadBatchSize = DEFAULT_LAZY_BATCH_SIZE,
}) {
  const prefersReducedMotion = useReducedMotion();
  const eagerCount = cardProps.eagerCount;
  const initialCount =
    lazyLoadInitialCount ??
    Math.max(
      typeof eagerCount === 'number' ? eagerCount + 6 : 0,
      lazyLoadBatchSize,
    );
  const {visibleCount, sentinelRef, hasMore} = useProgressiveVisibleCount(
    products.length,
    {initial: initialCount, step: lazyLoadBatchSize},
  );
  const visibleProducts = products.slice(0, visibleCount);

  return (
    <>
      <div className={gridClassName}>
        {visibleProducts.map((product, index) => (
          <motion.div
            key={product.id}
            initial={prefersReducedMotion ? false : {opacity: 0, y: 20}}
            animate={{opacity: 1, y: 0}}
            transition={{
              ...LAZY_GRID_ITEM_TRANSITION,
              delay: lazyGridItemDelay(
                index,
                lazyLoadBatchSize,
                prefersReducedMotion,
              ),
            }}
          >
            {renderProductGridCard({product, index, ...cardProps})}
          </motion.div>
        ))}
      </div>
      {hasMore ? (
        <motion.div
          ref={sentinelRef}
          className="flex min-h-24 items-center justify-center px-6 py-8"
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          aria-hidden
        >
          <motion.span
            className={cn(type.body.sm, 'text-neutral-400')}
            animate={
              prefersReducedMotion ? undefined : {opacity: [0.35, 1, 0.35]}
            }
            transition={
              prefersReducedMotion
                ? undefined
                : {duration: 1.5, repeat: Infinity, ease: 'easeInOut'}
            }
          >
            Loading more prints…
          </motion.span>
        </motion.div>
      ) : null}
    </>
  );
}

/**
 * @param {{
 *   product: PrintCatalogCard;
 *   index: number;
 *   cardLayout: ProductCardLayout;
 *   cardSize: ProductCardSize;
 *   containerFill: number;
 *   wallClassName: string;
 *   splitWellClassName: string;
 *   eagerCount?: number;
 * }}
 */
function renderProductGridCard({
  product,
  index,
  cardLayout,
  cardSize,
  containerFill,
  wallClassName,
  splitWellClassName,
  eagerCount,
}) {
  return (
    <ProductCard
      product={product}
      size={cardSize}
      layout={cardLayout}
      loading={eagerCount != null && index < eagerCount ? 'eager' : undefined}
      containerFill={containerFill}
      wallClassName={wallClassName}
      splitWellClassName={splitWellClassName}
    />
  );
}

/**
 * @param {{
 *   title?: string;
 *   products?: PrintCatalogCard[];
 *   connection?: {nodes?: PrintCatalogCard[]};
 *   gridClassName?: string;
 *   cardLayout?: ProductCardLayout;
 *   cardSize?: ProductCardSize;
 *   containerFill?: number;
 *   wallClassName?: string;
 *   splitWellClassName?: string;
 *   emptyMessage?: string;
 *   eagerCount?: number;
 *   lazyLoadInitialCount?: number;
 *   lazyLoadBatchSize?: number;
 * }}
 */
export function ProductGrid({
  title,
  products = [],
  connection,
  gridClassName = printGridClassName,
  cardLayout = 'integrated',
  cardSize = 'default',
  containerFill = FRAMED_PICTURE_GRID_CONTAINER_FILL,
  wallClassName = printGridWallClassName,
  splitWellClassName = printGridSplitWellClassName,
  emptyMessage,
  eagerCount,
  lazyLoadInitialCount,
  lazyLoadBatchSize,
}) {
  const cardProps = {
    cardLayout,
    cardSize,
    containerFill,
    wallClassName,
    splitWellClassName,
    eagerCount,
  };
  const resolvedProducts = connection?.nodes ?? products;
  const isEmpty = resolvedProducts.length === 0;
  const useCursorPagination = connection && connectionHasPagination(connection);

  useEffect(() => {
    cachePrintCatalogCards(resolvedProducts);
  }, [resolvedProducts]);

  return (
    <section className="w-full">
      {title ? (
        <div className="flex items-center justify-center px-6 py-8 text-center md:py-10">
          <h2 className={cn(type.title.sm, 'text-neutral-900')}>{title}</h2>
        </div>
      ) : null}
      {isEmpty && emptyMessage ? (
        <p
          className={cn(
            type.body.md,
            'px-6 py-16 text-center text-neutral-500',
          )}
        >
          {emptyMessage}
        </p>
      ) : useCursorPagination ? (
        <PaginatedResourceSection
          connection={connection}
          resourcesClassName={gridClassName}
        >
          {({node: product, index}) =>
            renderProductGridCard({product, index, ...cardProps})
          }
        </PaginatedResourceSection>
      ) : (
        <LazyProductGridBody
          products={resolvedProducts}
          gridClassName={gridClassName}
          cardProps={cardProps}
          lazyLoadInitialCount={lazyLoadInitialCount}
          lazyLoadBatchSize={lazyLoadBatchSize}
        />
      )}
    </section>
  );
}

export function VideoSection() {
  return (
    <section className="relative h-[60vh] w-full overflow-hidden bg-neutral-900 md:h-[80vh]">
      <HeroVideoBackground />
    </section>
  );
}

export {
  FRAMED_PICTURE_CATALOG_DISPLAY_SIZE,
  FRAMED_PICTURE_GRID_CONTAINER_FILL,
};
