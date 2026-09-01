import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {createPortal} from 'react-dom';
import {Link, useNavigate, useSearchParams} from 'react-router';
import {
  Award,
  ChevronDown,
  ChevronUp,
  Frame,
  Globe,
  HelpCircle,
  Layers,
  Truck,
} from 'lucide-react';
import {AnimatePresence, motion} from 'framer-motion';
import {getProductOptions, Money} from '@shopify/hydrogen';
import {SizeOptionTable} from '~/components/SizeOptionTable';
import {
  PrintProductInfoAside,
  PrintProductInfoListItem,
} from '~/components/PrintProductInfoTabs';
import {AddToCartButton} from '~/components/AddToCartButton';
import {FramedPicture} from '~/components/FramedPicture';
import {
  FRAMED_PICTURE_IMAGE_SIZES,
  FramedPictureWall,
} from '~/components/FramedPictureWall';
import {useAside} from '~/components/Aside';
import {getPrintLineAttributes} from '~/lib/cart';
import {
  formatOuterDimensions,
  FRAMED_PICTURE_SIZES,
  getFramedPictureSpecFromVariant,
  getMaxWidthCqiForNamedSize,
  getPrintVariantPool,
  getSummaryStripFitLongSideCqi,
  getSummaryStripViewportEstimate,
  resolvePrintVariantInPool,
  sortSizeOptionValues,
} from '~/lib/framed-picture';
import {
  applyFrameSelection,
  applyMountSelection,
  buildVariantSearchParams,
  DEFAULT_FRAME_OPTIONS,
  DEFAULT_MOUNT_OPTIONS,
  FRAME_MOUNT_CONFLICT_MESSAGE,
  getResolvedFrameAndMount,
  isExcludedFrameOption,
  setProductOptionParams,
} from '~/lib/print-options';
import {cn} from '~/lib/utils';
import {scrollPageToTop} from '~/lib/page-scroll';
import {useGalleryInView} from '~/lib/use-gallery-in-view';
import {useContainerSize} from '~/lib/use-container-size';

/**
 * Purchase panel starts expanded on desktop; collapsed on mobile.
 *
 * Defaults to expanded so the server-rendered desktop panel paints in its
 * final (light) state with no color flicker on reload. The mobile dock is a
 * client-only portal, so we collapse before it paints via a layout effect.
 */
export function usePurchasePanelExpanded() {
  const [expanded, setExpanded] = useState(true);

  useLayoutEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setExpanded(false);
    }
  }, []);

  return [expanded, setExpanded];
}

/**
 * @param {{
 *   product: import('storefrontapi.generated').ProductFragment;
 *   selectedVariant: import('storefrontapi.generated').ProductFragment['selectedOrFirstAvailableVariant'];
 *   printHandle?: string;
 *   artistName?: string | null;
 *   orientation?: import('~/lib/framed-picture').PictureOrientation;
 *   galleryInView?: boolean;
 *   title?: string;
 *   image?: {
 *     id?: string;
 *     url: string;
 *     altText?: string | null;
 *     width?: number | null;
 *     height?: number | null;
 *   } | null;
 *   framedSpec?: import('~/lib/framed-picture').FramedPictureSizeSpec;
 *   minPrice?: {amount: string; currencyCode: string} | null;
 * }}
 */
