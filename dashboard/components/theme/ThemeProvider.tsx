'use client';

import { useEffect, useState } from 'react';
import { ThemeContext, type Theme, type ThemeContextType } from '@/hooks/useTheme';
import { useIsClient } from '@/hooks/useIsClient';

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'mariposa-theme'
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme);
  const [actualTheme, setActualTheme] = useState<'light' | 'dark'>('light');
  const isClient = useIsClient();

  useEffect(() => {
    if (!isClient) return;

    // Load theme from localStorage or use default
    const stored = localStorage.getItem(storageKey) as Theme;
    const validTheme = stored && ['light', 'dark', 'system'].includes(stored) ? stored : defaultTheme;
    setTheme(validTheme);
  }, [isClient, defaultTheme, storageKey]);

  useEffect(() => {
    if (!isClient) return;

    const updateActualTheme = () => {
      let resolvedTheme: 'light' | 'dark';

      if (theme === 'system') {
        resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      } else {
        resolvedTheme = theme;
      }

      setActualTheme(resolvedTheme);

      // Update document class
      const root = document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(resolvedTheme);

      // Set data attribute for easier CSS targeting
      root.setAttribute('data-theme', resolvedTheme);
    };

    updateActualTheme();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        updateActualTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, isClient]);

  const handleSetTheme = (newTheme: Theme) => {
    setTheme(newTheme);
    if (isClient) {
      localStorage.setItem(storageKey, newTheme);
    }
  };

  const toggleTheme = () => {
    if (theme === 'system') {
      // If current system theme is dark, switch to light, otherwise dark
      const systemIsDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      handleSetTheme(systemIsDark ? 'light' : 'dark');
    } else {
      // Toggle between light and dark
      handleSetTheme(theme === 'light' ? 'dark' : 'light');
    }
  };

  const value: ThemeContextType = {
    theme,
    actualTheme,
    setTheme: handleSetTheme,
    toggleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}