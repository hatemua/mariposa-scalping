import { useRef, useEffect, useCallback, useState } from 'react';

interface UseSmartRefreshOptions {
  refreshFn: () => void | Promise<void>;
  interval: number; // milliseconds
  enabled?: boolean;
  pauseOnHover?: boolean;
  pauseOnFocus?: boolean;
  pauseOnInteraction?: boolean;
  interactionPauseDuration?: number; // milliseconds
}

interface SmartRefreshControls {
  isRefreshing: boolean;
  isPaused: boolean;
  lastRefresh: Date | null;
  manualRefresh: () => void;
  pause: () => void;
  resume: () => void;
  elementRef: React.RefObject<HTMLDivElement>;
}

export function useSmartRefresh(options: UseSmartRefreshOptions): SmartRefreshControls {
  const {
    refreshFn,
    interval,
    enabled = true,
    pauseOnHover = true,
    pauseOnFocus = true,
    pauseOnInteraction = true,
    interactionPauseDuration = 10000, // 10 seconds
  } = options;

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [hasFocus, setHasFocus] = useState(false);
  const [interactionPauseUntil, setInteractionPauseUntil] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const elementRef = useRef<HTMLDivElement>(null);

  // Manual refresh function
  const manualRefresh = useCallback(async () => {
    if (isRefreshing) return;

    try {
      setIsRefreshing(true);
      await refreshFn();
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Manual refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshFn, isRefreshing]);

  // Auto refresh function
  const autoRefresh = useCallback(async () => {
    if (isRefreshing) return;

    // Check if we should pause for interaction
    const now = new Date();
    if (interactionPauseUntil && now < interactionPauseUntil) {
      return; // Still in interaction pause period
    }

    // Check other pause conditions
    if (isPaused || (pauseOnHover && isHovered) || (pauseOnFocus && hasFocus)) {
      return;
    }

    try {
      setIsRefreshing(true);
      await refreshFn();
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Auto refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshFn, isRefreshing, isPaused, isHovered, hasFocus, pauseOnHover, pauseOnFocus, interactionPauseUntil]);

  // Pause/Resume controls
  const pause = useCallback(() => setIsPaused(true), []);
  const resume = useCallback(() => setIsPaused(false), []);

  // Handle user interactions
  const handleInteraction = useCallback(() => {
    if (pauseOnInteraction) {
      const pauseUntil = new Date(Date.now() + interactionPauseDuration);
      setInteractionPauseUntil(pauseUntil);
    }
  }, [pauseOnInteraction, interactionPauseDuration]);

  // Set up event listeners for the component
  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleMouseEnter = () => setIsHovered(true);
    const handleMouseLeave = () => setIsHovered(false);

    const handleFocusIn = () => setHasFocus(true);
    const handleFocusOut = () => setHasFocus(false);

    const handleClick = handleInteraction;
    const handleKeyDown = handleInteraction;
    const handleScroll = handleInteraction;

    // Mouse events
    element.addEventListener('mouseenter', handleMouseEnter);
    element.addEventListener('mouseleave', handleMouseLeave);

    // Focus events (for inputs, dropdowns, etc.)
    element.addEventListener('focusin', handleFocusIn);
    element.addEventListener('focusout', handleFocusOut);

    // Interaction events
    element.addEventListener('click', handleClick);
    element.addEventListener('keydown', handleKeyDown);
    element.addEventListener('scroll', handleScroll);

    return () => {
      element.removeEventListener('mouseenter', handleMouseEnter);
      element.removeEventListener('mouseleave', handleMouseLeave);
      element.removeEventListener('focusin', handleFocusIn);
      element.removeEventListener('focusout', handleFocusOut);
      element.removeEventListener('click', handleClick);
      element.removeEventListener('keydown', handleKeyDown);
      element.removeEventListener('scroll', handleScroll);
    };
  }, [handleInteraction]);

  // Set up auto-refresh interval
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(autoRefresh, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, interval, autoRefresh]);

  // Initial refresh
  useEffect(() => {
    if (enabled && !lastRefresh) {
      manualRefresh();
    }
  }, [enabled, lastRefresh, manualRefresh]);

  return {
    isRefreshing,
    isPaused: isPaused || (pauseOnHover && isHovered) || (pauseOnFocus && hasFocus) || (interactionPauseUntil ? new Date() < interactionPauseUntil : false),
    lastRefresh,
    manualRefresh,
    pause,
    resume,
    elementRef,
  };
}

// Refresh speed modes
export const REFRESH_SPEEDS = {
  FAST: 0.5,    // 50% faster
  NORMAL: 1.0,  // Normal speed
  SLOW: 2.0,    // 50% slower
} as const;

export type RefreshSpeed = keyof typeof REFRESH_SPEEDS;

// Utility function to apply speed multiplier
export function applyRefreshSpeed(baseInterval: number, speed: RefreshSpeed): number {
  return Math.round(baseInterval * REFRESH_SPEEDS[speed]);
}