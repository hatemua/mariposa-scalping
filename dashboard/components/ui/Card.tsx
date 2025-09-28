'use client';

import { forwardRef, HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'glass' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  hover?: boolean;
  clickable?: boolean;
}

const Card = forwardRef<HTMLDivElement, CardProps>(({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
  hover = false,
  clickable = false,
  ...props
}, ref) => {
  const baseClasses = [
    'rounded-2xl transition-all duration-300',
    hover && 'hover:shadow-medium hover:scale-[1.02]',
    clickable && 'cursor-pointer hover:shadow-hard hover:scale-105 active:scale-95'
  ].filter(Boolean).join(' ');

  const variantClasses = {
    default: 'bg-white dark:bg-dark-100 shadow-soft border border-gray-200/50 dark:border-gray-700/50',
    elevated: 'bg-white dark:bg-dark-100 shadow-medium border border-gray-200/50 dark:border-gray-700/50',
    glass: 'glass-effect border border-white/20 dark:border-gray-700/30',
    outline: 'border-2 border-gray-200 dark:border-gray-700 bg-transparent'
  };

  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-6',
    lg: 'p-8',
    xl: 'p-10'
  };

  const classes = [
    baseClasses,
    variantClasses[variant],
    paddingClasses[padding],
    className
  ].join(' ');

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

Card.displayName = 'Card';

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({
  children,
  className = '',
  ...props
}, ref) => (
  <div
    ref={ref}
    className={`mb-4 ${className}`}
    {...props}
  >
    {children}
  </div>
));

CardHeader.displayName = 'CardHeader';

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({
  children,
  className = '',
  ...props
}, ref) => (
  <h3
    ref={ref}
    className={`text-lg font-semibold text-gray-900 dark:text-gray-100 ${className}`}
    {...props}
  >
    {children}
  </h3>
));

CardTitle.displayName = 'CardTitle';

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(({
  children,
  className = '',
  ...props
}, ref) => (
  <p
    ref={ref}
    className={`text-sm text-gray-600 dark:text-gray-400 ${className}`}
    {...props}
  >
    {children}
  </p>
));

CardDescription.displayName = 'CardDescription';

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({
  children,
  className = '',
  ...props
}, ref) => (
  <div
    ref={ref}
    className={`${className}`}
    {...props}
  >
    {children}
  </div>
));

CardContent.displayName = 'CardContent';

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({
  children,
  className = '',
  ...props
}, ref) => (
  <div
    ref={ref}
    className={`mt-4 pt-4 border-t border-gray-200/50 dark:border-gray-700/50 ${className}`}
    {...props}
  >
    {children}
  </div>
));

CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
export type { CardProps };