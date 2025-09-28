'use client';

import { HTMLAttributes } from 'react';

interface LoadingSpinnerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'primary' | 'secondary' | 'white' | 'gray';
  text?: string;
  center?: boolean;
}

export function LoadingSpinner({
  className = '',
  size = 'md',
  variant = 'primary',
  text,
  center = false,
  ...props
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
    xl: 'w-12 h-12'
  };

  const variantClasses = {
    primary: 'border-primary-600 border-t-transparent',
    secondary: 'border-purple-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: 'border-gray-400 dark:border-gray-600 border-t-transparent'
  };

  const textSizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  const spinnerClasses = [
    'border-2 rounded-full animate-spin',
    sizeClasses[size],
    variantClasses[variant]
  ].join(' ');

  const containerClasses = [
    'flex items-center gap-3',
    center && 'justify-center',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} {...props}>
      <div className={spinnerClasses} role="status" aria-label="Loading" />
      {text && (
        <span className={`text-gray-600 dark:text-gray-400 ${textSizeClasses[size]}`}>
          {text}
        </span>
      )}
      <span className="sr-only">Loading...</span>
    </div>
  );
}

interface LoadingSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
}

export function LoadingSkeleton({
  className = '',
  variant = 'text',
  width,
  height,
  lines = 1,
  ...props
}: LoadingSkeletonProps) {
  const baseClasses = 'bg-gray-200 dark:bg-gray-700 animate-pulse';

  const variantClasses = {
    text: 'rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg'
  };

  const skeletonClasses = [
    baseClasses,
    variantClasses[variant],
    className
  ].join(' ');

  const style = {
    width: width || (variant === 'text' ? '100%' : '40px'),
    height: height || (variant === 'text' ? '1rem' : '40px')
  };

  if (variant === 'text' && lines > 1) {
    return (
      <div className="space-y-2" {...props}>
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className={skeletonClasses}
            style={{
              ...style,
              width: index === lines - 1 ? '75%' : style.width
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={skeletonClasses}
      style={style}
      {...props}
    />
  );
}

export function LoadingPage({ text = 'Loading dashboard...' }: { text?: string }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-dark-50 dark:via-dark-100 dark:to-dark-200 flex items-center justify-center">
      <div className="glass-effect rounded-2xl p-8 text-center animate-fade-in max-w-md w-full mx-4">
        <LoadingSpinner size="xl" variant="primary" center className="mb-4" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {text}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Please wait while we prepare your trading environment
        </p>
      </div>
    </div>
  );
}