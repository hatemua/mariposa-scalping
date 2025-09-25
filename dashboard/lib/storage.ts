// Safe localStorage utilities for Next.js SSR compatibility

export const storage = {
  // Safe get with fallback for SSR
  getItem: (key: string, fallback: string | null = null): string | null => {
    if (typeof window === 'undefined') {
      return fallback;
    }

    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn(`Failed to get localStorage item "${key}":`, error);
      return fallback;
    }
  },

  // Safe set with error handling
  setItem: (key: string, value: string): boolean => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn(`Failed to set localStorage item "${key}":`, error);
      return false;
    }
  },

  // Safe remove with error handling
  removeItem: (key: string): boolean => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.warn(`Failed to remove localStorage item "${key}":`, error);
      return false;
    }
  },

  // Check if localStorage is available
  isAvailable: (): boolean => {
    if (typeof window === 'undefined') {
      return false;
    }

    try {
      const test = '__storage_test__';
      localStorage.setItem(test, 'test');
      localStorage.removeItem(test);
      return true;
    } catch (error) {
      return false;
    }
  },

  // Get parsed JSON with fallback
  getJSON: <T = any>(key: string, fallback: T | null = null): T | null => {
    const value = storage.getItem(key);
    if (value === null) {
      return fallback;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      console.warn(`Failed to parse localStorage JSON for "${key}":`, error);
      return fallback;
    }
  },

  // Set JSON with error handling
  setJSON: <T = any>(key: string, value: T): boolean => {
    try {
      const jsonString = JSON.stringify(value);
      return storage.setItem(key, jsonString);
    } catch (error) {
      console.warn(`Failed to stringify JSON for localStorage "${key}":`, error);
      return false;
    }
  }
};

export default storage;