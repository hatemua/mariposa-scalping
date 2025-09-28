import { useState, useEffect } from 'react';
import { authApi } from '@/lib/api';

interface OKXCredentialStatus {
  hasCredentials: boolean;
  isValidated: boolean;
  isLoading: boolean;
  error: string | null;
  balance?: number;
}

export const useOKXCredentials = () => {
  const [status, setStatus] = useState<OKXCredentialStatus>({
    hasCredentials: false,
    isValidated: false,
    isLoading: true,
    error: null
  });

  const checkCredentials = async () => {
    setStatus(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // We can't directly check if credentials exist without trying to use them
      // So we'll make a test API call to see if credentials are configured and valid
      const response = await fetch('/api/auth/test-okx-credentials', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStatus({
          hasCredentials: true,
          isValidated: data.valid || false,
          isLoading: false,
          error: null,
          balance: data.balance
        });
      } else if (response.status === 401) {
        // No credentials configured
        setStatus({
          hasCredentials: false,
          isValidated: false,
          isLoading: false,
          error: null
        });
      } else {
        throw new Error('Failed to check OKX credentials');
      }
    } catch (error: any) {
      console.error('Error checking OKX credentials:', error);
      setStatus({
        hasCredentials: false,
        isValidated: false,
        isLoading: false,
        error: error.message || 'Failed to check credentials'
      });
    }
  };

  useEffect(() => {
    checkCredentials();
  }, []);

  const refreshStatus = () => {
    checkCredentials();
  };

  return {
    ...status,
    refreshStatus
  };
};