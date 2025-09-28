'use client';

import { forwardRef, HTMLAttributes } from 'react';

interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  pulse?: boolean;
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(({
  children,
  className = '',
  variant = 'default',
  size = 'md',
  dot = false,
  pulse = false,
  ...props
}, ref) => {
  const baseClasses = [
    'inline-flex items-center gap-1 font-medium rounded-full transition-all duration-200',
    pulse && 'animate-bounce-gentle'
  ].filter(Boolean).join(' ');

  const variantClasses = {
    default: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 ring-1 ring-green-200 dark:ring-green-800',
    danger: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 ring-1 ring-red-200 dark:ring-red-800',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 ring-1 ring-yellow-200 dark:ring-yellow-800',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 ring-1 ring-blue-200 dark:ring-blue-800',
    secondary: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 ring-1 ring-purple-200 dark:ring-purple-800'
  };

  const sizeClasses = {
    sm: dot ? 'p-1' : 'px-2 py-1 text-xs',
    md: dot ? 'p-1.5' : 'px-3 py-1 text-sm',
    lg: dot ? 'p-2' : 'px-4 py-2 text-base'
  };

  const dotClasses = {
    default: 'bg-gray-500',
    success: 'bg-green-500',
    danger: 'bg-red-500',
    warning: 'bg-yellow-500',
    info: 'bg-blue-500',
    secondary: 'bg-purple-500'
  };

  const classes = [
    baseClasses,
    variantClasses[variant],
    sizeClasses[size],
    className
  ].join(' ');

  if (dot) {
    return (
      <div
        ref={ref}
        className={classes}
        {...props}
      >
        <div
          className={`rounded-full ${dotClasses[variant]} ${
            size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : 'w-2.5 h-2.5'
          } ${pulse ? 'animate-bounce-gentle' : ''}`}
        />
        {children}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={classes}
      {...props}
    >
      {children}
    </div>
  );
});

Badge.displayName = 'Badge';

export { Badge };
export type { BadgeProps };