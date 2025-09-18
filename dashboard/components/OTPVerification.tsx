'use client';

import { useState, useEffect } from 'react';
import { authApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import OTPInput from './OTPInput';

interface OTPVerificationProps {
  userId: string;
  email: string;
  purpose?: 'registration' | 'login' | '2fa' | 'password-reset';
  onSuccess: (data?: any) => void;
  onBack?: () => void;
}

export default function OTPVerification({
  userId,
  email,
  purpose = 'registration',
  onSuccess,
  onBack
}: OTPVerificationProps) {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  // Masked email for display
  const maskEmail = (email: string): string => {
    const [username, domain] = email.split('@');
    const maskedUsername = username.length > 2
      ? username[0] + '*'.repeat(username.length - 2) + username[username.length - 1]
      : username;
    return `${maskedUsername}@${domain}`;
  };

  // Countdown timer for resend
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => {
        setResendCooldown(resendCooldown - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Get OTP status on mount
  useEffect(() => {
    const getOTPStatus = async () => {
      try {
        const response = await authApi.getOTPStatus(userId);
        if (response.success && response.data) {
          setAttemptsRemaining(response.data.attemptsRemaining || 3);

          if (!response.data.canResend && response.data.nextResendTime) {
            const nextResendTime = new Date(response.data.nextResendTime).getTime();
            const now = Date.now();
            const cooldown = Math.max(0, Math.ceil((nextResendTime - now) / 1000));
            setResendCooldown(cooldown);
          }
        }
      } catch (error) {
        console.error('Failed to get OTP status:', error);
      }
    };

    getOTPStatus();
  }, [userId]);

  const handleOTPComplete = async (otp: string) => {
    setLoading(true);
    setError('');

    try {
      const response = await authApi.verifyOTP(userId, otp, purpose);

      if (response.success) {
        toast.success(response.message || 'Email verified successfully!');
        onSuccess(response.data);
      } else {
        setError(response.error || 'Invalid OTP code');
        if (response.data?.attemptsRemaining !== undefined) {
          setAttemptsRemaining(response.data.attemptsRemaining);
        }

        if (response.data?.canResend) {
          setResendCooldown(0);
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Verification failed';
      setError(errorMessage);

      if (error.response?.data?.data?.attemptsRemaining !== undefined) {
        setAttemptsRemaining(error.response.data.data.attemptsRemaining);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setResendLoading(true);
    setError('');

    try {
      const response = await authApi.resendOTP(userId, purpose);

      if (response.success) {
        toast.success('Verification code sent!');
        setResendCooldown(120); // 2 minutes cooldown
        setAttemptsRemaining(3); // Reset attempts on new OTP

        if (response.data?.nextResendTime) {
          const nextResendTime = new Date(response.data.nextResendTime).getTime();
          const now = Date.now();
          const cooldown = Math.max(0, Math.ceil((nextResendTime - now) / 1000));
          setResendCooldown(cooldown);
        }
      } else {
        toast.error(response.error || 'Failed to resend code');

        if (response.data?.nextResendTime) {
          const nextResendTime = new Date(response.data.nextResendTime).getTime();
          const now = Date.now();
          const cooldown = Math.max(0, Math.ceil((nextResendTime - now) / 1000));
          setResendCooldown(cooldown);
        }
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || 'Failed to resend verification code';
      toast.error(errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
      <div className="text-center">
        <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-primary-100 mb-4">
          <svg className="h-8 w-8 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 7.89a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-gray-900">
          Verify Your Email
        </h2>

        <p className="mt-2 text-gray-600">
          We've sent a 6-digit verification code to
        </p>

        <p className="font-medium text-gray-800">
          {maskEmail(email)}
        </p>
      </div>

      <div className="space-y-6">
        <OTPInput
          length={6}
          onComplete={handleOTPComplete}
          loading={loading}
          error={error}
          autoFocus={true}
        />

        <div className="text-center space-y-4">
          {attemptsRemaining > 0 && (
            <p className="text-sm text-gray-600">
              {attemptsRemaining} {attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining
            </p>
          )}

          {/* Resend button */}
          <div className="flex flex-col items-center space-y-2">
            <p className="text-sm text-gray-600">
              Didn't receive the code?
            </p>

            {resendCooldown > 0 ? (
              <p className="text-sm text-gray-500">
                Resend in {formatTime(resendCooldown)}
              </p>
            ) : (
              <button
                onClick={handleResendOTP}
                disabled={resendLoading}
                className="text-primary-600 hover:text-primary-500 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendLoading ? (
                  <span className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                    <span>Sending...</span>
                  </span>
                ) : (
                  'Resend Code'
                )}
              </button>
            )}
          </div>
        </div>

        {/* Security notice */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-medium">Security Notice</p>
              <ul className="mt-1 list-disc list-inside space-y-1 text-blue-700">
                <li>This code expires in 10 minutes</li>
                <li>Never share this code with anyone</li>
                <li>Close this page if you didn't request verification</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Back button */}
        {onBack && (
          <button
            onClick={onBack}
            className="w-full flex justify-center items-center space-x-2 py-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span>Back to login</span>
          </button>
        )}
      </div>
    </div>
  );
}