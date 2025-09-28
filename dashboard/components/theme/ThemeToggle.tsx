'use client';

import { useTheme } from '@/hooks/useTheme';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useState } from 'react';

interface ThemeToggleProps {
  variant?: 'button' | 'dropdown';
  className?: string;
  showLabel?: boolean;
}

export function ThemeToggle({
  variant = 'button',
  className = '',
  showLabel = false
}: ThemeToggleProps) {
  const { theme, actualTheme, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const themes = [
    { value: 'light' as const, label: 'Light', icon: Sun },
    { value: 'dark' as const, label: 'Dark', icon: Moon },
    { value: 'system' as const, label: 'System', icon: Monitor }
  ];

  const currentThemeData = themes.find(t => t.value === theme) || themes[0];
  const CurrentIcon = currentThemeData.icon;

  if (variant === 'dropdown') {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          aria-label="Theme selector"
        >
          <CurrentIcon className="h-4 w-4" />
          {showLabel && <span className="text-sm">{currentThemeData.label}</span>}
        </button>

        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <div className="absolute right-0 top-full mt-2 z-20 min-w-[140px] bg-white dark:bg-gray-800 rounded-lg shadow-medium border border-gray-200 dark:border-gray-700 py-1">
              {themes.map((themeOption) => {
                const Icon = themeOption.icon;
                const isSelected = theme === themeOption.value;

                return (
                  <button
                    key={themeOption.value}
                    onClick={() => {
                      setTheme(themeOption.value);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                      isSelected ? 'bg-gray-100 dark:bg-gray-700 text-primary-600 dark:text-primary-400' : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{themeOption.label}</span>
                    {isSelected && (
                      <div className="ml-auto w-2 h-2 bg-primary-600 dark:bg-primary-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  }

  // Simple toggle button
  return (
    <button
      onClick={toggleTheme}
      className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 hover:scale-105 ${className}`}
      aria-label={`Switch to ${actualTheme === 'dark' ? 'light' : 'dark'} mode`}
      title={`Currently ${actualTheme} mode. Click to toggle.`}
    >
      {actualTheme === 'dark' ? (
        <Sun className="h-5 w-5 text-yellow-500" />
      ) : (
        <Moon className="h-5 w-5 text-gray-600" />
      )}
    </button>
  );
}