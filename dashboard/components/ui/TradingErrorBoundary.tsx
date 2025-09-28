// Enhanced Error Boundary for Trading Intelligence Components
// Provides graceful error handling with fallback UI and recovery options

'use client';

import React, { Component, ReactNode } from 'react';
import {
  AlertTriangle,
  RefreshCw,
  Settings,
  TrendingDown,
  Wifi,
  Clock,
  AlertCircle,
} from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: any;
  retryCount: number;
  isRetrying: boolean;
}

interface TradingErrorBoundaryProps {
  children: ReactNode;
  fallbackComponent?: string;
  onError?: (error: Error, errorInfo: any) => void;
  maxRetries?: number;
  showDetails?: boolean;
  componentName?: string;
}

// Types of errors we can handle
enum ErrorType {
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  API = 'api',
  RENDER = 'render',
  PARSE = 'parse',
  UNKNOWN = 'unknown',
}

// Error classification function
function classifyError(error: Error): ErrorType {
  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';

  if (message.includes('timeout') || message.includes('30000ms') || message.includes('45000ms') || message.includes('120000ms') || message.includes('180000ms') || message.includes('300000ms') || message.includes('360000ms')) {
    return ErrorType.TIMEOUT;
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return ErrorType.NETWORK;
  }
  if (message.includes('api') || message.includes('response') || stack.includes('api')) {
    return ErrorType.API;
  }
  if (message.includes('parse') || message.includes('json') || message.includes('syntax')) {
    return ErrorType.PARSE;
  }
  if (stack.includes('render') || stack.includes('component')) {
    return ErrorType.RENDER;
  }
  return ErrorType.UNKNOWN;
}

// Get appropriate icon for error type
function getErrorIcon(errorType: ErrorType): React.ComponentType<any> {
  switch (errorType) {
    case ErrorType.NETWORK:
      return Wifi;
    case ErrorType.TIMEOUT:
      return Clock;
    case ErrorType.API:
      return TrendingDown;
    case ErrorType.PARSE:
      return AlertCircle;
    default:
      return AlertTriangle;
  }
}

// Get user-friendly error message
function getErrorMessage(errorType: ErrorType, componentName?: string): string {
  const component = componentName || 'Trading component';

  switch (errorType) {
    case ErrorType.NETWORK:
      return `${component} can't connect to trading servers. Check your internet connection.`;
    case ErrorType.TIMEOUT:
      return `${component} request timed out. Trading servers may be busy.`;
    case ErrorType.API:
      return `${component} encountered a server error. Using fallback data where available.`;
    case ErrorType.PARSE:
      return `${component} received invalid data format. This may be temporary.`;
    case ErrorType.RENDER:
      return `${component} display error. Some features may be unavailable.`;
    default:
      return `${component} encountered an unexpected error.`;
  }
}

// Get recovery suggestions
function getRecoverySuggestions(errorType: ErrorType): string[] {
  switch (errorType) {
    case ErrorType.NETWORK:
      return [
        'Check your internet connection',
        'Try refreshing the page',
        'Check if trading APIs are accessible',
      ];
    case ErrorType.TIMEOUT:
      return [
        'Wait a moment and try again',
        'Check server status',
        'Reduce the number of symbols being analyzed',
      ];
    case ErrorType.API:
      return [
        'Refresh to get latest data',
        'Check API rate limits',
        'Try again in a few minutes',
      ];
    case ErrorType.PARSE:
      return [
        'Refresh the component',
        'Clear browser cache',
        'Check for data format updates',
      ];
    default:
      return [
        'Refresh the page',
        'Try clearing browser cache',
        'Report the issue if it persists',
      ];
  }
}

