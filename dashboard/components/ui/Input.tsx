'use client';

import { forwardRef, InputHTMLAttributes, useState } from 'react';
import { Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  success?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  showPasswordToggle?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(({
  className = '',
  type = 'text',
  label,
  error,
  success,
  helperText,
  leftIcon,
  rightIcon,
  showPasswordToggle = false,
  disabled = false,
  ...props
}, ref) => {
  const [showPassword, setShowPassword] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const inputType = showPasswordToggle && type === 'password'
    ? (showPassword ? 'text' : 'password')
    : type;

  const hasError = !!error;
  const hasSuccess = !!success && !error;

  const inputClasses = [
    'w-full px-4 py-3 rounded-xl transition-all duration-200',
    'bg-white dark:bg-dark-100 border text-gray-900 dark:text-gray-100',
    'placeholder:text-gray-500 dark:placeholder:text-gray-400',
    'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background',
    leftIcon && 'pl-11',
    (rightIcon || showPasswordToggle) && 'pr-11',
    hasError
      ? 'border-red-300 dark:border-red-700 focus:border-red-500 focus:ring-red-500'
      : hasSuccess
      ? 'border-green-300 dark:border-green-700 focus:border-green-500 focus:ring-green-500'
      : 'border-gray-300 dark:border-gray-700 focus:border-primary-500 focus:ring-primary-500',
    disabled && 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-gray-800',
    isFocused && 'scale-[1.02]',
    className
  ].filter(Boolean).join(' ');

  const labelClasses = [
    'block text-sm font-medium mb-2 transition-colors duration-200',
    hasError
      ? 'text-red-700 dark:text-red-400'
      : hasSuccess
      ? 'text-green-700 dark:text-green-400'
      : 'text-gray-700 dark:text-gray-300'
  ].join(' ');

  return (
    <div className="space-y-1">
      {label && (
        <label className={labelClasses}>
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500">
            {leftIcon}
          </div>
        )}

        <input
          ref={ref}
          type={inputType}
          className={inputClasses}
          disabled={disabled}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          {...props}
        />

        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
          {hasError && (
            <AlertCircle className="h-4 w-4 text-red-500" />
          )}
          {hasSuccess && (
            <CheckCircle className="h-4 w-4 text-green-500" />
          )}
          {showPasswordToggle && type === 'password' && (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
          {rightIcon && !showPasswordToggle && !hasError && !hasSuccess && (
            <div className="text-gray-400 dark:text-gray-500">
              {rightIcon}
            </div>
          )}
        </div>
      </div>

      {(error || success || helperText) && (
        <div className="text-sm">
          {error && (
            <p className="text-red-600 dark:text-red-400 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {error}
            </p>
          )}
          {success && !error && (
            <p className="text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              {success}
            </p>
          )}
          {helperText && !error && !success && (
            <p className="text-gray-500 dark:text-gray-400">
              {helperText}
            </p>
          )}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';

export { Input };
export type { InputProps };