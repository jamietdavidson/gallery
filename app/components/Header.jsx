import {Link, NavLink, useLocation} from 'react-router';
import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useOptimisticCart} from '@shopify/hydrogen';
import {motion} from 'framer-motion';
import {ChevronDown, Heart, Search, ShoppingBag} from 'lucide-react';
import {Sidebar} from '~/components/Sidebar';
import {useAside} from '~/components/Aside';
import {useDeferredCart} from '~/components/DeferredCart';
import {artistsPath, favouritesPath, printsPath, searchPath} from '~/lib/paths';
import {useFavoritesStore} from '~/lib/favorites-store';
import {getPageScrollTop, subscribePageScroll} from '~/lib/page-scroll';

import {Logo} from '~/components/Logo';
import {cn} from '~/lib/utils';
import {type} from '~/lib/typography';

const SCROLL_TOP_THRESHOLD = 8;
const SCROLL_FADE_DISTANCE = 120;
const SCROLL_DIRECTION_THRESHOLD = 6;
const HIDE_DELAY_MS = 280;
const SHOW_DELAY_MS = 280;
const SURFACE_TRANSITION_MS = 550;
const TOPBAR_VISIBILITY_TRANSITION = {duration: 0.55, ease: 'easeOut'};
const HEADER_ACTION_ICON_SIZE = 20;
const HEADER_ACTION_ICON_STROKE = 1.5;
const TOPBAR_DIM_OPACITY_CLASS = 'opacity-40';
const TOPBAR_DIM_TRANSITION_CLASS = 'transition-opacity duration-200';
const TOPBAR_ICON_STROKE_CLASS =
  '[&_svg]:transition-[stroke-width] [&_svg]:duration-200 hover:[&_svg]:stroke-2';

/** @param {import('~/components/AppPageLayout').TopbarColor} color */
function getNavLinkClass(color) {
  return cn(
    type.nav,
    'cursor-pointer underline-offset-4 transition-colors duration-200 hover:underline',
    color === 'white' ? 'text-white' : 'text-neutral-800',
  );
}

/** @param {import('~/components/AppPageLayout').TopbarColor} color */
function getIconClass(color) {
  return cn(
    'transition-colors duration-200',
    color === 'white' ? 'text-white' : 'text-neutral-900',
  );
}

/**
 * @param {{
 *   color: import('~/components/AppPageLayout').TopbarColor;
 *   mode: import('~/components/AppPageLayout').TopbarMode;
 *   backgroundProgress: number;
 * }}
 */
function getHeaderSurfaceStyle({color, mode, backgroundProgress}) {
  if (mode === 'filled') {
    return {
      backgroundColor: color === 'black' ? '#ffffff' : '#000000',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    };
  }

  if (color === 'white') {
    return {
      backgroundColor: 'transparent',
      backdropFilter: 'none',
      WebkitBackdropFilter: 'none',
    };
  }

  return {
    backgroundColor: `rgba(255, 255, 255, ${backgroundProgress * 0.92})`,
    backdropFilter: `blur(${backgroundProgress * 10}px)`,
    WebkitBackdropFilter: `blur(${backgroundProgress * 10}px)`,
  };
}