class TradingErrorBoundary extends Component<TradingErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeoutId: NodeJS.Timeout | null = null;

  constructor(props: TradingErrorBoundaryProps) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      isRetrying: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Log error for debugging
    console.error('Trading component error:', error);
    console.error('Error info:', errorInfo);
  }

  componentWillUnmount() {
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  handleRetry = () => {
    const { maxRetries = 3 } = this.props;
    const { retryCount } = this.state;

    if (retryCount >= maxRetries) {
      return;
    }

    this.setState({
      isRetrying: true,
    });

    // Delayed retry to avoid immediate failure
    this.retryTimeoutId = setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: retryCount + 1,
        isRetrying: false,
      });
    }, 1000);
  };

  handleRefresh = () => {
    window.location.reload();
  };

  render() {
    const { children, fallbackComponent, maxRetries = 3, showDetails = false, componentName } = this.props;
    const { hasError, error, retryCount, isRetrying } = this.state;

    if (!hasError) {
      return children;
    }

    const errorType = error ? classifyError(error) : ErrorType.UNKNOWN;
    const ErrorIcon = getErrorIcon(errorType);
    const errorMessage = getErrorMessage(errorType, componentName);
    const suggestions = getRecoverySuggestions(errorType);
    const canRetry = retryCount < maxRetries;

    // Render specific fallback component if requested
    if (fallbackComponent === 'compact') {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <ErrorIcon className="h-4 w-4 text-red-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-red-800 truncate">{errorMessage}</p>
            </div>
            {canRetry && (
              <button
                onClick={this.handleRetry}
                disabled={isRetrying}
                className="p-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                title="Retry"
              >
                <RefreshCw className={`h-4 w-4 ${isRetrying ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>
      );
    }

    if (fallbackComponent === 'minimal') {
      return (
        <div className="flex items-center justify-center p-8 text-gray-500">
          <div className="text-center">
            <ErrorIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <p className="text-sm">Component unavailable</p>
            {canRetry && (
              <button
                onClick={this.handleRetry}
                disabled={isRetrying}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
              >
                {isRetrying ? 'Retrying...' : 'Try again'}
              </button>
            )}
          </div>
        </div>
      );
    }

    // Full error UI (default)
    return (
      <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
        <div className="text-center">
          {/* Error Icon */}
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
            <ErrorIcon className="h-6 w-6 text-red-600" />
          </div>

          {/* Error Message */}
          <h3 className="text-lg font-medium text-gray-900 mb-2">Component Error</h3>
          <p className="text-sm text-gray-600 mb-4">{errorMessage}</p>

          {/* Recovery Suggestions */}
          <div className="bg-gray-50 rounded-lg p-4 mb-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Try these solutions:</h4>
            <ul className="text-sm text-gray-600 space-y-1">
              {suggestions.map((suggestion, index) => (
                <li key={index} className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-gray-400 rounded-full flex-shrink-0" />
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-center gap-3">
            {canRetry && (
              <button
                onClick={this.handleRetry}
                disabled={isRetrying}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRetrying ? 'animate-spin' : ''}`} />
                {isRetrying ? 'Retrying...' : `Retry (${maxRetries - retryCount} left)`}
              </button>
            )}

            <button
              onClick={this.handleRefresh}
              className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Page
            </button>
          </div>

          {/* Retry Count Indicator */}
          {retryCount > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              Attempted {retryCount} time{retryCount > 1 ? 's' : ''}
            </p>
          )}

          {/* Error Details (Development) */}
          {showDetails && error && (
            <details className="mt-4 text-left">
              <summary className="text-sm text-gray-500 cursor-pointer hover:text-gray-700">
                Technical Details (for debugging)
              </summary>
              <div className="mt-2 p-3 bg-gray-100 rounded text-xs text-gray-600 font-mono">
                <div className="mb-2">
                  <strong>Error:</strong> {error.message}
                </div>
                <div className="mb-2">
                  <strong>Type:</strong> {errorType}
                </div>
                {error.stack && (
                  <div>
                    <strong>Stack:</strong>
                    <pre className="mt-1 whitespace-pre-wrap break-all">
                      {error.stack.slice(0, 500)}
                      {error.stack.length > 500 ? '...' : ''}
                    </pre>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    );
  }
}

// HOC for wrapping components with error boundary
export function withTradingErrorBoundary<T extends {}>(
  WrappedComponent: React.ComponentType<T>,
  errorBoundaryProps?: Omit<TradingErrorBoundaryProps, 'children'>
) {
  const WithErrorBoundary = (props: T) => (
    <TradingErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </TradingErrorBoundary>
  );

  WithErrorBoundary.displayName = `withTradingErrorBoundary(${WrappedComponent.displayName || WrappedComponent.name})`;

  return WithErrorBoundary;
}

// Hook for handling async errors in functional components
export function useAsyncErrorHandler() {
  const [error, setError] = React.useState<Error | null>(null);

  const resetError = React.useCallback(() => {
    setError(null);
  }, []);

  const handleError = React.useCallback((error: Error) => {
    console.error('Async error caught:', error);
    setError(error);
  }, []);

  // Re-throw error on next render to trigger error boundary
  React.useEffect(() => {
    if (error) {
      throw error;
    }
  }, [error]);

  return { handleError, resetError };
}

export default TradingErrorBoundary;