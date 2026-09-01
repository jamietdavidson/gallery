export type FrameColor = 'white' | 'black' | 'natural';
export type PictureOrientation = 'vertical' | 'horizontal';

export type FramedPictureSizeSpec = {
  /** Shorter print edge in inches — sets proportions, not rendered pixels. */
  shortSide: number;
  /** Longer print edge in inches — sets proportions, not rendered pixels. */
  longSide: number;
  /** Mat border in inches (visual — 0 when mount is full bleed). */
  padding: number;
  /** Outer frame border in inches (visual — 0 when unframed). */
  frame: number;
  frameColor?: FrameColor;
  /**
   * Border-mount mat width from Shopify (`padding_inches` metafield).
   * After catalog sync this is the size-tier reference on every variant;
   * the variant pool fallback handles legacy rows that still store 0 on Full Bleed.
   */
  referencePadding?: number;
  /**
   * Moulding width from Airtable (`frame_width_inches` metafield).
   * Locks on-screen print area when toggling unframed.
   */
  referenceFrame?: number;
};

export type FramedPictureComputed = {
  pictureAspect: number;
  outerAspect: number;
  outerWidth: number;
  outerHeight: number;
  frameCqi: number;
  paddingCqi: number;
  pictureWidthCqi: number;
  frameColor: FrameColor;
  orientation: PictureOrientation;
  colors: {
    frameBorder: string;
    frameFace: string;
    matFace: string;
    frameMatJunction: string;
    matPictureJunction: string;
  };
};

/** Fixed mat and frame width in inches — fallback when Airtable metafields are absent. */
const STANDARD_MAT_INCHES = 2;
const STANDARD_FRAME_INCHES = 2;

/** Default scale for how much of the @container the outer frame may occupy (1 = no adjustment). */
export const FRAMED_PICTURE_DEFAULT_CONTAINER_FILL = 1;

/** Grid listings — outer frame long edge as a fraction of the @container width. */
export const FRAMED_PICTURE_GRID_CONTAINER_FILL = 0.85;

/** Catalog cards use the collector tier with physical inch proportions. */
export const FRAMED_PICTURE_CATALOG_DISPLAY_SIZE = 'collector' as const;

/** Default frame/mount for catalog card previews. */
export const FRAMED_PICTURE_CATALOG_DISPLAY_FRAME = 'Black';
export const FRAMED_PICTURE_CATALOG_DISPLAY_MOUNT = 'Border';

/** Default size on print detail when no variant is selected in the URL (Gallery — fourth largest tier). */
export const FRAMED_PICTURE_DEFAULT_NAMED_SIZE = 'giant' as const;

/** Shopify Size option labels — matches Airtable Variants `Name` where it differs from display labels. */
export const FRAMED_PICTURE_SHOPIFY_SIZE_OPTION_LABELS: Record<
  FramedPictureNamedSize,
  string
> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  giant: 'Gallery',
  collector: 'Collector',
  exhibition: 'Exhibition',
  museum: 'Museum',
};

/** Shopify `Size` option value for a named print tier. */
export function getShopifySizeOptionLabel(namedSize: FramedPictureNamedSize) {
  return FRAMED_PICTURE_SHOPIFY_SIZE_OPTION_LABELS[namedSize];
}

/** Detail gallery — min/max outer frame long edge (% of @container width); tiers step evenly. */
export const FRAMED_PICTURE_DETAIL_MIN_LONG_SIDE_CQI = 50;
export const FRAMED_PICTURE_DETAIL_MAX_LONG_SIDE_CQI = 88;

/** Detail gallery — min/max long-edge height fill; tiers step evenly between. */
export const FRAMED_PICTURE_DETAIL_MIN_HEIGHT_FILL = 0.5;
export const FRAMED_PICTURE_DETAIL_MAX_HEIGHT_FILL = 0.88;

/**
 * Named print sizes — standard 2:3 aspect ratio (short × long) at every tier.
 * Inch values define proportions only; the parent @container controls on-screen scale.
 */
export const FRAMED_PICTURE_SIZES = {
  small: {
    shortSide: 8,
    longSide: 12,
    padding: STANDARD_MAT_INCHES,
    frame: STANDARD_FRAME_INCHES,
    frameColor: 'black',
  },
  medium: {
    shortSide: 12,
    longSide: 18,
    padding: STANDARD_MAT_INCHES,
    frame: STANDARD_FRAME_INCHES,
    frameColor: 'black',
  },
  large: {
    shortSide: 16,
    longSide: 24,
    padding: STANDARD_MAT_INCHES,
    frame: STANDARD_FRAME_INCHES,
    frameColor: 'black',
  },
  giant: {
    shortSide: 20,
    longSide: 30,
    padding: STANDARD_MAT_INCHES,
    frame: STANDARD_FRAME_INCHES,
    frameColor: 'black',
  },
  collector: {
    shortSide: 30,
    longSide: 45,
    padding: STANDARD_MAT_INCHES,
    frame: STANDARD_FRAME_INCHES,
    frameColor: 'black',
  },
  exhibition: {
    shortSide: 40,
    longSide: 60,
    padding: STANDARD_MAT_INCHES,
    frame: STANDARD_FRAME_INCHES,
    frameColor: 'black',
  },
  museum: {
    shortSide: 48,
    longSide: 72,
    padding: STANDARD_MAT_INCHES,
    frame: STANDARD_FRAME_INCHES,
    frameColor: 'black',
  },
} satisfies Record<string, FramedPictureSizeSpec>;

export type FramedPictureNamedSize = keyof typeof FRAMED_PICTURE_SIZES;

type VariantMetafield = {
  namespace?: string | null;
  key?: string | null;
  value?: string | null;
};

/** Read a print dimension metafield synced from Airtable via catalog sync. */
export function getVariantPrintMetafield(
  variant: {metafields?: VariantMetafield[] | null} | null | undefined,
  key: string,
) {
  return variant?.metafields?.find(
    (field) => field?.namespace === 'print' && field?.key === key,
  )?.value;
}

