/**
 * Safe string formatting utilities for server-side use
 */
export const safeString = {
  /**
   * Get a safe string value with fallback
   */
  getValue: (value: string | undefined | null, fallback: string = ''): string => {
    if (value === undefined || value === null) {
      return fallback;
    }
    return String(value);
  },

  /**
   * Check if a value is a valid non-empty string
   */
  isValid: (value: any): value is string => {
    return typeof value === 'string' && value.length > 0;
  },

  /**
   * Trim and get safe string value
   */
  trim: (value: string | undefined | null, fallback: string = ''): string => {
    if (value === undefined || value === null) {
      return fallback;
    }
    return String(value).trim();
  }
};

/**
 * Safe number formatting utilities for server-side use
 */
export const safeNumber = {
  /**
   * Get a safe numeric value with fallback
   */
  getValue: (value: string | number | undefined | null, fallback: number = 0): number => {
    if (value === undefined || value === null) {
      return fallback;
    }

    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num) || !isFinite(num)) {
      return fallback;
    }

    return num;
  },

  /**
   * Check if a value is a valid number
   */
  isValid: (value: any): value is number => {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  },

  /**
   * Get safe integer value
   */
  getInteger: (value: string | number | undefined | null, fallback: number = 0): number => {
    const num = safeNumber.getValue(value, fallback);
    return Math.floor(num);
  },

  /**
   * Ensure number is within range
   */
  clamp: (value: number, min: number, max: number): number => {
    return Math.max(min, Math.min(max, value));
  }
};

/**
 * Safe object utilities for server-side use
 */
export const safeObject = {
  /**
   * Safely get nested property with fallback
   */
  get: (obj: any, path: string, fallback: any = undefined) => {
    if (!obj || typeof obj !== 'object') return fallback;

    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
      if (result === null || result === undefined || typeof result !== 'object') {
        return fallback;
      }
      result = result[key];
    }

    return result !== undefined ? result : fallback;
  },

  /**
   * Check if nested property exists
   */
  has: (obj: any, path: string): boolean => {
    if (!obj || typeof obj !== 'object') return false;

    const keys = path.split('.');
    let result = obj;

    for (const key of keys) {
      if (result === null || result === undefined || typeof result !== 'object') {
        return false;
      }
      if (!(key in result)) {
        return false;
      }
      result = result[key];
    }

    return true;
  }
};