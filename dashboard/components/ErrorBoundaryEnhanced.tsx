import React from 'react';
import { AlertTriangle, RefreshCw, Home, Bug } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{
    error?: Error;
    errorInfo?: React.ErrorInfo;
    onRetry: () => void;
  }>;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  level?: 'page' | 'component' | 'section';
}

class ErrorBoundaryEnhanced extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // Call the onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Log to external error tracking service if needed
    // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallback: Fallback, level = 'component' } = this.props;

      if (Fallback) {
        return (
          <Fallback
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            onRetry={this.handleRetry}
          />
        );
      }

      return <DefaultErrorFallback
        error={this.state.error}
        errorInfo={this.state.errorInfo}
        onRetry={this.handleRetry}
        level={level}
      />;
    }

    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error?: Error;
  errorInfo?: React.ErrorInfo;
  onRetry: () => void;
  level: 'page' | 'component' | 'section';
}

const DefaultErrorFallback: React.FC<DefaultErrorFallbackProps> = ({
  error,
  errorInfo,
  onRetry,
  level
}) => {
  const isDataError = error?.message?.includes('length') ||
                      error?.message?.includes('map') ||
                      error?.message?.includes('undefined') ||
                      error?.message?.includes('null');

  const getErrorTitle = () => {
    if (isDataError) return 'Data Loading Error';
    switch (level) {
      case 'page': return 'Page Error';
      case 'section': return 'Section Error';
      default: return 'Component Error';
    }
  };

  const getErrorDescription = () => {
    if (isDataError) {
      return 'The data is still loading or unavailable. This usually resolves automatically.';
    }
    return 'Something went wrong while rendering this component.';
  };

  const getSizeClasses = () => {
    switch (level) {
      case 'page': return 'min-h-screen p-8';
      case 'section': return 'min-h-[300px] p-6';
      default: return 'min-h-[200px] p-4';
    }
  };

  return (
    <div className={`flex items-center justify-center bg-gray-50 rounded-lg ${getSizeClasses()}`}>
      <div className="text-center max-w-md">
        <div className="mb-4">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {getErrorTitle()}
          </h3>
          <p className="text-gray-600 text-sm mb-4">
            {getErrorDescription()}
          </p>
        </div>

        {isDataError && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-left">
            <div className="flex items-start gap-2">
              <Bug className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-blue-800">
                <p className="font-medium mb-1">Common causes:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>API response is still loading</li>
                  <li>Network timeout or connection issues</li>
                  <li>Data format changed on the server</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            {isDataError ? 'Reload Data' : 'Try Again'}
          </button>

          {level === 'page' && (
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
            >
              <Home className="h-4 w-4" />
              Go Home
            </button>
          )}
        </div>

        {process.env.NODE_ENV === 'development' && error && (
          <details className="mt-4 text-left">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer">
              Error Details (Development)
            </summary>
            <div className="mt-2 p-3 bg-gray-100 rounded text-xs font-mono text-gray-800 overflow-auto max-h-32">
              <div className="mb-2">
                <strong>Error:</strong> {error.message}
              </div>
              {error.stack && (
                <div>
                  <strong>Stack:</strong>
                  <pre className="whitespace-pre-wrap">{error.stack}</pre>
                </div>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
};

// Specialized error boundaries for different contexts
export const ChartErrorBoundary: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <ErrorBoundaryEnhanced level="component">
    {children}
  </ErrorBoundaryEnhanced>
);

export const SectionErrorBoundary: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <ErrorBoundaryEnhanced level="section">
    {children}
  </ErrorBoundaryEnhanced>
);

export const PageErrorBoundary: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <ErrorBoundaryEnhanced level="page">
    {children}
  </ErrorBoundaryEnhanced>
);

export default ErrorBoundaryEnhanced;