function parseInchesMetafield(value?: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Size tier rank (1 = smallest) from Shopify variant metafield. */
export function getVariantSizeRank(
  variant: {metafields?: VariantMetafield[] | null} | null | undefined,
) {
  return parseInchesMetafield(getVariantPrintMetafield(variant, 'rank'));
}

function getReferencePaddingFromMetafield(paddingInches: number | undefined) {
  if (paddingInches != null && paddingInches > 0) return paddingInches;
  return STANDARD_MAT_INCHES;
}

function getReferenceFrameFromMetafield(frameInches: number | undefined) {
  if (frameInches != null && frameInches > 0) return frameInches;
  return STANDARD_FRAME_INCHES;
}

export type PrintVariantRef = {
  id?: string;
  price?: {amount: string; currencyCode: string} | null;
  metafields?: VariantMetafield[] | null;
  selectedOptions?: Array<{name: string; value: string}>;
};

/** Collect variants available on the product detail page for reference inset lookup. */
export function getPrintVariantPool(product: {
  selectedOrFirstAvailableVariant?: PrintVariantRef | null;
  adjacentVariants?: PrintVariantRef[] | null;
  options?: Array<{
    name: string;
    optionValues?: Array<{firstSelectableVariant?: PrintVariantRef | null}>;
  }>;
}): PrintVariantRef[] {
  const byId = new Map<string, PrintVariantRef>();
  const add = (variant: PrintVariantRef | null | undefined) => {
    if (!variant?.id) return;
    byId.set(variant.id, variant);
  };

  add(product.selectedOrFirstAvailableVariant);
  for (const variant of product.adjacentVariants ?? []) add(variant);
  for (const option of product.options ?? []) {
    if (option.name.toLowerCase() !== 'size') continue;
    for (const value of option.optionValues ?? []) {
      add(value.firstSelectableVariant);
    }
  }

  return [...byId.values()];
}

/**
 * Border-mount mat and moulding width for a size tier.
 * Full-bleed variants store `padding_inches: 0` — read the bordered sibling instead.
 */
export function resolveReferenceInsetsForSize(
  sizeLabel: string | null | undefined,
  variantPool: PrintVariantRef[],
) {
  if (!sizeLabel) {
    return {
      referencePadding: STANDARD_MAT_INCHES,
      referenceFrame: STANDARD_FRAME_INCHES,
    };
  }

  const normalizedSize = sizeLabel.toLowerCase().trim();
  let referencePadding: number | undefined;
  let referenceFrame: number | undefined;

  for (const variant of variantPool) {
    const variantSize = getSelectedOptionValue(variant, 'size');
    if (variantSize?.toLowerCase().trim() !== normalizedSize) continue;

    const padding = parseInchesMetafield(
      getVariantPrintMetafield(variant, 'padding_inches'),
    );
    const frame = parseInchesMetafield(
      getVariantPrintMetafield(variant, 'frame_width_inches'),
    );

    if (padding != null && padding > 0) {
      referencePadding = Math.max(referencePadding ?? 0, padding);
    }
    if (frame != null && frame > 0) {
      referenceFrame = Math.max(referenceFrame ?? 0, frame);
    }
  }

  return {
    referencePadding: referencePadding ?? STANDARD_MAT_INCHES,
    referenceFrame: referenceFrame ?? STANDARD_FRAME_INCHES,
  };
}

/**
 * Full-bleed Airtable rows store `padding_inches: 0` and often larger print inches
 * (the image extends into the mat area). Normalize back to bordered print size.
 */
export function resolveCanonicalPrintDimensions(
  shortSide: number,
  longSide: number,
  paddingMetafield: number | undefined,
  referencePadding: number,
): {shortSide: number; longSide: number} {
  if (paddingMetafield != null && paddingMetafield > 0) {
    return {shortSide, longSide};
  }

  const inset = referencePadding * 2;
  const adjusted = {
    shortSide: shortSide - inset,
    longSide: longSide - inset,
  };
  if (adjusted.shortSide <= 0 || adjusted.longSide <= 0) {
    return {shortSide, longSide};
  }

  const namedAfter = resolveNamedSizeFromSpec(adjusted);
  const namedBefore = resolveNamedSizeFromSpec({shortSide, longSide});
  if (namedAfter && (!namedBefore || namedAfter === namedBefore)) {
    return adjusted;
  }

  return {shortSide, longSide};
}

/** Build bordered+framed print spec from Shopify variant metafields (Airtable source of truth). */
export function getFramedPictureSpecFromVariantMetafields(
  variant:
    | {
        metafields?: VariantMetafield[] | null;
        selectedOptions?: Array<{name: string; value: string}>;
      }
    | null
    | undefined,
): FramedPictureSizeSpec | null {
  const rawShortSide = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'short_inches'),
  );
  const rawLongSide = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'long_inches'),
  );
  if (!rawShortSide || !rawLongSide) return null;

  const rawPaddingInches = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'padding_inches'),
  );
  const referencePadding = getReferencePaddingFromMetafield(rawPaddingInches);
  const {shortSide, longSide} = resolveCanonicalPrintDimensions(
    rawShortSide,
    rawLongSide,
    rawPaddingInches,
    referencePadding,
  );
  const frameWidthInches =
    parseInchesMetafield(
      getVariantPrintMetafield(variant, 'frame_width_inches'),
    ) ?? STANDARD_FRAME_INCHES;

  const frameValue = variant?.selectedOptions?.find(
    (option) => option.name.toLowerCase() === 'frame',
  )?.value;

  return {
    shortSide,
    longSide,
    padding: referencePadding,
    frame: frameWidthInches,
    referencePadding,
    referenceFrame: frameWidthInches,
    frameColor: resolveFrameColorFromOption(frameValue),
  };
}

/** True when the variant has print inch metafields from the Storefront API. */
export function variantHasPrintSizingMetafields(
  variant: {metafields?: VariantMetafield[] | null} | null | undefined,
) {
  const shortSide = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'short_inches'),
  );
  const longSide = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'long_inches'),
  );
  return Boolean(shortSide && longSide);
}

/** Merge any print metafields present on the variant into a template spec. */
function applyPartialVariantPrintMetafields(
  variant: {metafields?: VariantMetafield[] | null} | null | undefined,
  spec: FramedPictureSizeSpec,
): FramedPictureSizeSpec {
  const rawShortSide = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'short_inches'),
  );
  const rawLongSide = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'long_inches'),
  );
  const rawPaddingInches = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'padding_inches'),
  );
  const frameWidthInches = parseInchesMetafield(
    getVariantPrintMetafield(variant, 'frame_width_inches'),
  );

  const next = {...spec};
  const referencePadding = getReferencePaddingFromMetafield(rawPaddingInches);

  if (rawShortSide && rawLongSide) {
    const {shortSide, longSide} = resolveCanonicalPrintDimensions(
      rawShortSide,
      rawLongSide,
      rawPaddingInches,
      referencePadding,
    );
    next.shortSide = shortSide;
    next.longSide = longSide;
  }
  next.referencePadding = referencePadding;
  next.padding = referencePadding;
  if (frameWidthInches != null) {
    next.frame = frameWidthInches;
    next.referenceFrame = frameWidthInches;
  }
  return next;
}