export function PrintPurchasePanel({
  product,
  selectedVariant,
  printHandle,
  artistName,
  orientation = 'vertical',
  galleryInView = true,
  title,
  image,
  framedSpec,
  minPrice,
}) {
  const [expanded, setExpanded] = usePurchasePanelExpanded();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {open} = useAside();

  const handleSummaryExpand = useCallback(async () => {
    setExpanded(true);
    await scrollPageToTop({behavior: 'smooth'});
  }, []);

  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  const sizeOption = productOptions.find(
    (option) => option.name.toLowerCase() === 'size',
  );
  const frameOption = productOptions.find(
    (option) => option.name.toLowerCase() === 'frame',
  );
  const mountOption = productOptions.find(
    (option) => option.name.toLowerCase() === 'mount',
  );

  const {frame: selectedFrame, mount: selectedMount} = getResolvedFrameAndMount(
    selectedVariant,
    searchParams,
  );

  const variantPool = useMemo(
    () =>
      getPrintVariantPool({
        ...product,
        selectedOrFirstAvailableVariant: selectedVariant,
      }),
    [product, selectedVariant],
  );

  const frameOptions = useMemo(() => {
    const fromOption = frameOption?.optionValues
      ?.filter((value) => !isExcludedFrameOption(value.name))
      .map((value) => value.name);
    return fromOption?.length ? fromOption : [...DEFAULT_FRAME_OPTIONS];
  }, [frameOption]);

  const mountOptions = useMemo(() => {
    const fromOption = mountOption?.optionValues?.map((value) => value.name);
    return fromOption?.length ? fromOption : [...DEFAULT_MOUNT_OPTIONS];
  }, [mountOption]);

  const cartLines = selectedVariant
    ? [
        {
          merchandiseId: selectedVariant.id,
          quantity: 1,
          selectedVariant,
          attributes: getPrintLineAttributes({
            printHandle,
            artistName,
            frame: selectedFrame,
            mount: selectedMount,
            variant: selectedVariant,
          }),
        },
      ]
    : [];

  const analytics = {
    products: [
      {
        id: product.id,
        title: product.title,
        price: selectedVariant?.price.amount || '0',
        vendor: product.vendor,
        variantId: selectedVariant?.id || '',
        variantTitle: selectedVariant?.title || '',
        quantity: 1,
      },
    ],
  };

  const selectOptionValue = (variantUriQuery, selected) => {
    if (!selected) {
      const params = buildVariantSearchParams(variantUriQuery, {
        frame: selectedFrame,
        mount: selectedMount,
      });
      void navigate(`?${params.toString()}`, {
        replace: true,
        preventScrollReset: true,
      });
    }
  };

  const updateFrameMountParams = (frame, mount) => {
    const params = new URLSearchParams(searchParams);
    setProductOptionParams(params, {frame, mount});
    void navigate(`?${params.toString()}`, {
      replace: true,
      preventScrollReset: true,
    });
  };

  const selectFrameFallback = (frame) => {
    const {frame: nextFrame, mount} = applyFrameSelection(frame, selectedMount);
    updateFrameMountParams(nextFrame, mount);
  };

  const selectMountFallback = (mount) => {
    const {frame, mount: nextMount} = applyMountSelection(mount, selectedFrame);
    updateFrameMountParams(frame, nextMount);
  };

  const selectFrameShopify = (variantUriQuery, selected, frameName) => {
    if (selected) return;

    const {frame, mount} = applyFrameSelection(frameName, selectedMount);
    const params = buildVariantSearchParams(variantUriQuery, {frame, mount});
    void navigate(`?${params.toString()}`, {
      replace: true,
      preventScrollReset: true,
    });
  };

  const selectMountShopify = (variantUriQuery, selected, mountName) => {
    if (selected) return;

    const {frame, mount} = applyMountSelection(mountName, selectedFrame);
    const params = buildVariantSearchParams(variantUriQuery, {frame, mount});
    void navigate(`?${params.toString()}`, {
      replace: true,
      preventScrollReset: true,
    });
  };

  return (
    <div className="space-y-4">
      <PrintFeatureList />

      <PrintPurchaseDock
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        onSummaryExpand={handleSummaryExpand}
        galleryInView={galleryInView}
        summary={
          title && framedSpec
            ? {
                title,
                artistName,
                image,
                framedSpec,
                price: selectedVariant?.price ?? minPrice ?? null,
                showFromPrefix: !selectedVariant?.price,
              }
            : undefined
        }
        footer={
          <AddToCartButton
            analytics={analytics}
            className="w-full bg-neutral-900 px-4 py-4 text-center text-xs font-medium uppercase tracking-[0.2em] text-white transition-colors hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 md:px-6"
            disabled={!selectedVariant || !selectedVariant.availableForSale}
            onClick={() => {
              open('cart');
            }}
            lines={cartLines}
          >
            {selectedVariant?.availableForSale ? 'Add to cart' : 'Sold out'}
          </AddToCartButton>
        }
      >
        {sizeOption && sizeOption.optionValues.length > 0 ? (
          <SizeTable
            option={sizeOption}
            orientation={orientation}
            frame={selectedFrame}
            mount={selectedMount}
            variantPool={variantPool}
            onSelect={selectOptionValue}
          />
        ) : null}

        <FrameMountOptions>
          <FrameSwatches
            option={frameOption}
            selectedFrame={selectedFrame}
            onSelectShopify={selectFrameShopify}
            onSelectFallback={selectFrameFallback}
          />

          <MountToggle
            option={mountOption}
            selectedMount={selectedMount}
            onSelectShopify={selectMountShopify}
            onSelectFallback={selectMountFallback}
          />
        </FrameMountOptions>
      </PrintPurchaseDock>

      <PrintProductInfoAside
        selectedFrame={selectedFrame}
        sizingGuide={{
          sizeOptionValues: sizeOption?.optionValues ?? [],
          frameOptions,
          mountOptions,
          variantPool,
          orientation,
        }}
      />
    </div>
  );
}

