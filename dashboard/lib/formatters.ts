/**
 * Safe number formatting utilities to prevent toFixed errors on undefined/null values
 */

export const safeNumber = {
  /**
   * Safely format a number with toFixed, returning fallback if invalid
   */
  toFixed: (value: number | undefined | null, decimals: number = 2, fallback: string = '0'): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return fallback;
    }
    return value.toFixed(decimals);
  },

  /**
   * Format currency with safe toFixed
   */
  currency: (value: number | undefined | null, decimals: number = 2, fallback: string = '$0.00'): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return fallback;
    }
    return `$${value.toFixed(decimals)}`;
  },

  /**
   * Format percentage with safe toFixed
   */
  percentage: (value: number | undefined | null, decimals: number = 1, fallback: string = '0%'): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return fallback;
    }
    return `${value.toFixed(decimals)}%`;
  },

  /**
   * Format number with units (K, M, B)
   */
  withUnits: (value: number | undefined | null, decimals: number = 1, fallback: string = '0'): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return fallback;
    }

    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) {
      return `${(value / 1_000_000_000).toFixed(decimals)}B`;
    }
    if (abs >= 1_000_000) {
      return `${(value / 1_000_000).toFixed(decimals)}M`;
    }
    if (abs >= 1_000) {
      return `${(value / 1_000).toFixed(decimals)}K`;
    }
    return value.toFixed(decimals);
  },

  /**
   * Format price with appropriate decimal places based on value
   */
  price: (value: number | undefined | null, fallback: string = '$0.0000'): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return fallback;
    }

    if (value >= 1) return `$${value.toFixed(4)}`;
    if (value >= 0.01) return `$${value.toFixed(6)}`;
    return `$${value.toFixed(8)}`;
  },

  /**
   * Check if a value is a valid number
   */
  isValid: (value: any): value is number => {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  },

  /**
   * Get a safe numeric value with fallback
   */
  getValue: (value: number | undefined | null, fallback: number = 0): number => {
    if (value === undefined || value === null || isNaN(value)) {
      return fallback;
    }
    return value;
  }
};

/**
 * Safe array utilities to prevent length/map errors on undefined/null arrays
 */
export const safeArray = {
  /**
   * Safely map over an array, returning empty array if undefined
   */
  map: <T, R>(array: T[] | undefined | null, callback: (item: T, index: number, arr: T[]) => R): R[] => {
    if (!array || !Array.isArray(array)) {
      return [];
    }
    return array.map(callback);
  },

  /**
   * Safely filter an array, returning empty array if undefined
   */
  filter: <T>(array: T[] | undefined | null, callback: (item: T, index: number, arr: T[]) => boolean): T[] => {
    if (!array || !Array.isArray(array)) {
      return [];
    }
    return array.filter(callback);
  },

  /**
   * Safely get array length, returning 0 if undefined
   */
  length: (array: any[] | undefined | null): number => {
    if (!array || !Array.isArray(array)) {
      return 0;
    }
    return array.length;
  },

  /**
   * Safely slice an array, returning empty array if undefined
   */
  slice: <T>(array: T[] | undefined | null, start?: number, end?: number): T[] => {
    if (!array || !Array.isArray(array)) {
      return [];
    }
    return array.slice(start, end);
  },

  /**
   * Get a safe array value with fallback
   */
  getValue: <T>(array: T[] | undefined | null, fallback: T[] = []): T[] => {
    if (!array || !Array.isArray(array)) {
      return fallback;
    }
    return array;
  },

  /**
   * Check if array is valid and has items
   */
  hasItems: (array: any[] | undefined | null): boolean => {
    return Array.isArray(array) && array.length > 0;
  },

  /**
   * Safely forEach over an array
   */
  forEach: <T>(array: T[] | undefined | null, callback: (item: T, index: number, arr: T[]) => void): void => {
    if (!array || !Array.isArray(array)) {
      return;
    }
    array.forEach(callback);
  }
};

export default safeNumber;