/** Border-mount mat width for layout locking (prefers Airtable metafield). */
export function getReferencePaddingInches(
  spec: Pick<FramedPictureSizeSpec, 'padding' | 'referencePadding'>,
) {
  if (spec.referencePadding != null && spec.referencePadding > 0) {
    return spec.referencePadding;
  }
  if (spec.padding > 0) return spec.padding;
  return STANDARD_MAT_INCHES;
}

/** Moulding width for layout locking (prefers Airtable metafield). */
export function getReferenceFrameInches(
  spec: Pick<FramedPictureSizeSpec, 'frame' | 'referenceFrame'>,
) {
  if (spec.referenceFrame != null && spec.referenceFrame > 0) {
    return spec.referenceFrame;
  }
  if (spec.frame > 0) return spec.frame;
  return STANDARD_FRAME_INCHES;
}

/**
 * Layout mat/frame inches used to compute picture scale.
 * Full bleed and unframed keep the bordered+framed print area on screen.
 */
export function getLayoutInsetsForPictureLock(spec: FramedPictureSizeSpec) {
  const referencePadding = getReferencePaddingInches(spec);
  const referenceFrame = getReferenceFrameInches(spec);
  const isFullBleed = spec.padding === 0;
  const isUnframed = spec.frame === 0;

  return {
    layoutPadding: isFullBleed ? referencePadding : spec.padding,
    layoutFrame: isUnframed ? referenceFrame : spec.frame,
  };
}

/**
 * Spec for tier viewport caps — size tier only, always bordered+framed insets.
 * Mount/frame toggles must not change the tier budget.
 */
export function getTierCapLayoutSpec(
  spec: FramedPictureSizeSpec,
): FramedPictureSizeSpec {
  const referencePadding = getReferencePaddingInches(spec);
  const referenceFrame = getReferenceFrameInches(spec);

  return {
    shortSide: spec.shortSide,
    longSide: spec.longSide,
    padding: referencePadding,
    frame: referenceFrame,
    referencePadding,
    referenceFrame,
    frameColor: spec.frameColor,
  };
}

function getTierCapLayoutInsets(spec: FramedPictureSizeSpec) {
  const tierSpec = getTierCapLayoutSpec(spec);
  return {
    layoutPadding: tierSpec.padding,
    layoutFrame: tierSpec.frame,
  };
}

/** Print tiers in ascending size order for detail-page interpolation. */
export const FRAMED_PICTURE_NAMED_SIZE_ORDER = [
  'small',
  'medium',
  'large',
  'giant',
  'collector',
  'exhibition',
  'museum',
] as const satisfies readonly FramedPictureNamedSize[];

/** Airtable `print.rank` count — keep in sync with named tiers above. */
export const FRAMED_PICTURE_TIER_RANK_COUNT =
  FRAMED_PICTURE_NAMED_SIZE_ORDER.length;

function lerpDetailTierIndex(
  index: number,
  min: number,
  max: number,
  tierCount = FRAMED_PICTURE_TIER_RANK_COUNT,
) {
  if (index < 0) return max;

  const steps = Math.max(tierCount - 1, 1);
  const clampedIndex = Math.max(0, Math.min(index, tierCount - 1));

  return min + (clampedIndex / steps) * (max - min);
}

function lerpDetailTierValue(
  namedSize: FramedPictureNamedSize,
  min: number,
  max: number,
) {
  const index = FRAMED_PICTURE_NAMED_SIZE_ORDER.indexOf(namedSize);
  return lerpDetailTierIndex(index, min, max);
}

/** Detail gallery cap from Airtable rank (1 = smallest). */
export function getDetailMaxLongSideCqiForRank(
  rank: number,
  tierCount = FRAMED_PICTURE_TIER_RANK_COUNT,
) {
  return lerpDetailTierIndex(
    rank - 1,
    FRAMED_PICTURE_DETAIL_MIN_LONG_SIDE_CQI,
    FRAMED_PICTURE_DETAIL_MAX_LONG_SIDE_CQI,
    tierCount,
  );
}

export function getDetailMaxHeightFillForRank(
  rank: number,
  tierCount = FRAMED_PICTURE_TIER_RANK_COUNT,
) {
  return lerpDetailTierIndex(
    rank - 1,
    FRAMED_PICTURE_DETAIL_MIN_HEIGHT_FILL,
    FRAMED_PICTURE_DETAIL_MAX_HEIGHT_FILL,
    tierCount,
  );
}

export function getDetailMaxLongSideCqiForNamedSize(
  namedSize: FramedPictureNamedSize,
) {
  return lerpDetailTierValue(
    namedSize,
    FRAMED_PICTURE_DETAIL_MIN_LONG_SIDE_CQI,
    FRAMED_PICTURE_DETAIL_MAX_LONG_SIDE_CQI,
  );
}

export function getDetailMaxHeightFillForNamedSize(
  namedSize: FramedPictureNamedSize,
) {
  return lerpDetailTierValue(
    namedSize,
    FRAMED_PICTURE_DETAIL_MIN_HEIGHT_FILL,
    FRAMED_PICTURE_DETAIL_MAX_HEIGHT_FILL,
  );
}

export const FRAMED_PICTURE_SIZE_LABELS: Record<
  FramedPictureNamedSize,
  string
> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
  giant: 'Giant',
  collector: 'Collector',
  exhibition: 'Exhibition',
  museum: 'Museum',
};

/** Max outer frame width (% of @container) per named print size. */
export const FRAMED_PICTURE_MAX_WIDTH_CQI: Record<
  FramedPictureNamedSize,
  number
> = {
  small: 50,
  medium: 65,
  large: 78,
  giant: 88,
  collector: 90,
  exhibition: 91,
  museum: 92,
};

/** Resolve catalog tier from print inch dimensions (ignores frame/mount overrides). */
export function resolveNamedSizeFromSpec(
  spec: Pick<FramedPictureSizeSpec, 'shortSide' | 'longSide'>,
): FramedPictureNamedSize | undefined {
  for (const key of Object.keys(
    FRAMED_PICTURE_SIZES,
  ) as FramedPictureNamedSize[]) {
    const template = FRAMED_PICTURE_SIZES[key];
    if (
      spec.shortSide === template.shortSide &&
      spec.longSide === template.longSide
    ) {
      return key;
    }
  }

  return undefined;
}

export function getMaxWidthCqiForNamedSize(
  namedSize?: FramedPictureNamedSize,
): number {
  if (namedSize) return FRAMED_PICTURE_MAX_WIDTH_CQI[namedSize];
  return DEFAULT_MAX_FRAME_WIDTH_CQI;
}