const DOCK_MS = 320;
const DOCK_SPRING = {
  type: 'spring',
  stiffness: 500,
  damping: 50,
  bounce: 0,
  restDelta: 0.01,
  restSpeed: 0.01,
};
const DOCK_EASE = 'cubic-bezier(0, 0, 0.2, 1)';
const DOCK_BORDER_EXPAND_TRANSITION = {
  type: 'tween',
  duration: DOCK_MS / 1000,
  ease: [0.05, 0.9, 0.15, 1],
};
const DOCK_BORDER_COLLAPSE_TRANSITION = {
  type: 'tween',
  duration: 0.03,
  delay: DOCK_MS / 1000 - 0.03,
  ease: [0.4, 0, 1, 1],
};
const DOCK_SHELL_EXPANDED = {
  borderColor: '#e5e5e5',
};
const DOCK_SHELL_COLLAPSED = {
  borderColor: 'rgba(0, 0, 0, 0)',
};

/** @param {boolean} expanded @param {boolean} isHeightAnimating */
function getDockShellTransition(expanded, isHeightAnimating) {
  const borderColor = expanded
    ? DOCK_BORDER_EXPAND_TRANSITION
    : DOCK_BORDER_COLLAPSE_TRANSITION;

  if (isHeightAnimating) {
    return {
      height: DOCK_SPRING,
      borderColor,
    };
  }

  return {
    height: {duration: 0},
    borderColor,
  };
}

/**
 * Mobile bottom sheet / desktop inline purchase options shell.
 *
 * @param {{
 *   expanded: boolean;
 *   onToggle: () => void;
 *   onSummaryExpand?: () => void | Promise<void>;
 *   galleryInView?: boolean;
 *   summary?: {
 *     title: string;
 *     artistName?: string | null;
 *     image?: {
 *       id?: string;
 *       url: string;
 *       altText?: string | null;
 *       width?: number | null;
 *       height?: number | null;
 *     } | null;
 *     framedSpec: import('~/lib/framed-picture').FramedPictureSizeSpec;
 *     price?: {amount: string; currencyCode: string} | null;
 *     showFromPrefix?: boolean;
 *   };
 *   children: import('react').ReactNode;
 *   footer?: import('react').ReactNode;
 * }}
 */
