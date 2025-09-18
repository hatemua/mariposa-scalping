'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import OTPVerification from '@/components/OTPVerification';
import RegistrationSuccess from '@/components/RegistrationSuccess';

type AuthStep = 'form' | 'otp' | 'success';

export default function Login() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('form');
  const [userId, setUserId] = useState('');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLogin && formData.password !== formData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = isLogin
        ? await authApi.login(formData.email, formData.password)
        : await authApi.register(formData.email, formData.password);

      if (response.success) {
        if (isLogin) {
          // Login successful
          if (response.data?.token) {
            localStorage.setItem('token', response.data.token);
            toast.success('Logged in successfully');
            router.push('/dashboard');
          }
        } else {
          // Registration successful - needs email verification
          if (response.requiresEmailVerification && response.data?.userId) {
            setUserId(response.data.userId);
            setAuthStep('otp');
            toast.success('Account created! Please verify your email.');
          } else if (response.data?.token) {
            // Email already verified
            localStorage.setItem('token', response.data.token);
            toast.success('Account created successfully');
            router.push('/dashboard');
          }
        }
      } else {
        if (response.requiresEmailVerification && response.userId) {
          // Login failed due to unverified email
          setUserId(response.userId);
          setAuthStep('otp');
          toast.error(response.error || 'Please verify your email to login');
        } else {
          toast.error(response.error || 'Authentication failed');
        }
      }
    } catch (error: any) {
      const errorData = error.response?.data;
      if (errorData?.requiresEmailVerification && errorData?.userId) {
        setUserId(errorData.userId);
        setAuthStep('otp');
        toast.error(errorData.error || 'Please verify your email to continue');
      } else {
        toast.error(errorData?.error || 'Authentication failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOTPSuccess = (data?: any) => {
    if (data?.token) {
      localStorage.setItem('token', data.token);
      setAuthStep('success');
    } else {
      setAuthStep('success');
    }
  };

  const handleBackToForm = () => {
    setAuthStep('form');
    setUserId('');
  };

  const handleContinueToDashboard = () => {
    router.push('/dashboard');
  };

  // Render different steps based on auth flow
  if (authStep === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <OTPVerification
          userId={userId}
          email={formData.email}
          purpose="registration"
          onSuccess={handleOTPSuccess}
          onBack={handleBackToForm}
        />
      </div>
    );
  }

  if (authStep === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
        <RegistrationSuccess
          email={formData.email}
          onContinue={handleContinueToDashboard}
        />
      </div>
    );
  }

  // Default form step
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            🦋 Mariposa Bot
          </h1>
          <p className="mt-2 text-gray-600">
            {isLogin ? 'Sign in to your account' : 'Create your account'}
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter your email"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
              placeholder="Enter your password"
            />
          </div>

          {!isLogin && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                required
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500"
                placeholder="Confirm your password"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            ) : (
              isLogin ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <div className="text-center">
          <button
            onClick={() => setIsLogin(!isLogin)}
            disabled={loading}
            className="text-primary-600 hover:text-primary-500 disabled:opacity-50"
          >
            {isLogin ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
}