function getLayoutOuterAspectForTierCap(
  spec: FramedPictureSizeSpec,
  layoutPadding: number,
  layoutFrame: number,
) {
  const verticalLayout = getLayoutOuterDimensions(
    {shortSide: spec.shortSide, longSide: spec.longSide, frame: layoutFrame},
    'vertical',
    layoutPadding,
  );

  return verticalLayout.width / verticalLayout.height;
}

/**
 * CSS length for a framed-picture `cqi` value, scaled by the optional `--fp-unit`
 * fit factor. When `--fp-unit` is unset it falls back to `1cqi`, so grid/compact
 * variants render identically to a plain `${value}cqi`. The detail gallery sets
 * `--fp-unit` to `min(1cqi, k * 1cqh)` so the frame is height-capped by the
 * browser in a single layout pass — no JS measurement or extra render cycle.
 */
export function framedPictureCqi(value: number): string {
  return `calc(var(--fp-unit, 1cqi) * ${value})`;
}

/**
 * `--fp-unit` value that caps the framed picture's outer height at
 * `heightFillCqh` percent of the @container height while keeping the tier's
 * width budget. Requires the @container to use `container-type: size`.
 *
 * @param outerWidthCqi Outer frame width in cqi (tier-capped).
 * @param outerAspect Outer width / outer height.
 * @param heightFillCqh Max outer height as a percentage of container height.
 */
export function getDetailFitUnit(
  outerWidthCqi: number,
  outerAspect: number,
  heightFillCqh: number,
): string {
  if (outerWidthCqi <= 0 || outerAspect <= 0) return '1cqi';
  const k = (heightFillCqh * outerAspect) / outerWidthCqi;
  return `min(1cqi, ${k.toFixed(4)}cqh)`;
}

/** Summary-strip thumbnail well — keep in sync with `w-18 min-h-18` and wall padding. */
export const FRAMED_PICTURE_SUMMARY_STRIP_WIDTH_PX = 72;
export const FRAMED_PICTURE_SUMMARY_STRIP_HEIGHT_PX = 72;

/** Best-effort @container dimensions for the purchase summary strip thumbnail. */
export function getSummaryStripViewportEstimate() {
  return {
    width: FRAMED_PICTURE_SUMMARY_STRIP_WIDTH_PX,
    height: FRAMED_PICTURE_SUMMARY_STRIP_HEIGHT_PX,
  };
}

/** Tier caps only — no viewport height binding. Use before @container is measured. */
export function getDetailTierFitCaps(
  spec: FramedPictureSizeSpec,
  namedSize: FramedPictureNamedSize,
) {
  const maxLongSideCqi = getDetailMaxLongSideCqiForNamedSize(namedSize);
  const {layoutPadding, layoutFrame} = getTierCapLayoutInsets(spec);
  const verticalOuterAspect = getLayoutOuterAspectForTierCap(
    spec,
    layoutPadding,
    layoutFrame,
  );

  return {
    maxLongSideCqi,
    maxWidthCqi: maxLongSideCqi * verticalOuterAspect,
  };
}

/** Cap outer long edge for summary-strip / compact thumbnails. */
export function getSummaryStripFitLongSideCqi(
  spec: FramedPictureSizeSpec,
  namedSize: FramedPictureNamedSize,
  containerWidth: number,
  containerHeight: number,
) {
  if (containerWidth <= 0 || containerHeight <= 0) return undefined;

  const maxWidthCqi = getMaxWidthCqiForNamedSize(namedSize);
  const {layoutPadding, layoutFrame} = getTierCapLayoutInsets(spec);
  const verticalOuterAspect = getLayoutOuterAspectForTierCap(
    spec,
    layoutPadding,
    layoutFrame,
  );
  const tierLongSideCap = maxWidthCqi / verticalOuterAspect;
  const heightLongSideCap = (containerHeight / containerWidth) * 100;

  return Math.min(tierLongSideCap, heightLongSideCap, 100);
}

/** @param {{width?: number | null; height?: number | null} | null | undefined} image */
export function getOrientationFromImage(image): PictureOrientation {
  if (image?.width && image?.height) {
    return image.width >= image.height ? 'horizontal' : 'vertical';
  }
  return 'vertical';
}

/** Natural width / height for equal-area grid sizing. */
export function getImageAspectRatio(
  image: {width?: number | null; height?: number | null} | null | undefined,
): number {
  if (image?.width && image?.height) {
    return image.width / image.height;
  }
  return 0.75;
}

export function getPictureDimensions(
  spec: Pick<FramedPictureSizeSpec, 'shortSide' | 'longSide'>,
  orientation: PictureOrientation,
) {
  if (orientation === 'horizontal') {
    return {width: spec.longSide, height: spec.shortSide};
  }
  return {width: spec.shortSide, height: spec.longSide};
}

export function formatPrintDimensions(
  spec: Pick<FramedPictureSizeSpec, 'shortSide' | 'longSide'>,
  orientation: PictureOrientation,
) {
  const {width, height} = getPictureDimensions(spec, orientation);
  return `${formatInches(width)}" × ${formatInches(height)}"`;
}

/** Shopify Size option label (short × long, portrait order). */
export function formatPrintSizeShopifyLabel(
  spec: Pick<FramedPictureSizeSpec, 'shortSide' | 'longSide'>,
) {
  return `${formatInches(spec.shortSide)}" x ${formatInches(spec.longSide)}"`;
}

export function getOuterDimensions(
  spec: FramedPictureSizeSpec,
  orientation: PictureOrientation,
) {
  const {width: pictureWidth, height: pictureHeight} = getPictureDimensions(
    spec,
    orientation,
  );
  const {padding, frame} = spec;

  return {
    width: pictureWidth + 2 * padding + 2 * frame,
    height: pictureHeight + 2 * padding + 2 * frame,
  };
}

/** Total outer width × height including mat and frame moulding. */
export function formatOuterDimensions(
  spec: FramedPictureSizeSpec,
  orientation: PictureOrientation,
) {
  const {width, height} = getOuterDimensions(spec, orientation);
  return `${formatInches(width)}" × ${formatInches(height)}"`;
}

/** Human-readable inch value for spec tables; em dash when zero or absent. */
export function formatSpecificationInches(value: number | null | undefined) {
  if (value == null || value <= 0) return '—';
  return `${formatInches(value)}″`;
}

function formatInches(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toFixed(2).replace(/\.?0+$/, '');
}