export function PrintPurchaseDock({
  expanded,
  onToggle,
  onSummaryExpand,
  galleryInView = true,
  summary,
  children,
  footer,
}) {
  const {isOpen: asideOpen} = useAside();
  const [mounted, setMounted] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(max-width: 767px)').matches,
  );
  const purchasePanelRef = useRef(null);
  const purchasePanelInView = useGalleryInView(purchasePanelRef, 0.15);
  const showMobileSummary =
    !expanded && !galleryInView && summary && !asideOpen;
  const showDesktopSummary = !purchasePanelInView && summary && !asideOpen;
  const showSummary =
    mounted && (isMobileViewport ? showMobileSummary : showDesktopSummary);
  const showCollapsedCta = !expanded && galleryInView && !asideOpen;
  const [shellExpanded, setShellExpanded] = useState(expanded);
  const [contentInFlow, setContentInFlow] = useState(expanded);
  const [panelHeight, setPanelHeight] = useState(null);
  const [buttonHeight, setButtonHeight] = useState(0);
  const buttonRef = useRef(null);
  const contentRef = useRef(null);
  const prevExpandedRef = useRef(expanded);
  const prevShowDockRef = useRef(
    expanded || (!expanded && galleryInView && !asideOpen),
  );
  const targetPanelHeightRef = useRef(null);
  const didInitDockRef = useRef(false);

  const isShell = expanded || shellExpanded;
  const showDock = expanded || showCollapsedCta || shellExpanded;

  useLayoutEffect(() => {
    setMounted(true);
    const media = window.matchMedia('(max-width: 767px)');
    const syncMobileViewport = () => setIsMobileViewport(media.matches);
    syncMobileViewport();
    media.addEventListener('change', syncMobileViewport);
    return () => media.removeEventListener('change', syncMobileViewport);
  }, []);

  useEffect(() => {
    if (expanded) setShellExpanded(true);
    if (!isMobileViewport && !expanded) {
      setShellExpanded(false);
      setContentInFlow(false);
      setPanelHeight(null);
      targetPanelHeightRef.current = null;
    }
  }, [expanded, isMobileViewport]);

  useEffect(() => {
    if (!asideOpen && showDock) return;

    targetPanelHeightRef.current = null;
    setPanelHeight(null);

    if (expanded) {
      setShellExpanded(true);
      setContentInFlow(true);
    } else {
      setShellExpanded(false);
      setContentInFlow(false);
    }

    prevExpandedRef.current = expanded;
  }, [asideOpen, showDock, expanded]);

  useLayoutEffect(() => {
    const dockJustShown = showDock && !prevShowDockRef.current;
    prevShowDockRef.current = showDock;

    if (!isMobileViewport || !dockJustShown || !expanded) return;

    setShellExpanded(true);
    setContentInFlow(true);
    setPanelHeight(null);
    targetPanelHeightRef.current = null;
    prevExpandedRef.current = true;
  }, [showDock, expanded, isMobileViewport]);

  const measureDockHeights = useCallback(() => {
    const measuredButtonHeight = buttonRef.current?.offsetHeight ?? 0;
    const contentHeight = contentRef.current?.scrollHeight ?? 0;

    return {
      measuredButtonHeight,
      contentHeight,
      fullHeight: measuredButtonHeight + contentHeight,
    };
  }, []);

  const startDockAnimation = useCallback(
    (nextExpanded) => {
      let attempts = 0;

      const applyHeights = () => {
        const {measuredButtonHeight, fullHeight} = measureDockHeights();
        const collapseTarget = Math.max(measuredButtonHeight, buttonHeight);

        if (measuredButtonHeight > 0) {
          setButtonHeight(measuredButtonHeight);
        }

        if ((measuredButtonHeight === 0 || fullHeight === 0) && attempts < 6) {
          attempts += 1;
          requestAnimationFrame(applyHeights);
          return;
        }

        if (measuredButtonHeight === 0) return;

        if (nextExpanded) {
          setContentInFlow(false);
          targetPanelHeightRef.current = fullHeight;
          setPanelHeight(measuredButtonHeight);
          requestAnimationFrame(() => {
            setPanelHeight(fullHeight);
          });
          return;
        }

        targetPanelHeightRef.current = collapseTarget;
        setPanelHeight(fullHeight);
        requestAnimationFrame(() => {
          setPanelHeight(collapseTarget);
        });
      };

      applyHeights();
    },
    [buttonHeight, measureDockHeights],
  );

  useLayoutEffect(() => {
    if (!isMobileViewport || !isShell) return;
    if (prevExpandedRef.current === expanded) return;

    // First mobile pass is the viewport correction (panel defaults to expanded
    // so the SSR desktop panel paints without a flash). Apply the collapsed
    // state instantly instead of animating it down on load.
    if (!didInitDockRef.current) {
      didInitDockRef.current = true;
      prevExpandedRef.current = expanded;
      if (!expanded) {
        setShellExpanded(false);
        setContentInFlow(false);
        setPanelHeight(null);
        targetPanelHeightRef.current = null;
      }
      return;
    }

    prevExpandedRef.current = expanded;
    startDockAnimation(expanded);
  }, [expanded, isShell, isMobileViewport, startDockAnimation]);

  const handlePanelAnimationComplete = () => {
    if (panelHeight === null) return;
    if (panelHeight !== targetPanelHeightRef.current) return;

    if (expanded) {
      setContentInFlow(true);
      setPanelHeight(null);
      targetPanelHeightRef.current = null;
      return;
    }

    setShellExpanded(false);
    setContentInFlow(false);
    setPanelHeight(null);
    targetPanelHeightRef.current = null;
  };

  useEffect(() => {
    if (panelHeight === null) return undefined;

    const timeout = window.setTimeout(() => {
      if (panelHeight !== targetPanelHeightRef.current) return;
      handlePanelAnimationComplete();
    }, DOCK_MS + 80);

    return () => window.clearTimeout(timeout);
  }, [panelHeight, expanded]);

  const isCollapsedCtaDock =
    showCollapsedCta && !isShell && panelHeight == null;

  const dockHeightAnimation =
    panelHeight != null
      ? {height: panelHeight}
      : isShell && contentInFlow
        ? {height: 'auto'}
        : isCollapsedCtaDock && buttonHeight > 0
          ? {height: buttonHeight}
          : {};

  useLayoutEffect(() => {
    if (!showDock || !buttonRef.current) return;
    setButtonHeight(buttonRef.current.offsetHeight);
  }, [showDock, expanded, shellExpanded, panelHeight, contentInFlow]);

  const renderDockToggleButton = () => (
    <button
      ref={buttonRef}
      type="button"
      className={cn(
        'relative z-10 flex w-full shrink-0 items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors',
        expanded
          ? 'bg-neutral-100 text-neutral-900'
          : 'bg-neutral-900 text-white hover:bg-neutral-800',
      )}
      style={{
        transitionDuration: `${DOCK_MS}ms`,
        transitionTimingFunction: DOCK_EASE,
      }}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-[#3b82f6]" />
      <span className="truncate">Select Size, Frame &amp; Mount</span>
      {expanded ? (
        <ChevronUp className="size-4 shrink-0" strokeWidth={1.75} />
      ) : (
        <ChevronDown className="size-4 shrink-0" strokeWidth={1.75} />
      )}
    </button>
  );

  const renderSummaryCard = () => (
    <motion.div
      key="summary"
      className="pointer-events-auto overflow-hidden overscroll-none rounded-lg border border-neutral-200 bg-white shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
      initial={{opacity: 0, y: 16}}
      animate={{opacity: 1, y: 0}}
      exit={{opacity: 0, y: 16}}
      transition={{duration: 0.2, ease: 'easeOut'}}
    >
      <PrintPurchaseSummaryCard
        {...summary}
        onExpand={onSummaryExpand ?? onToggle}
      />
    </motion.div>
  );

  const mobileDock = (
    <div className="pointer-events-none fixed inset-x-0 bottom-2.5 z-30 overscroll-none px-2.5 md:hidden">
      <AnimatePresence mode="wait" initial={false}>
        {asideOpen ? null : showDock ? (
          <motion.div
            key="purchase-dock"
            className={cn(
              'pointer-events-auto relative overflow-hidden rounded-lg border shadow-[0_8px_32px_rgba(0,0,0,0.12)]',
              isShell ? 'bg-white' : 'bg-transparent',
            )}
            animate={{
              ...(expanded ? DOCK_SHELL_EXPANDED : DOCK_SHELL_COLLAPSED),
              ...dockHeightAnimation,
            }}
            transition={
              panelHeight != null
                ? getDockShellTransition(expanded, true)
                : {
                    height: {duration: 0},
                    borderColor: expanded
                      ? DOCK_BORDER_EXPAND_TRANSITION
                      : DOCK_BORDER_COLLAPSE_TRANSITION,
                  }
            }
            onAnimationComplete={handlePanelAnimationComplete}
            initial={false}
            exit={{
              opacity: 0,
              y: 8,
              transition: {duration: 0.2, ease: 'easeOut'},
            }}
          >
            {renderDockToggleButton()}

            {isShell ? (
              <div
                className={cn(
                  'bg-white',
                  contentInFlow ? 'relative' : 'absolute inset-x-0',
                )}
                style={contentInFlow ? undefined : {top: buttonHeight}}
              >
                <div ref={contentRef}>
                  <div className="shrink-0 p-0">{children}</div>
                  {footer ? (
                    <div className="shrink-0 [&_button]:w-full [&_button]:rounded-none">
                      {footer}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </motion.div>
        ) : showSummary ? (
          renderSummaryCard()
        ) : null}
      </AnimatePresence>
    </div>
  );

  const desktopSummaryDock = (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 hidden overscroll-none px-2.5 md:block">
      <div className="mx-auto max-w-xl">
        <AnimatePresence mode="wait" initial={false}>
          {showSummary ? renderSummaryCard() : null}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <>
      {mounted && isMobileViewport
        ? createPortal(mobileDock, document.body)
        : null}
      {mounted && !isMobileViewport
        ? createPortal(desktopSummaryDock, document.body)
        : null}

      <div ref={purchasePanelRef} className="hidden overflow-hidden md:block">
        <button
          type="button"
          className={cn(
            'flex w-full min-w-0 items-center justify-center gap-2 px-4 py-4 text-sm font-medium transition-colors',
            expanded
              ? 'bg-neutral-100 text-neutral-900'
              : 'bg-neutral-900 text-white hover:bg-neutral-800',
          )}
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-[#3b82f6]"
          />
          <span className="truncate">Select Size, Frame &amp; Mount</span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 transition-transform duration-200 ease-out',
              expanded && 'rotate-180',
            )}
            strokeWidth={1.75}
          />
        </button>

        {expanded ? (
          <div className="bg-white pt-4 pb-6">
            <div className="flex flex-col gap-5">{children}</div>
            {footer ? <div className="mt-6">{footer}</div> : null}
          </div>
        ) : null}
      </div>
    </>
  );
}

/**
 * @param {{
 *   title: string;
 *   artistName?: string | null;
 *   image?: {
 *     id?: string;
 *     url: string;
 *     altText?: string | null;
 *     width?: number | null;
 *     height?: number | null;
 *   } | null;
 *   framedSpec: import('~/lib/framed-picture').FramedPictureSizeSpec;
 *   price?: {amount: string; currencyCode: string} | null;
 *   showFromPrefix?: boolean;
 *   onExpand: () => void;
 * }}
 */
function PrintPurchaseSummaryCard({
  title,
  artistName,
  image,
  framedSpec,
  price,
  showFromPrefix = false,
  onExpand,
}) {
  const hasPrice = price && Number(price.amount) > 0;
  const summaryFramedSpec = useMemo(
    () => ({
      ...FRAMED_PICTURE_SIZES.large,
      frameColor: framedSpec.frameColor,
      padding: framedSpec.padding,
      frame: framedSpec.frame,
    }),
    [framedSpec.frame, framedSpec.frameColor, framedSpec.padding],
  );
  const stripRef = useRef(null);
  const containerSize = useContainerSize(stripRef, {
    initialSize: getSummaryStripViewportEstimate,
  });
  const fitLongSideCqi =
    containerSize.width > 0 && containerSize.height > 0
      ? getSummaryStripFitLongSideCqi(
          summaryFramedSpec,
          'large',
          containerSize.width,
          containerSize.height,
        )
      : undefined;

  return (
    <button
      type="button"
      onClick={onExpand}
      className="flex min-h-18 w-full touch-manipulation items-stretch overflow-hidden overscroll-none text-left"
      aria-label={`Configure ${title}`}
    >
      <div className="flex w-18 shrink-0 self-stretch overflow-hidden bg-[#ececea]">
        {image?.url ? (
          <FramedPictureWall variant="summaryStrip" containerRef={stripRef}>
            <FramedPicture
              image={image}
              alt={title}
              size={summaryFramedSpec}
              sizes={FRAMED_PICTURE_IMAGE_SIZES.compact}
              interactive={false}
              maxWidthCqi={getMaxWidthCqiForNamedSize('large')}
              maxLongSideCqi={fitLongSideCqi}
            />
          </FramedPictureWall>
        ) : (
          <div className="size-full bg-neutral-100" aria-hidden />
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2 py-3 pr-3 pl-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-neutral-900 uppercase">
            {title}
          </p>
          {artistName || hasPrice ? (
            <div className="mt-1 flex min-w-0 items-baseline gap-1 text-[13px] leading-snug text-neutral-600">
              {artistName ? (
                <span className="truncate">{artistName}</span>
              ) : null}
              {artistName && hasPrice ? (
                <span className="shrink-0 text-neutral-400">|</span>
              ) : null}
              {hasPrice ? (
                <span className="shrink-0 whitespace-nowrap">
                  {showFromPrefix ? 'from: ' : null}
                  <Money data={price} withoutTrailingZeros />
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <ChevronUp
          className="size-4 shrink-0 text-neutral-400"
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
    </button>
  );
}

export function PrintFeatureList() {
  return (
    <ul className="space-y-3 text-sm text-neutral-700">
      <li className="flex items-start gap-3">
        <Award
          className="mt-0.5 size-4 shrink-0 text-neutral-400"
          strokeWidth={1.5}
        />
        <span>Archival pigment print on cotton rag paper</span>
      </li>
      <li className="flex items-start gap-3">
        <Frame
          className="mt-0.5 size-4 shrink-0 text-neutral-400"
          strokeWidth={1.5}
        />
        <span>
          <Link to="/about" className="underline underline-offset-2">
            Frame included
          </Link>
        </span>
      </li>
      <li className="flex items-start gap-3">
        <Layers
          className="mt-0.5 size-4 shrink-0 text-neutral-400"
          strokeWidth={1.5}
        />
        <span>Six sizes available</span>
      </li>
      <li className="flex items-start gap-3 text-neutral-600">
        <Truck
          className="mt-0.5 size-4 shrink-0 text-neutral-400"
          strokeWidth={1.5}
        />
        <span>Delivered in 14 business days</span>
      </li>
      <li className="flex items-start gap-3 text-neutral-600">
        <Globe
          className="mt-0.5 size-4 shrink-0 text-neutral-400"
          strokeWidth={1.5}
        />
        <span>Printed and framed locally in Canada</span>
      </li>
      <PrintProductInfoListItem />
    </ul>
  );
}

/**
 * @param {{
 *   option: import('@shopify/hydrogen').MappedProductOptions;
 *   orientation: import('~/lib/framed-picture').PictureOrientation;
 *   frame: string;
 *   mount: string;
 *   variantPool: import('~/lib/framed-picture').PrintVariantRef[];
 *   onSelect: (variantUriQuery: string, selected: boolean) => void;
 * }}
 */
function SizeTable({option, orientation, frame, mount, variantPool, onSelect}) {
  const values = sortSizeOptionValues(option.optionValues);

  return (
    <SizeOptionTable
      rows={values.map((value) => {
        const variant =
          resolvePrintVariantInPool(variantPool, value.name, frame, mount) ??
          value.firstSelectableVariant;
        const spec = variant
          ? getFramedPictureSpecFromVariant(
              variant,
              undefined,
              {frame, mount},
              {variantPool},
            )
          : null;
        const dimensions = spec
          ? formatOuterDimensions(spec, orientation)
          : null;

        return {
          key: value.name,
          label: value.name,
          dimensions,
          price: variant?.price ?? null,
          selected: value.selected,
          disabled: !value.exists,
          onSelect: () => onSelect(value.variantUriQuery, value.selected),
        };
      })}
    />
  );
}

/**
 * @param {{
 *   option?: import('@shopify/hydrogen').MappedProductOptions;
 *   selectedFrame: string;
 *   onSelectShopify: (variantUriQuery: string, selected: boolean, optionName: string) => void;
 *   onSelectFallback: (value: string) => void;
 * }}
 */
function FrameSwatches({
  option,
  selectedFrame,
  onSelectShopify,
  onSelectFallback,
}) {
  const useShopify = Boolean(option?.optionValues?.length);
  const shopifyValues =
    option?.optionValues.filter(
      (value) => !isExcludedFrameOption(value.name),
    ) ?? [];
  const fallbackValues = DEFAULT_FRAME_OPTIONS.map((name) => ({
    name,
    selected: name.toLowerCase() === selectedFrame.toLowerCase(),
    exists: true,
  }));
  const values =
    useShopify && shopifyValues.length > 0 ? shopifyValues : fallbackValues;
  const selectedLabel =
    values.find((value) =>
      useShopify
        ? value.selected
        : value.name.toLowerCase() === selectedFrame.toLowerCase(),
    )?.name ?? selectedFrame;

  return (
    <div className="max-md:flex max-md:flex-col max-md:gap-2 max-md:py-2">
      <h3 className="shrink-0 px-3 text-xs font-medium text-neutral-900 md:mb-2 md:px-0 md:text-sm">
        Frame:
        {selectedLabel ? (
          <span className="text-xs font-normal text-neutral-500 md:text-sm">
            {' '}
            {selectedLabel}
          </span>
        ) : null}
      </h3>
      <div className="max-md:px-3">
        <div className="flex w-full divide-x divide-neutral-200 border border-neutral-200 md:inline-flex md:h-auto md:w-fit">
          {values.map((value) => {
            const selected = useShopify
              ? value.selected
              : value.name.toLowerCase() === selectedFrame.toLowerCase();

            return (
              <button
                key={value.name}
                type="button"
                disabled={useShopify ? !value.exists : false}
                onClick={() =>
                  useShopify
                    ? onSelectShopify(
                        value.variantUriQuery,
                        value.selected,
                        value.name,
                      )
                    : onSelectFallback(value.name)
                }
                className={cn(
                  'flex h-8 min-h-0 min-w-0 flex-1 items-center justify-center transition-colors md:size-11 md:flex-none',
                  selected ? 'bg-neutral-100' : 'bg-white hover:bg-neutral-50',
                  useShopify &&
                    !value.exists &&
                    'cursor-not-allowed opacity-40',
                )}
                aria-label={value.name}
                title={value.name}
              >
                <FrameSwatch name={value.name} swatch={value.swatch} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** @param {{name: string; swatch?: {color?: string | null; image?: {previewImage?: {url?: string | null} | null} | null} | null}} */
function FrameSwatch({name, swatch}) {
  const normalized = name.toLowerCase();
  const image = swatch?.image?.previewImage?.url;
  const color = swatch?.color;

  if (image) {
    return (
      <span
        className="size-4 rounded-full bg-cover bg-center md:size-6"
        style={{backgroundImage: `url(${image})`}}
      />
    );
  }

  if (normalized.includes('no frame') || normalized.includes('unframed')) {
    return (
      <span className="relative size-4 rounded-full border border-neutral-300 bg-white md:size-6">
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="h-px w-4 rotate-45 bg-neutral-400 md:w-6" />
        </span>
      </span>
    );
  }

  if (normalized.includes('white')) {
    return (
      <span className="size-4 rounded-full border border-neutral-300 bg-white md:size-6" />
    );
  }

  if (normalized.includes('natural') || normalized.includes('wood')) {
    return (
      <span
        className="size-4 rounded-full md:size-6"
        style={{
          background:
            'linear-gradient(135deg, #d4b896 0%, #a67c52 45%, #c9a66b 100%)',
        }}
      />
    );
  }

  return (
    <span
      className="size-4 rounded-full md:size-6"
      style={{backgroundColor: color || '#1a1a1a'}}
    />
  );
}

/**
 * @param {{
 *   option?: import('@shopify/hydrogen').MappedProductOptions;
 *   selectedMount: string;
 *   onSelectShopify: (variantUriQuery: string, selected: boolean, optionName: string) => void;
 *   onSelectFallback: (value: string) => void;
 * }}
 */
function MountToggle({
  option,
  selectedMount,
  onSelectShopify,
  onSelectFallback,
}) {
  const useShopify = Boolean(option?.optionValues?.length);

  const values = useShopify
    ? option.optionValues
    : DEFAULT_MOUNT_OPTIONS.map((name) => ({
        name,
        selected: name.toLowerCase() === selectedMount.toLowerCase(),
        exists: true,
      }));
  const selectedLabel =
    values.find((value) =>
      useShopify
        ? value.selected
        : value.name.toLowerCase() === selectedMount.toLowerCase(),
    )?.name ?? selectedMount;

  return (
    <div className="max-md:flex max-md:flex-col max-md:gap-2 max-md:py-2">
      <h3 className="shrink-0 px-3 text-xs font-medium text-neutral-900 md:mb-2 md:px-0 md:text-sm">
        Mount:
        {selectedLabel ? (
          <span className="text-xs font-normal text-neutral-500 md:text-sm">
            {' '}
            {selectedLabel}
          </span>
        ) : null}
      </h3>
      <div className="max-md:px-3">
        <div className="grid grid-cols-2 divide-x divide-neutral-200 border border-neutral-200 md:h-auto">
          {values.map((value) => {
            const selected = useShopify
              ? value.selected
              : value.name.toLowerCase() === selectedMount.toLowerCase();

            return (
              <button
                key={value.name}
                type="button"
                disabled={useShopify ? !value.exists : false}
                onClick={() =>
                  useShopify
                    ? onSelectShopify(
                        value.variantUriQuery,
                        value.selected,
                        value.name,
                      )
                    : onSelectFallback(value.name)
                }
                className={cn(
                  'flex h-8 min-h-0 min-w-0 items-center justify-center text-xs font-medium leading-none transition-colors',
                  'px-1.5 whitespace-nowrap',
                  'md:h-auto md:px-4 md:py-3 md:text-sm md:leading-normal',
                  selected
                    ? 'bg-neutral-100 text-neutral-900'
                    : 'bg-white text-neutral-700 hover:bg-neutral-50',
                  useShopify &&
                    !value.exists &&
                    'cursor-not-allowed opacity-40',
                )}
              >
                {value.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** @param {{children: import('react').ReactNode}} */
export function FrameMountOptions({children}) {
  return (
    <div className="relative">
      <div className="absolute top-0 right-3 z-10 md:right-0">
        <FrameMountConflictHint />
      </div>
      <div className="max-md:grid max-md:grid-cols-2 max-md:items-start max-md:divide-x max-md:divide-neutral-200 md:flex md:flex-col md:gap-4">
        {children}
      </div>
    </div>
  );
}

function FrameMountConflictHint() {
  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        className="flex size-6 items-center justify-center text-neutral-400 transition-colors hover:text-neutral-600 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-neutral-400"
        aria-describedby="frame-mount-conflict-hint"
      >
        <HelpCircle className="size-3.5" strokeWidth={1.5} aria-hidden />
        <span className="sr-only">About frame and mount options</span>
      </button>
      <span
        id="frame-mount-conflict-hint"
        role="tooltip"
        className="pointer-events-none absolute top-full right-0 z-20 mt-1.5 w-52 rounded border border-neutral-200 bg-white px-3 py-2 text-left text-xs leading-snug text-neutral-600 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:w-60"
      >
        {FRAME_MOUNT_CONFLICT_MESSAGE}
      </span>
    </span>
  );
}

/** Export for preview mode on print detail without a linked product. */
export {FrameSwatches, MountToggle};
