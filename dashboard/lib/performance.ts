/**
 * Performance optimization utilities for the dashboard
 */

// Debounce utility for API calls and expensive operations
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Throttle utility for scroll events and frequent updates
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// Memoization utility for expensive calculations
export const memoize = <T extends (...args: any[]) => any>(
  fn: T,
  keyGenerator?: (...args: Parameters<T>) => string
): T => {
  const cache = new Map<string, ReturnType<T>>();

  return ((...args: Parameters<T>): ReturnType<T> => {
    const key = keyGenerator ? keyGenerator(...args) : JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);

    // Clear cache if it gets too large (prevent memory leaks)
    if (cache.size > 100) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    return result;
  }) as T;
};

// Batch multiple operations into a single animation frame
export const batchUpdates = (() => {
  const queue: Array<() => void> = [];
  let isScheduled = false;

  const flush = () => {
    while (queue.length > 0) {
      const callback = queue.shift();
      if (callback) callback();
    }
    isScheduled = false;
  };

  return (callback: () => void) => {
    queue.push(callback);
    if (!isScheduled) {
      isScheduled = true;
      requestAnimationFrame(flush);
    }
  };
})();

// Virtual scrolling helper for large lists
export const createVirtualScrollManager = (
  itemHeight: number,
  containerHeight: number,
  buffer: number = 5
) => {
  return {
    getVisibleRange: (scrollTop: number, totalItems: number) => {
      const visibleItems = Math.ceil(containerHeight / itemHeight);
      const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
      const endIndex = Math.min(totalItems - 1, startIndex + visibleItems + 2 * buffer);

      return { startIndex, endIndex, visibleItems };
    },

    getTotalHeight: (totalItems: number) => totalItems * itemHeight,

    getItemStyle: (index: number, startIndex: number) => ({
      position: 'absolute' as const,
      top: (startIndex + index) * itemHeight,
      height: itemHeight,
      width: '100%'
    })
  };
};

// Lazy loading utility for images and heavy components
export const createLazyLoader = (threshold: number = 0.1) => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const element = entry.target as HTMLElement;
          const callback = element.dataset.lazyCallback;
          if (callback) {
            // Execute the lazy loading callback
            const fn = (window as any)[callback];
            if (typeof fn === 'function') {
              fn(element);
            }
          }
          observer.unobserve(element);
        }
      });
    },
    { threshold }
  );

  return {
    observe: (element: HTMLElement, callback: string) => {
      element.dataset.lazyCallback = callback;
      observer.observe(element);
    },
    unobserve: (element: HTMLElement) => {
      observer.unobserve(element);
    },
    disconnect: () => observer.disconnect()
  };
};

// Memory usage monitor
export const memoryMonitor = {
  getMemoryUsage: (): MemoryInfo | null => {
    if ('memory' in performance) {
      return (performance as any).memory;
    }
    return null;
  },

  logMemoryUsage: (label: string = 'Memory Usage') => {
    const memory = memoryMonitor.getMemoryUsage();
    if (memory) {
      console.log(`${label}:`, {
        used: `${(memory.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        total: `${(memory.totalJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
        limit: `${(memory.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`
      });
    }
  }
};

// Performance timing utilities
export const performanceTiming = {
  start: (label: string) => {
    performance.mark(`${label}-start`);
  },

  end: (label: string) => {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);

    const measure = performance.getEntriesByName(label, 'measure')[0];
    if (measure) {
      console.log(`${label}: ${measure.duration.toFixed(2)}ms`);
    }

    // Clean up marks and measures
    performance.clearMarks(`${label}-start`);
    performance.clearMarks(`${label}-end`);
    performance.clearMeasures(label);
  }
};

// Efficient array operations for large datasets
export const arrayUtils = {
  chunk: <T>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  },

  binarySearch: <T>(
    array: T[],
    target: T,
    compareFn: (a: T, b: T) => number
  ): number => {
    let left = 0;
    let right = array.length - 1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const comparison = compareFn(array[mid], target);

      if (comparison === 0) {
        return mid;
      } else if (comparison < 0) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return -1;
  },

  deduplicate: <T>(array: T[], keyFn?: (item: T) => any): T[] => {
    if (!keyFn) {
      return [...new Set(array)];
    }

    const seen = new Set();
    return array.filter(item => {
      const key = keyFn(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
};

// Cache management for API responses
export class ResponseCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();

  set(key: string, data: any, ttl: number = 300000): void { // 5 minute default TTL
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });

    // Clean up expired entries periodically
    if (this.cache.size > 50) {
      this.cleanup();
    }
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Global cache instance
export const apiCache = new ResponseCache();

// React optimization hooks
export const usePerformance = () => {
  return {
    debounce,
    throttle,
    memoize,
    batchUpdates,
    memoryMonitor,
    performanceTiming
  };
};