function useScrollDirectionHeader({
  autohide = true,
  forceVisible = false,
  mode = 'filled',
} = {}) {
  const [isVisible, setIsVisible] = useState(true);
  const [backgroundProgress, setBackgroundProgress] = useState(0);
  const lastScrollY = useRef(0);
  const committedDirection = useRef(/** @type {'up' | 'down' | null} */ (null));
  const visibilityTimer = useRef(null);
  const keepVisible = !autohide || forceVisible;

  useEffect(() => {
    const clearVisibilityTimer = () => {
      if (visibilityTimer.current) {
        clearTimeout(visibilityTimer.current);
        visibilityTimer.current = null;
      }
    };

    const scheduleVisibility = (visible, delay) => {
      clearVisibilityTimer();
      visibilityTimer.current = setTimeout(() => {
        setIsVisible(visible);
        visibilityTimer.current = null;
      }, delay);
    };

    const onScroll = () => {
      const currentScrollY = getPageScrollTop();
      const atTop = currentScrollY <= SCROLL_TOP_THRESHOLD;
      const progress = Math.min(
        Math.max(currentScrollY / SCROLL_FADE_DISTANCE, 0),
        1,
      );
      const delta = currentScrollY - lastScrollY.current;

      if (atTop || committedDirection.current === 'down' || mode === 'filled') {
        const nextProgress = mode === 'filled' ? 1 : 0;
        setBackgroundProgress((current) =>
          current === nextProgress ? current : nextProgress,
        );
      } else if (committedDirection.current === 'up') {
        setBackgroundProgress((current) =>
          current === progress ? current : progress,
        );
      }

      if (keepVisible) {
        lastScrollY.current = currentScrollY;
        return;
      }

      if (atTop) {
        clearVisibilityTimer();
        setIsVisible((current) => (current ? current : true));
        committedDirection.current = null;
        lastScrollY.current = currentScrollY;
        return;
      }

      if (Math.abs(delta) < SCROLL_DIRECTION_THRESHOLD) {
        return;
      }

      const direction = delta > 0 ? 'down' : 'up';

      if (direction === committedDirection.current) {
        lastScrollY.current = currentScrollY;
        return;
      }

      committedDirection.current = direction;

      if (direction === 'down') {
        setBackgroundProgress((current) => (current === 0 ? current : 0));
        scheduleVisibility(false, HIDE_DELAY_MS);
      } else {
        setBackgroundProgress((current) =>
          current === progress ? current : progress,
        );
        scheduleVisibility(true, SHOW_DELAY_MS);
      }

      lastScrollY.current = currentScrollY;
    };

    if (keepVisible) {
      clearVisibilityTimer();
      setIsVisible(true);
    }

    lastScrollY.current = getPageScrollTop();
    onScroll();

    const unsubscribe = subscribePageScroll(onScroll);

    return () => {
      unsubscribe();
      clearVisibilityTimer();
    };
  }, [keepVisible, mode]);

  return {isVisible: keepVisible || isVisible, backgroundProgress};
}

/**
 * Animate topbar surface on mode/color changes; keep scroll-driven updates instant.
 * @param {ReturnType<typeof getHeaderSurfaceStyle>} surfaceStyle
 * @param {import('~/components/AppPageLayout').TopbarColor} color
 * @param {import('~/components/AppPageLayout').TopbarMode} mode
 */
function useAnimatedSurfaceStyle(surfaceStyle, color, mode) {
  const [style, setStyle] = useState(surfaceStyle);
  const [transitioning, setTransitioning] = useState(false);
  const configRef = useRef({color, mode});
  const {backgroundColor, backdropFilter, WebkitBackdropFilter} = surfaceStyle;

  useLayoutEffect(() => {
    const nextStyle = {
      backgroundColor,
      backdropFilter,
      WebkitBackdropFilter,
    };
    const configChanged =
      configRef.current.color !== color || configRef.current.mode !== mode;

    if (configChanged) {
      configRef.current = {color, mode};
      setTransitioning(true);

      const frame = requestAnimationFrame(() => {
        setStyle((current) =>
          stylesEqual(current, nextStyle) ? current : nextStyle,
        );
      });
      const timer = setTimeout(
        () => setTransitioning(false),
        SURFACE_TRANSITION_MS,
      );

      return () => {
        cancelAnimationFrame(frame);
        clearTimeout(timer);
      };
    }

    setStyle((current) =>
      stylesEqual(current, nextStyle) ? current : nextStyle,
    );
    return undefined;
  }, [backgroundColor, backdropFilter, WebkitBackdropFilter, color, mode]);

  const transition = transitioning
    ? `background-color ${SURFACE_TRANSITION_MS}ms ease-out, backdrop-filter ${SURFACE_TRANSITION_MS}ms ease-out, -webkit-backdrop-filter ${SURFACE_TRANSITION_MS}ms ease-out`
    : 'none';

  return {style, transition};
}

