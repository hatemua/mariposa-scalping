'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { toast } from 'react-hot-toast';

export default function Login() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showOTPInput, setShowOTPInput] = useState(false);
  const [userId, setUserId] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    otpCode: '',
  });

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email) {
      toast.error('Email is required');
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.requestOTP(formData.email);

      if (response.success) {
        setUserId(response.data.userId);
        setShowOTPInput(true);
        toast.success(response.data.message || 'Verification code sent to your email!');
      } else {
        toast.error(response.error || 'Failed to send verification code');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.otpCode || formData.otpCode.length !== 6) {
      toast.error('Please enter a valid 6-digit code');
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.verifyOTP(userId, formData.otpCode);

      if (response.success && response.data?.token) {
        localStorage.setItem('token', response.data.token);
        toast.success('Successfully authenticated!');
        router.push('/dashboard');
      } else {
        toast.error(response.error || 'Invalid verification code');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!userId) return;

    setLoading(true);

    try {
      const response = await authApi.resendOTP(userId);

      if (response.success) {
        toast.success('Verification code resent!');
      } else {
        toast.error(response.error || 'Failed to resend code');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setShowOTPInput(false);
    setUserId('');
    setFormData({ email: formData.email, otpCode: '' });
  };

  const handleOTPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setFormData({ ...formData, otpCode: value });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            🦋 Mariposa Bot
          </h1>
          <p className="mt-2 text-gray-600">
            {showOTPInput ? 'Enter verification code' : 'Passwordless authentication'}
          </p>
        </div>

        {!showOTPInput ? (
          // Email Input Form
          <form className="space-y-6" onSubmit={handleEmailSubmit}>
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                Email Address
              </label>
              <input
                id="email"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Enter your email"
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                'Send Verification Code'
              )}
            </button>
          </form>
        ) : (
          // OTP Input Form
          <form className="space-y-6" onSubmit={handleOTPSubmit}>
            <div>
              <label htmlFor="otpCode" className="block text-sm font-medium text-gray-700">
                Verification Code
              </label>
              <input
                id="otpCode"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                maxLength={6}
                required
                value={formData.otpCode}
                onChange={handleOTPChange}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 text-center text-xl tracking-widest"
                placeholder="000000"
                disabled={loading}
                autoFocus
              />
              <p className="mt-1 text-sm text-gray-500">
                Enter the 6-digit code sent to {formData.email}
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                'Verify & Sign In'
              )}
            </button>

            <div className="flex justify-between text-sm">
              <button
                type="button"
                onClick={handleBackToEmail}
                disabled={loading}
                className="text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                ← Change email
              </button>
              <button
                type="button"
                onClick={handleResendOTP}
                disabled={loading}
                className="text-primary-600 hover:text-primary-500 disabled:opacity-50"
              >
                Resend code
              </button>
            </div>
          </form>
        )}

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-medium">Secure Login</p>
              <p className="text-blue-700">
                {showOTPInput
                  ? 'Code expires in 10 minutes. Never share this code with anyone.'
                  : 'No passwords needed. We\'ll send a verification code to your email.'
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}