function adjustHexColor(hex: string, amountPercent: number) {
  const normalized = hex.replace('#', '');
  const channels = [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
  const factor = amountPercent / 100;

  return `#${channels
    .map((channel) => {
      const next =
        amountPercent > 0
          ? channel + (255 - channel) * factor
          : channel * (1 + factor);
      return Math.max(0, Math.min(255, Math.round(next)))
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** Default max outer width when size tier is unknown. */
const DEFAULT_MAX_FRAME_WIDTH_CQI = 92;

function getLayoutOuterDimensions(
  spec: Pick<FramedPictureSizeSpec, 'shortSide' | 'longSide' | 'frame'>,
  orientation: PictureOrientation,
  layoutPadding: number,
) {
  const {width, height} = getPictureDimensions(spec, orientation);
  const {frame} = spec;

  return {
    width: width + 2 * layoutPadding + 2 * frame,
    height: height + 2 * layoutPadding + 2 * frame,
  };
}

function getOuterDimensionsCqi(
  frameCqi: number,
  paddingCqi: number,
  pictureWidthCqi: number,
  pictureAspect: number,
) {
  const junctionCqi = 0.11 * frameCqi;
  const outerWidthCqi =
    pictureWidthCqi + 2 * frameCqi + 2 * paddingCqi + 2 * junctionCqi;
  const pictureHeightCqi = pictureWidthCqi / pictureAspect;
  const outerHeightCqi =
    pictureHeightCqi + 2 * frameCqi + 2 * paddingCqi + 2 * junctionCqi;

  return {outerWidthCqi, outerHeightCqi};
}

/** Scale all cqi so the outer frame long edge matches `fillRatio` × container width. */
function scaleToOuterContainerFill(
  dimensions: {
    frameCqi: number;
    paddingCqi: number;
    pictureWidthCqi: number;
    pictureAspect: number;
  },
  fillRatio: number,
) {
  const targetLongSideCqi = Math.min(fillRatio, 1) * 100;
  const {outerWidthCqi, outerHeightCqi} = getOuterDimensionsCqi(
    dimensions.frameCqi,
    dimensions.paddingCqi,
    dimensions.pictureWidthCqi,
    dimensions.pictureAspect,
  );
  const longSideCqi = Math.max(outerWidthCqi, outerHeightCqi);
  if (longSideCqi === 0 || longSideCqi === targetLongSideCqi) return dimensions;

  const scale = targetLongSideCqi / longSideCqi;
  return {
    frameCqi: dimensions.frameCqi * scale,
    paddingCqi: dimensions.paddingCqi * scale,
    pictureWidthCqi: dimensions.pictureWidthCqi * scale,
  };
}

/**
 * Scale frame/mat/picture cqi so the long outer edge fits the tier cap.
 * `maxWidthCqi` is the max outer width for vertical orientation; horizontal
 * prints use the same long-edge budget so both orientations read at the same size.
 */
function scaleFramedPictureDimensions(
  dimensions: {
    frameCqi: number;
    paddingCqi: number;
    pictureWidthCqi: number;
    pictureAspect: number;
  },
  targetLongSideCqi: number,
  options?: {onlyDown?: boolean},
) {
  const {outerWidthCqi, outerHeightCqi} = getOuterDimensionsCqi(
    dimensions.frameCqi,
    dimensions.paddingCqi,
    dimensions.pictureWidthCqi,
    dimensions.pictureAspect,
  );
  const longSideCqi = Math.max(outerWidthCqi, outerHeightCqi);

  if (longSideCqi === 0) return dimensions;
  if (options?.onlyDown && longSideCqi <= targetLongSideCqi) return dimensions;
  if (!options?.onlyDown && longSideCqi === targetLongSideCqi)
    return dimensions;

  const scale = targetLongSideCqi / longSideCqi;
  return {
    frameCqi: dimensions.frameCqi * scale,
    paddingCqi: dimensions.paddingCqi * scale,
    pictureWidthCqi: dimensions.pictureWidthCqi * scale,
  };
}

function fitFramedPictureToContainer(
  dimensions: {
    frameCqi: number;
    paddingCqi: number;
    pictureWidthCqi: number;
    pictureAspect: number;
  },
  maxWidthCqi = DEFAULT_MAX_FRAME_WIDTH_CQI,
  verticalOuterAspect = 1,
  options?: {onlyDown?: boolean},
) {
  return scaleFramedPictureDimensions(
    dimensions,
    maxWidthCqi / verticalOuterAspect,
    options,
  );
}

export function computeFramedPictureSize(
  spec: FramedPictureSizeSpec,
  orientation: PictureOrientation,
  options?: {
    containerFill?: number;
    namedSize?: FramedPictureNamedSize;
    maxWidthCqi?: number;
    maxLongSideCqi?: number;
  },
): FramedPictureComputed {
  const {width: pictureWidth, height: pictureHeight} = getPictureDimensions(
    spec,
    orientation,
  );
  const {padding, frame} = spec;
  const frameColor = spec.frameColor ?? 'black';
  const isFullBleed = padding === 0;
  const isUnframed = frame === 0;
  const {layoutPadding, layoutFrame} = getLayoutInsetsForPictureLock(spec);

  const outerWidth = pictureWidth + 2 * padding + 2 * frame;
  const outerHeight = pictureHeight + 2 * padding + 2 * frame;

  const layoutOuterWidth = pictureWidth + 2 * layoutPadding + 2 * layoutFrame;
  const layoutVerticalLayout = getLayoutOuterDimensions(
    {shortSide: spec.shortSide, longSide: spec.longSide, frame: layoutFrame},
    orientation,
    layoutPadding,
  );
  const layoutVerticalOuterAspect =
    layoutVerticalLayout.width / layoutVerticalLayout.height;

  let layoutFrameCqi = (layoutFrame / layoutOuterWidth) * 100;
  let layoutPaddingCqi = (layoutPadding / layoutOuterWidth) * 100;
  let pictureWidthCqi = (pictureWidth / layoutOuterWidth) * 100;
  const pictureAspect = pictureWidth / pictureHeight;

  const maxWidthCqi =
    options?.maxWidthCqi ?? getMaxWidthCqiForNamedSize(options?.namedSize);

  // Tier caps use bordered+framed layout so mount/frame toggles never rescale the print.
  ({
    frameCqi: layoutFrameCqi,
    paddingCqi: layoutPaddingCqi,
    pictureWidthCqi,
  } = fitFramedPictureToContainer(
    {
      frameCqi: layoutFrameCqi,
      paddingCqi: layoutPaddingCqi,
      pictureWidthCqi,
      pictureAspect,
    },
    maxWidthCqi,
    layoutVerticalOuterAspect,
  ));

  if (options?.maxLongSideCqi !== undefined) {
    ({
      frameCqi: layoutFrameCqi,
      paddingCqi: layoutPaddingCqi,
      pictureWidthCqi,
    } = scaleFramedPictureDimensions(
      {
        frameCqi: layoutFrameCqi,
        paddingCqi: layoutPaddingCqi,
        pictureWidthCqi,
        pictureAspect,
      },
      options.maxLongSideCqi,
    ));
  }

  let frameCqi = isUnframed ? 0 : layoutFrameCqi;
  let paddingCqi = isFullBleed ? 0 : layoutPaddingCqi;

  const containerFill =
    options?.containerFill ?? FRAMED_PICTURE_DEFAULT_CONTAINER_FILL;
  if (containerFill !== FRAMED_PICTURE_DEFAULT_CONTAINER_FILL) {
    ({frameCqi, paddingCqi, pictureWidthCqi} = scaleToOuterContainerFill(
      {frameCqi, paddingCqi, pictureWidthCqi, pictureAspect},
      containerFill,
    ));
  }

  const baseColors =
    frameColor === 'white'
      ? {
          frameBorder: '#e5e5e5',
          frameFace: '#ffffff',
          matFace: '#ffffff',
        }
      : frameColor === 'natural'
        ? {
            frameBorder: '#8b7355',
            frameFace: '#c4a574',
            matFace: '#ffffff',
          }
        : {
            frameBorder: '#2a2a2a',
            frameFace: '#ffffff',
            matFace: '#ffffff',
          };

  const colors = {
    ...baseColors,
    frameMatJunction:
      frameColor === 'white'
        ? adjustHexColor(baseColors.frameBorder, -10)
        : adjustHexColor(baseColors.frameBorder, 10),
    matPictureJunction: adjustHexColor(baseColors.matFace, -8),
  };

  return {
    pictureAspect,
    outerAspect: outerWidth / outerHeight,
    outerWidth,
    outerHeight,
    frameCqi,
    paddingCqi,
    pictureWidthCqi,
    frameColor,
    orientation,
    colors,
  };
}

export function isFramedPictureNamedSize(
  value: string,
): value is FramedPictureNamedSize {
  return value in FRAMED_PICTURE_SIZES;
}

function matchesDimensionPair(
  label: string,
  shortSide: number,
  longSide: number,
) {
  const pattern = new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*["']?\\s*(x|×|\\*)\\s*(\\d+(?:\\.\\d+)?)`,
    'i',
  );
  const match = label.match(pattern);
  if (!match) return false;

  const a = Number(match[1]);
  const b = Number(match[3]);
  const sides = [a, b].sort((x, y) => x - y);
  return sides[0] === shortSide && sides[1] === longSide;
}