/** @param {ReturnType<typeof getHeaderSurfaceStyle>} a @param {ReturnType<typeof getHeaderSurfaceStyle>} b */
function stylesEqual(a, b) {
  return (
    a.backgroundColor === b.backgroundColor &&
    a.backdropFilter === b.backdropFilter &&
    a.WebkitBackdropFilter === b.WebkitBackdropFilter
  );
}

/**
 * @param {{
 *   color?: import('~/components/AppPageLayout').TopbarColor;
 *   mode?: import('~/components/AppPageLayout').TopbarMode;
 *   autohide?: boolean;
 * }}
 */
export function Header({color = 'black', mode = 'filled', autohide = true}) {
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRightIconsHovered, setIsRightIconsHovered] = useState(false);
  const [hoveredRightIcon, setHoveredRightIcon] = useState(
    /** @type {string | null} */ (null),
  );
  const {open: openAside} = useAside();
  const {cart: resolvedCart} = useDeferredCart();
  const cart = useOptimisticCart(resolvedCart);
  const {isVisible, backgroundProgress} = useScrollDirectionHeader({
    autohide,
    forceVisible: sidebarOpen,
    mode,
  });
  const surfaceStyle = getHeaderSurfaceStyle({color, mode, backgroundProgress});
  const {style: animatedSurfaceStyle, transition: surfaceTransition} =
    useAnimatedSurfaceStyle(surfaceStyle, color, mode);
  const effectiveColor =
    isHomePage && !sidebarOpen && backgroundProgress === 0 ? 'white' : color;
  const navClass = getNavLinkClass(effectiveColor);
  const iconClass = getIconClass(effectiveColor);
  const showTopbarBorder =
    mode === 'filled' ||
    (mode === 'transparent' && color === 'black' && backgroundProgress > 0);

  /** @param {string} id */
  const getRightIconDimClass = (id) =>
    cn(
      TOPBAR_DIM_TRANSITION_CLASS,
      isRightIconsHovered &&
        hoveredRightIcon !== id &&
        TOPBAR_DIM_OPACITY_CLASS,
    );

  const rightIconsHoverHandlers = {
    onMouseEnter: () => setIsRightIconsHovered(true),
    onMouseLeave: () => {
      setIsRightIconsHovered(false);
      setHoveredRightIcon(null);
    },
  };

  /** @param {string} id */
  const getRightIconHoverHandlers = (id) => ({
    onMouseEnter: () => setHoveredRightIcon(id),
    onMouseLeave: () => setHoveredRightIcon(null),
  });

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 z-60 flex h-[var(--header-height)] items-center gap-5 pl-5 md:pl-6"
        initial={false}
        animate={{opacity: isVisible ? 1 : 0}}
        transition={TOPBAR_VISIBILITY_TRANSITION}
        style={{pointerEvents: isVisible ? 'auto' : 'none'}}
      >
        <button
          type="button"
          data-shop-toggle
          className={cn(
            'flex items-center border-0 bg-transparent p-0',
            navClass,
          )}
          aria-expanded={sidebarOpen}
          aria-haspopup="dialog"
          aria-label={sidebarOpen ? 'Close shop menu' : 'Open shop menu'}
          onClick={() => {
            setSidebarOpen(!sidebarOpen);
          }}
        >
          <span className="inline-flex items-center gap-1.5">
            Shop
            <ChevronDown
              size={14}
              strokeWidth={2}
              className={cn(
                'shrink-0 transition-transform duration-200',
                sidebarOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </span>
        </button>

        <nav className="hidden items-center gap-5 lg:flex" aria-label="Primary">
          <NavLink to={printsPath()} className={navClass}>
            Prints
          </NavLink>
          <NavLink to={artistsPath()} className={navClass}>
            Artists
          </NavLink>
        </nav>
      </motion.div>

      <motion.header
        className={cn(
          'fixed top-0 left-0 right-0 z-40 box-border h-[var(--header-height)] border-b',
          showTopbarBorder ? 'border-neutral-100' : 'border-transparent',
        )}
        initial={false}
        animate={{opacity: isVisible ? 1 : 0}}
        transition={TOPBAR_VISIBILITY_TRANSITION}
        style={{
          pointerEvents: isVisible ? 'auto' : 'none',
          transition: surfaceTransition,
          ...animatedSurfaceStyle,
        }}
      >
        <div className="grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-5 md:px-6">
          <div aria-hidden="true" className="min-w-0 justify-self-start" />

          <Link
            to="/"
            className="col-start-2 row-start-1 justify-self-center text-center"
          >
            <Logo color={effectiveColor} format="long" />
          </Link>

          <div
            className="flex min-w-0 items-center justify-end justify-self-end gap-5"
            {...rightIconsHoverHandlers}
          >
            <NavLink
              to={searchPath()}
              className={cn(
                'cursor-pointer',
                iconClass,
                TOPBAR_ICON_STROKE_CLASS,
                getRightIconDimClass('search'),
              )}
              aria-label="Search"
              {...getRightIconHoverHandlers('search')}
            >
              <Search
                size={HEADER_ACTION_ICON_SIZE}
                strokeWidth={HEADER_ACTION_ICON_STROKE}
              />
            </NavLink>
            <FavouritesLink
              color={effectiveColor}
              dimClass={getRightIconDimClass('favourites')}
              hoverHandlers={getRightIconHoverHandlers('favourites')}
            />
            <CartBadge
              count={cart?.totalQuantity ?? 0}
              color={effectiveColor}
              onClick={() => openAside('cart')}
              dimClass={getRightIconDimClass('cart')}
              hoverHandlers={getRightIconHoverHandlers('cart')}
            />
          </div>
        </div>
      </motion.header>

      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
    </>
  );
}

