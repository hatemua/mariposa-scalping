'use client';

import { useState, useEffect } from 'react';
import { BREAKPOINTS, type Breakpoint } from '@/lib/responsive';

interface ResponsiveState {
  currentBreakpoint: Breakpoint;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  width: number;
  height: number;
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = useState<ResponsiveState>({
    currentBreakpoint: 'sm',
    isMobile: true,
    isTablet: false,
    isDesktop: false,
    width: 0,
    height: 0
  });

  useEffect(() => {
    const updateState = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      let currentBreakpoint: Breakpoint = 'sm';
      if (width >= BREAKPOINTS['2xl']) currentBreakpoint = '2xl';
      else if (width >= BREAKPOINTS.xl) currentBreakpoint = 'xl';
      else if (width >= BREAKPOINTS.lg) currentBreakpoint = 'lg';
      else if (width >= BREAKPOINTS.md) currentBreakpoint = 'md';

      setState({
        currentBreakpoint,
        isMobile: width < BREAKPOINTS.md,
        isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
        isDesktop: width >= BREAKPOINTS.lg,
        width,
        height
      });
    };

    // Initial state
    updateState();

    // Listen for resize events
    const handleResize = () => {
      // Debounce resize events for performance
      clearTimeout((window as any).resizeTimeout);
      (window as any).resizeTimeout = setTimeout(updateState, 100);
    };

    window.addEventListener('resize', handleResize);

    // Listen for orientation change on mobile
    window.addEventListener('orientationchange', () => {
      setTimeout(updateState, 100);
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', updateState);
      clearTimeout((window as any).resizeTimeout);
    };
  }, []);

  return state;
}

export function useBreakpoint(breakpoint: Breakpoint): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const query = `(min-width: ${BREAKPOINTS[breakpoint]}px)`;
    const mediaQuery = window.matchMedia(query);

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [breakpoint]);

  return matches;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);

    const handleChange = (e: MediaQueryListEvent) => {
      setMatches(e.matches);
    };

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [query]);

  return matches;
}

export function useViewportSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      setSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    updateSize();

    const handleResize = () => {
      clearTimeout((window as any).viewportTimeout);
      (window as any).viewportTimeout = setTimeout(updateSize, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout((window as any).viewportTimeout);
    };
  }, []);

  return size;
}

export function useOrientation() {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    const updateOrientation = () => {
      setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
    };

    updateOrientation();

    window.addEventListener('orientationchange', updateOrientation);
    window.addEventListener('resize', updateOrientation);

    return () => {
      window.removeEventListener('orientationchange', updateOrientation);
      window.removeEventListener('resize', updateOrientation);
    };
  }, []);

  return orientation;
}

export function useTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  return isTouch;
}

export function useHover() {
  const [hasHover, setHasHover] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(hover: hover)');
    setHasHover(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setHasHover(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return hasHover;
}