/** Map a variant label (e.g. `12" x 18"` or `Medium`) to a named print size. */
export function resolveNamedFramedPictureSize(
  label: string | null | undefined,
): FramedPictureNamedSize | undefined {
  if (!label) return undefined;

  const normalized = label.toLowerCase().trim().replace(/\s+/g, ' ');
  const byLabel = (
    Object.entries(FRAMED_PICTURE_SIZE_LABELS) as Array<
      [FramedPictureNamedSize, string]
    >
  ).find(([, name]) => name.toLowerCase() === normalized);
  if (byLabel) return byLabel[0];

  /** Airtable size tiers that differ from legacy catalog keys. */
  const airtableAliases: Record<string, FramedPictureNamedSize> = {
    gallery: 'giant',
  };
  if (airtableAliases[normalized]) return airtableAliases[normalized];

  if (isFramedPictureNamedSize(normalized)) return normalized;

  for (const [key, spec] of Object.entries(FRAMED_PICTURE_SIZES) as Array<
    [FramedPictureNamedSize, FramedPictureSizeSpec]
  >) {
    if (matchesDimensionPair(label, spec.shortSide, spec.longSide)) return key;
  }

  return undefined;
}

export function resolveFramedPictureSize({
  size = 'medium',
}: {
  size?: FramedPictureNamedSize | FramedPictureSizeSpec;
}): FramedPictureSizeSpec {
  if (typeof size === 'string') return FRAMED_PICTURE_SIZES[size];
  return size;
}

/** @param {{selectedOptions?: Array<{name: string; value: string}>; title?: string | null}} variant */
export function getFramedSizeFromVariant(variant): FramedPictureNamedSize {
  const sizeOption = variant?.selectedOptions?.find(
    (option) => option.name.toLowerCase() === 'size',
  );
  return (
    resolveNamedFramedPictureSize(sizeOption?.value) ??
    resolveNamedFramedPictureSize(variant?.title) ??
    FRAMED_PICTURE_DEFAULT_NAMED_SIZE
  );
}

/** Human-readable size label for product option values. */
export function formatPrintSizeOptionLabel(
  optionName: string,
  valueName: string,
  orientation: PictureOrientation = 'vertical',
): string {
  if (optionName.toLowerCase() !== 'size') return valueName;

  const named = resolveNamedFramedPictureSize(valueName);
  if (!named) return valueName;

  const spec = FRAMED_PICTURE_SIZES[named];
  return `${FRAMED_PICTURE_SIZE_LABELS[named]} (${formatPrintDimensions(spec, orientation)})`;
}

/** Map a Shopify frame option label to a preview frame color. */
export function resolveFrameColorFromOption(value?: string | null): FrameColor {
  const normalized = value?.toLowerCase().trim() ?? '';
  if (normalized.includes('white')) return 'white';
  if (normalized.includes('natural') || normalized.includes('wood')) {
    return 'natural';
  }
  return 'black';
}

/** Map a Shopify mount option label to border vs full bleed. */
export function resolveMountFromOption(
  value?: string | null,
): 'border' | 'fullBleed' {
  const normalized = value?.toLowerCase().trim() ?? '';
  if (normalized.includes('full') || normalized.includes('bleed')) {
    return 'fullBleed';
  }
  return 'border';
}

function getSelectedOptionValue(
  variant:
    | {selectedOptions?: Array<{name: string; value: string}>}
    | null
    | undefined,
  optionName: string,
) {
  return variant?.selectedOptions?.find(
    (option) => option.name.toLowerCase() === optionName.toLowerCase(),
  )?.value;
}