/** @param {{
 *   color: import('~/components/AppPageLayout').TopbarColor;
 *   dimClass?: string;
 *   hoverHandlers?: {
 *     onMouseEnter: () => void;
 *     onMouseLeave: () => void;
 *   };
 * }} */
function FavouritesLink({color, dimClass, hoverHandlers}) {
  const hasHydrated = useFavoritesStore((state) => state.hasHydrated);
  const hasReconciled = useFavoritesStore((state) => state.hasReconciled);
  const count = useFavoritesStore((state) => state.ids.length);

  return (
    <NavLink
      to={favouritesPath()}
      className={cn(
        'relative cursor-pointer',
        getIconClass(color),
        TOPBAR_ICON_STROKE_CLASS,
        dimClass,
      )}
      aria-label="Favourites"
      {...hoverHandlers}
    >
      <Heart
        size={HEADER_ACTION_ICON_SIZE}
        strokeWidth={HEADER_ACTION_ICON_STROKE}
      />
      {hasHydrated && hasReconciled && count > 0 ? (
        <span
          className={cn(
            'absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white',
            type.micro,
          )}
        >
          {count}
        </span>
      ) : null}
    </NavLink>
  );
}

/** @param {{
 *   count: number;
 *   color: import('~/components/AppPageLayout').TopbarColor;
 *   onClick: () => void;
 *   dimClass?: string;
 *   hoverHandlers?: {
 *     onMouseEnter: () => void;
 *     onMouseLeave: () => void;
 *   };
 * }} */
function CartBadge({count, color, onClick, dimClass, hoverHandlers}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative cursor-pointer',
        getIconClass(color),
        TOPBAR_ICON_STROKE_CLASS,
        dimClass,
      )}
      aria-label="Open cart"
      {...hoverHandlers}
    >
      <ShoppingBag
        size={HEADER_ACTION_ICON_SIZE}
        strokeWidth={HEADER_ACTION_ICON_STROKE}
      />
      {count > 0 && (
        <span
          className={cn(
            'absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full',
            type.micro,
            color === 'white'
              ? 'bg-white text-neutral-900'
              : 'bg-neutral-900 text-white',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}
