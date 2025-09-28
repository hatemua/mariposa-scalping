// Responsive design utilities for the dashboard

/**
 * Breakpoint utilities
 */
export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536
} as const;

export type Breakpoint = keyof typeof BREAKPOINTS;

/**
 * Check if current viewport matches a breakpoint
 */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= BREAKPOINTS[breakpoint];
}

/**
 * Get current breakpoint
 */
export function getCurrentBreakpoint(): Breakpoint {
  if (typeof window === 'undefined') return 'sm';

  const width = window.innerWidth;

  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  return 'sm';
}

/**
 * Mobile detection utilities
 */
export class MobileUtils {
  static isMobile(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < BREAKPOINTS.md;
  }

  static isTablet(): boolean {
    if (typeof window === 'undefined') return false;
    const width = window.innerWidth;
    return width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
  }

  static isDesktop(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= BREAKPOINTS.lg;
  }

  static isTouchDevice(): boolean {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  static hasHover(): boolean {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(hover: hover)').matches;
  }

  static prefersLargeText(): boolean {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

/**
 * Responsive grid utilities
 */
export class GridUtils {
  static getResponsiveColumns(
    totalItems: number,
    options: {
      sm?: number;
      md?: number;
      lg?: number;
      xl?: number;
      maxColumns?: number;
    } = {}
  ): string {
    const { sm = 1, md = 2, lg = 3, xl = 4, maxColumns = 6 } = options;

    const cols = {
      sm: Math.min(totalItems, sm, maxColumns),
      md: Math.min(totalItems, md, maxColumns),
      lg: Math.min(totalItems, lg, maxColumns),
      xl: Math.min(totalItems, xl, maxColumns)
    };

    return `grid-cols-${cols.sm} md:grid-cols-${cols.md} lg:grid-cols-${cols.lg} xl:grid-cols-${cols.xl}`;
  }

  static getOptimalGridColumns(containerWidth: number, itemMinWidth: number): number {
    const gap = 24; // 1.5rem gap
    const availableWidth = containerWidth - gap;
    const itemsPerRow = Math.floor(availableWidth / (itemMinWidth + gap));
    return Math.max(1, itemsPerRow);
  }
}

/**
 * Touch gesture utilities
 */
export class TouchUtils {
  static createSwipeDetector(
    element: HTMLElement,
    options: {
      onSwipeLeft?: () => void;
      onSwipeRight?: () => void;
      onSwipeUp?: () => void;
      onSwipeDown?: () => void;
      threshold?: number;
    }
  ): () => void {
    const { threshold = 50 } = options;
    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      endX = e.changedTouches[0].clientX;
      endY = e.changedTouches[0].clientY;

      const deltaX = endX - startX;
      const deltaY = endY - startY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0) {
            options.onSwipeRight?.();
          } else {
            options.onSwipeLeft?.();
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > threshold) {
          if (deltaY > 0) {
            options.onSwipeDown?.();
          } else {
            options.onSwipeUp?.();
          }
        }
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }

  static preventScrollBounce(element: HTMLElement): () => void {
    const preventBounce = (e: TouchEvent) => {
      const { scrollTop, scrollHeight, clientHeight } = element;

      if (scrollTop === 0 && e.touches[0].clientY > e.touches[0].clientY) {
        e.preventDefault();
      }

      if (scrollTop + clientHeight === scrollHeight && e.touches[0].clientY < e.touches[0].clientY) {
        e.preventDefault();
      }
    };

    element.addEventListener('touchmove', preventBounce, { passive: false });

    return () => {
      element.removeEventListener('touchmove', preventBounce);
    };
  }
}

/**
 * Viewport utilities
 */
export class ViewportUtils {
  static getViewportHeight(): number {
    if (typeof window === 'undefined') return 0;
    return window.innerHeight || document.documentElement.clientHeight;
  }

  static getViewportWidth(): number {
    if (typeof window === 'undefined') return 0;
    return window.innerWidth || document.documentElement.clientWidth;
  }

  static getScrollPosition(): { x: number; y: number } {
    if (typeof window === 'undefined') return { x: 0, y: 0 };
    return {
      x: window.pageXOffset || document.documentElement.scrollLeft,
      y: window.pageYOffset || document.documentElement.scrollTop
    };
  }

  static isElementInViewport(element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    const viewportHeight = this.getViewportHeight();
    const viewportWidth = this.getViewportWidth();

    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= viewportHeight &&
      rect.right <= viewportWidth
    );
  }

  static getElementVisibility(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    const viewportHeight = this.getViewportHeight();
    const viewportWidth = this.getViewportWidth();

    const elementArea = rect.width * rect.height;

    const visibleWidth = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    const visibleArea = visibleWidth * visibleHeight;

    return elementArea > 0 ? visibleArea / elementArea : 0;
  }
}

/**
 * Performance utilities for mobile
 */
export class PerformanceUtils {
  static debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<T>) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  static throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  static requestIdleCallback(callback: () => void): void {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(callback);
    } else {
      setTimeout(callback, 1);
    }
  }

  static prefersReducedData(): boolean {
    if (typeof navigator === 'undefined') return false;
    return (navigator as any).connection?.saveData === true;
  }

  static getConnectionSpeed(): 'slow' | 'fast' | 'unknown' {
    if (typeof navigator === 'undefined') return 'unknown';

    const connection = (navigator as any).connection;
    if (!connection) return 'unknown';

    const effectiveType = connection.effectiveType;
    if (effectiveType === 'slow-2g' || effectiveType === '2g') return 'slow';
    if (effectiveType === '3g' || effectiveType === '4g') return 'fast';

    return 'unknown';
  }
}

/**
 * CSS utilities for responsive design
 */
export class CSSUtils {
  static generateResponsiveClass(
    property: string,
    values: Partial<Record<Breakpoint, string>>
  ): string {
    const classes: string[] = [];

    Object.entries(values).forEach(([breakpoint, value]) => {
      if (breakpoint === 'sm') {
        classes.push(`${property}-${value}`);
      } else {
        classes.push(`${breakpoint}:${property}-${value}`);
      }
    });

    return classes.join(' ');
  }

  static getResponsiveSpacing(
    type: 'p' | 'm' | 'px' | 'py' | 'mx' | 'my' | 'pt' | 'pb' | 'pl' | 'pr' | 'mt' | 'mb' | 'ml' | 'mr',
    values: Partial<Record<Breakpoint, number>>
  ): string {
    return this.generateResponsiveClass(type, values as any);
  }

  static getResponsiveTextSize(
    sizes: Partial<Record<Breakpoint, string>>
  ): string {
    return this.generateResponsiveClass('text', sizes);
  }
}