/** @param {{selectedOptions?: Array<{name: string; value: string}>; title?: string | null}} variant */
export function getFramedPictureSpecFromVariant(
  variant:
    | {
        metafields?: VariantMetafield[] | null;
        selectedOptions?: Array<{name: string; value: string}>;
        title?: string | null;
      }
    | null
    | undefined,
  namedSize?: FramedPictureNamedSize,
  overrides?: {frame?: string | null; mount?: string | null},
  context?: {variantPool?: PrintVariantRef[]},
): FramedPictureSizeSpec {
  const fromMetafields = getFramedPictureSpecFromVariantMetafields(variant);
  const sizeKey = namedSize ?? getFramedSizeFromVariant(variant ?? {});
  const spec: FramedPictureSizeSpec =
    fromMetafields ??
    applyPartialVariantPrintMetafields(variant, {
      ...FRAMED_PICTURE_SIZES[sizeKey],
      referencePadding: FRAMED_PICTURE_SIZES[sizeKey].padding,
      referenceFrame: FRAMED_PICTURE_SIZES[sizeKey].frame,
    });

  const sizeLabel = getSelectedOptionValue(variant, 'size');
  const variantPool =
    context?.variantPool ?? (variant ? [variant as PrintVariantRef] : []);
  const referenceInsets = resolveReferenceInsetsForSize(sizeLabel, variantPool);

  spec.referencePadding = referenceInsets.referencePadding;
  spec.referenceFrame = referenceInsets.referenceFrame;
  spec.padding = referenceInsets.referencePadding;
  spec.frame = referenceInsets.referenceFrame;

  const frameValue =
    overrides?.frame ?? getSelectedOptionValue(variant, 'frame') ?? null;
  const mountValue =
    overrides?.mount ?? getSelectedOptionValue(variant, 'mount') ?? null;
  const normalizedFrame = frameValue?.toLowerCase().trim() ?? '';

  spec.frameColor = resolveFrameColorFromOption(frameValue);

  if (resolveMountFromOption(mountValue) === 'fullBleed') {
    spec.padding = 0;
  }

  if (
    normalizedFrame.includes('no frame') ||
    normalizedFrame.includes('unframed') ||
    normalizedFrame.includes('none')
  ) {
    spec.frame = 0;
  }

  return spec;
}

/** Framed-picture spec for catalog grid cards (collector / black / border). */
export function getCatalogFramedPictureSpec(product: {
  catalogDisplayVariant?: {
    metafields?: VariantMetafield[] | null;
    selectedOptions?: Array<{name: string; value: string}>;
    title?: string | null;
  } | null;
}): FramedPictureSizeSpec {
  return getFramedPictureSpecFromVariant(
    product.catalogDisplayVariant,
    FRAMED_PICTURE_CATALOG_DISPLAY_SIZE,
    {
      frame: FRAMED_PICTURE_CATALOG_DISPLAY_FRAME,
      mount: FRAMED_PICTURE_CATALOG_DISPLAY_MOUNT,
    },
  );
}

/** Sort Shopify size option values — prefers Airtable rank metafield, then legacy order. */
export function sortSizeOptionValues<
  T extends {
    name: string;
    firstSelectableVariant?: {
      metafields?: VariantMetafield[] | null;
    } | null;
  },
>(values: T[]): T[] {
  const legacyOrder = Object.keys(FRAMED_PICTURE_SIZES);

  return [...values].sort((a, b) => {
    const rankA =
      getVariantSizeRank(a.firstSelectableVariant) ??
      legacyOrder.indexOf(resolveNamedFramedPictureSize(a.name) ?? '');
    const rankB =
      getVariantSizeRank(b.firstSelectableVariant) ??
      legacyOrder.indexOf(resolveNamedFramedPictureSize(b.name) ?? '');

    if (rankA !== rankB) {
      const aValid = rankA >= 0;
      const bValid = rankB >= 0;
      if (aValid && bValid) return rankA - rankB;
      if (aValid) return -1;
      if (bValid) return 1;
    }

    return a.name.localeCompare(b.name);
  });
}

export type PrintSizingGuideVariantRow = {
  sizeLabel: string;
  frameLabel: string;
  mountLabel: string;
  printDimensions: string;
  matInches: number;
  mouldingInches: number;
  outerDimensions: string;
};

const PRINT_SIZING_GUIDE_FRAME_EXISTENCE_ORDER = ['Framed', 'No Frame'];
const PRINT_SIZING_GUIDE_MOUNT_ORDER = ['Border', 'Full Bleed'];

function isUnframedFrameLabel(frameLabel: string) {
  const normalized = frameLabel.toLowerCase().trim();
  return normalized.includes('no frame') || normalized.includes('unframed');
}

function deriveFrameExistenceOptions(frameOptions: string[]) {
  const hasFramed = frameOptions.some((frame) => !isUnframedFrameLabel(frame));
  const hasUnframed = frameOptions.some((frame) => isUnframedFrameLabel(frame));
  const options: string[] = [];
  if (hasFramed) options.push('Framed');
  if (hasUnframed) options.push('No Frame');
  return options.length > 0
    ? options
    : [...PRINT_SIZING_GUIDE_FRAME_EXISTENCE_ORDER];
}

function representativeFrameForExistence(
  frameExistence: string,
  frameOptions: string[],
) {
  if (frameExistence === 'No Frame' || isUnframedFrameLabel(frameExistence)) {
    return 'No Frame';
  }

  const framedOption = frameOptions.find(
    (frame) => !isUnframedFrameLabel(frame),
  );
  return framedOption ?? 'Black';
}

function isInvalidSizingGuideCombination(
  frameExistence: string,
  mountLabel: string,
) {
  return (
    frameExistence === 'No Frame' &&
    resolveMountFromOption(mountLabel) === 'fullBleed'
  );
}

function sizeRankForSizingGuide(sizeLabel: string) {
  const named = resolveNamedFramedPictureSize(sizeLabel);
  if (!named) return 999;
  const idx = FRAMED_PICTURE_NAMED_SIZE_ORDER.indexOf(named);
  return idx >= 0 ? idx : 999;
}

/** Match a loaded variant to the current size / frame / mount selection. */
export function resolvePrintVariantInPool(
  variantPool: PrintVariantRef[],
  sizeLabel: string,
  frameLabel: string,
  mountLabel: string,
) {
  return findVariantInPool(variantPool, sizeLabel, frameLabel, mountLabel);
}

function findVariantInPool(
  variantPool: PrintVariantRef[],
  sizeLabel: string,
  frameLabel: string,
  mountLabel: string,
) {
  const size = sizeLabel.toLowerCase().trim();
  const frame = frameLabel.toLowerCase().trim();
  const mount = mountLabel.toLowerCase().trim();

  return variantPool.find((variant) => {
    return (
      getSelectedOptionValue(variant, 'size')?.toLowerCase().trim() === size &&
      getSelectedOptionValue(variant, 'frame')?.toLowerCase().trim() ===
        frame &&
      getSelectedOptionValue(variant, 'mount')?.toLowerCase().trim() === mount
    );
  });
}

