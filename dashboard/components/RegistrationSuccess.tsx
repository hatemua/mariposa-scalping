'use client';

import { useEffect } from 'react';

interface RegistrationSuccessProps {
  email: string;
  onContinue: () => void;
  autoRedirect?: boolean;
  redirectDelay?: number;
}

export default function RegistrationSuccess({
  email,
  onContinue,
  autoRedirect = true,
  redirectDelay = 3000
}: RegistrationSuccessProps) {

  useEffect(() => {
    if (autoRedirect) {
      const timer = setTimeout(() => {
        onContinue();
      }, redirectDelay);

      return () => clearTimeout(timer);
    }
  }, [autoRedirect, redirectDelay, onContinue]);

  return (
    <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
      <div className="text-center">
        {/* Success Icon */}
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-6">
          <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Success Message */}
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          🎉 Welcome to Mariposa!
        </h2>

        <p className="text-gray-600 mb-2">
          Your email has been successfully verified.
        </p>

        <p className="font-medium text-gray-800 mb-6">
          {email}
        </p>

        {/* Welcome Features */}
        <div className="space-y-4 mb-8">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="text-sm font-medium text-blue-900">Account Activated</h3>
                <p className="text-sm text-blue-700">Your account is now ready to use</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="text-sm font-medium text-purple-900">AI-Powered Trading</h3>
                <p className="text-sm text-purple-700">4 AI models analyzing markets 24/7</p>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="text-left">
                <h3 className="text-sm font-medium text-green-900">Real-time Analytics</h3>
                <p className="text-sm text-green-700">Live performance tracking & insights</p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onContinue}
          className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-gradient-to-r from-primary-600 to-blue-600 hover:from-primary-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200"
        >
          <span className="flex items-center space-x-2">
            <span>Access Dashboard</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </span>
        </button>

        {autoRedirect && (
          <p className="text-xs text-gray-500 mt-4">
            Redirecting automatically in {Math.ceil(redirectDelay / 1000)} seconds...
          </p>
        )}
      </div>
    </div>
  );
}