function comparePrintSizingGuideRows(
  a: PrintSizingGuideVariantRow,
  b: PrintSizingGuideVariantRow,
) {
  const rankA = sizeRankForSizingGuide(a.sizeLabel);
  const rankB = sizeRankForSizingGuide(b.sizeLabel);
  if (rankA !== rankB) return rankA - rankB;

  const frameA = PRINT_SIZING_GUIDE_FRAME_EXISTENCE_ORDER.indexOf(a.frameLabel);
  const frameB = PRINT_SIZING_GUIDE_FRAME_EXISTENCE_ORDER.indexOf(b.frameLabel);
  if (frameA !== frameB) {
    if (frameA < 0) return 1;
    if (frameB < 0) return -1;
    return frameA - frameB;
  }

  const mountA = PRINT_SIZING_GUIDE_MOUNT_ORDER.indexOf(a.mountLabel);
  const mountB = PRINT_SIZING_GUIDE_MOUNT_ORDER.indexOf(b.mountLabel);
  if (mountA !== mountB) {
    if (mountA < 0) return 1;
    if (mountB < 0) return -1;
    return mountA - mountB;
  }

  return a.sizeLabel.localeCompare(b.sizeLabel);
}

/** One row per size × frame presence × mount combination for the sizing guide. */
export function buildPrintSizingGuideVariantRows({
  sizeOptionValues = [],
  frameOptions = [],
  mountOptions = [],
  variantPool = [],
  orientation = 'vertical',
}: {
  sizeOptionValues?: Array<{
    name: string;
    firstSelectableVariant?: PrintVariantRef | null;
  }>;
  /** Product frame option labels — used to detect framed vs unframed, not permuted by color. */
  frameOptions?: string[];
  mountOptions?: string[];
  variantPool?: PrintVariantRef[];
  orientation?: PictureOrientation;
}): PrintSizingGuideVariantRow[] {
  const sizes = sizeOptionValues.length
    ? sortSizeOptionValues(sizeOptionValues)
    : FRAMED_PICTURE_NAMED_SIZE_ORDER.map((named) => ({
        name: FRAMED_PICTURE_SHOPIFY_SIZE_OPTION_LABELS[named],
        firstSelectableVariant: null,
      }));

  const frameExistenceOptions = deriveFrameExistenceOptions(frameOptions);
  const mounts =
    mountOptions.length > 0 ? mountOptions : PRINT_SIZING_GUIDE_MOUNT_ORDER;

  const rows: PrintSizingGuideVariantRow[] = [];

  for (const sizeValue of sizes) {
    const namedSize = resolveNamedFramedPictureSize(sizeValue.name);
    const templateKey = namedSize ?? 'medium';
    const template = FRAMED_PICTURE_SIZES[templateKey];
    const fallbackVariant = sizeValue.firstSelectableVariant ?? null;

    for (const frameExistence of frameExistenceOptions) {
      for (const mountLabel of mounts) {
        if (isInvalidSizingGuideCombination(frameExistence, mountLabel)) {
          continue;
        }

        const representativeFrame = representativeFrameForExistence(
          frameExistence,
          frameOptions,
        );
        const matchedVariant =
          findVariantInPool(
            variantPool,
            sizeValue.name,
            representativeFrame,
            mountLabel,
          ) ?? fallbackVariant;

        const spec = matchedVariant
          ? getFramedPictureSpecFromVariant(
              matchedVariant,
              namedSize,
              {frame: representativeFrame, mount: mountLabel},
              {variantPool},
            )
          : {
              ...template,
              referencePadding: template.padding,
              referenceFrame: template.frame,
              padding:
                resolveMountFromOption(mountLabel) === 'fullBleed'
                  ? 0
                  : template.padding,
              frame: frameExistence === 'No Frame' ? 0 : template.frame,
            };

        rows.push({
          sizeLabel: sizeValue.name,
          frameLabel: frameExistence,
          mountLabel,
          printDimensions: formatPrintDimensions(spec, orientation),
          matInches: spec.padding,
          mouldingInches: spec.frame,
          outerDimensions: formatOuterDimensions(spec, orientation),
        });
      }
    }
  }

  return rows.sort(comparePrintSizingGuideRows);
}

/** @deprecated Use buildPrintSizingGuideVariantRows */
export type PrintSizingGuideRow = {
  label: string;
  printDimensions: string;
  borderOuterDimensions: string;
  fullBleedOuterDimensions: string;
  matWidthInches: number | null;
};

/** @deprecated Use buildPrintSizingGuideVariantRows */
export function buildPrintSizingGuideRows({
  sizeOptionValues = [],
  variantPool = [],
  orientation = 'vertical',
  frame = 'Black',
}: {
  sizeOptionValues?: Array<{
    name: string;
    firstSelectableVariant?: PrintVariantRef | null;
  }>;
  variantPool?: PrintVariantRef[];
  orientation?: PictureOrientation;
  frame?: string | null;
}): PrintSizingGuideRow[] {
  const values = sizeOptionValues.length
    ? sortSizeOptionValues(sizeOptionValues)
    : FRAMED_PICTURE_NAMED_SIZE_ORDER.map((named) => ({
        name: FRAMED_PICTURE_SHOPIFY_SIZE_OPTION_LABELS[named],
        firstSelectableVariant: null,
      }));

  return values.map((value) => {
    const variant = value.firstSelectableVariant;
    const namedSize = resolveNamedFramedPictureSize(value.name);
    const templateKey = namedSize ?? 'medium';
    const template = FRAMED_PICTURE_SIZES[templateKey];

    const borderedSpec = variant
      ? getFramedPictureSpecFromVariant(
          variant,
          namedSize,
          {frame, mount: 'Border'},
          {variantPool},
        )
      : {
          ...template,
          referencePadding: template.padding,
          referenceFrame: template.frame,
        };

    const fullBleedSpec = variant
      ? getFramedPictureSpecFromVariant(
          variant,
          namedSize,
          {frame, mount: 'Full Bleed'},
          {variantPool},
        )
      : {
          ...borderedSpec,
          padding: 0,
        };

    return {
      label: value.name,
      printDimensions: formatPrintDimensions(borderedSpec, orientation),
      borderOuterDimensions: formatOuterDimensions(borderedSpec, orientation),
      fullBleedOuterDimensions: formatOuterDimensions(
        fullBleedSpec,
        orientation,
      ),
      matWidthInches:
        borderedSpec.referencePadding ?? borderedSpec.padding ?? null,
    };
  });
}
