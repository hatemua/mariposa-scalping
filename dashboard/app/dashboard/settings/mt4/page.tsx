'use client';

import { useState, useEffect } from 'react';
import { mt4Api } from '@/lib/api';
import { toast } from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Server,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  RefreshCw,
  ExternalLink,
  Info,
  Loader2
} from 'lucide-react';

interface MT4Credentials {
  serverUrl: string;
  accountNumber: string;
  password: string;
  brokerName: string;
}

interface ValidationResult {
  valid: boolean;
  balance?: number;
  leverage?: number;
  error?: string;
}

export default function MT4SettingsPage() {
  const [credentials, setCredentials] = useState<MT4Credentials>({
    serverUrl: process.env.NEXT_PUBLIC_MT4_BRIDGE_URL || 'http://localhost:8080',
    accountNumber: '',
    password: '',
    brokerName: ''
  });

  const [showSecrets, setShowSecrets] = useState({
    accountNumber: false,
    password: false
  });

  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [hasCredentials, setHasCredentials] = useState(false);

  useEffect(() => {
    // Check if user already has credentials configured
    checkExistingCredentials();
  }, []);

  const checkExistingCredentials = async () => {
    try {
      const response = await mt4Api.getStatus();
      setHasCredentials(response.success && response.data?.connected);
    } catch (error) {
      setHasCredentials(false);
    }
  };

  const handleCredentialChange = (field: keyof MT4Credentials, value: string) => {
    setCredentials(prev => ({
      ...prev,
      [field]: value
    }));

    // Clear validation when credentials change
    if (validationResult) {
      setValidationResult(null);
    }
  };

  const toggleSecretVisibility = (field: keyof typeof showSecrets) => {
    setShowSecrets(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const validateCredentials = async () => {
    if (!credentials.serverUrl || !credentials.accountNumber || !credentials.password) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      const response = await mt4Api.testConnection({
        serverUrl: credentials.serverUrl,
        accountNumber: credentials.accountNumber,
        password: credentials.password,
        brokerName: credentials.brokerName || undefined
      });

      if (response.success && response.data?.valid) {
        setValidationResult({
          valid: true,
          balance: response.data.balance,
          leverage: response.data.leverage
        });
        toast.success('MT4 credentials validated successfully!');
      } else {
        throw new Error(response.error || response.data?.error || 'Validation failed');
      }
    } catch (error: any) {
      console.error('Credential validation error:', error);
      setValidationResult({
        valid: false,
        error: error.message || 'Invalid credentials or connection error'
      });
      toast.error('Credential validation failed');
    } finally {
      setIsValidating(false);
    }
  };

  const saveCredentials = async () => {
    if (!validationResult?.valid) {
      toast.error('Please validate credentials first');
      return;
    }

    setIsSaving(true);

    try {
      const response = await mt4Api.configureMT4({
        serverUrl: credentials.serverUrl,
        accountNumber: credentials.accountNumber,
        password: credentials.password,
        brokerName: credentials.brokerName || undefined
      });

      if (response.success) {
        toast.success('MT4 credentials saved successfully!');
        setHasCredentials(true);

        // Clear the form for security
        setCredentials({
          serverUrl: process.env.NEXT_PUBLIC_MT4_BRIDGE_URL || 'http://localhost:8080',
          accountNumber: '',
          password: '',
          brokerName: ''
        });
        setShowSecrets({
          accountNumber: false,
          password: false
        });
        setValidationResult(null);
      } else {
        throw new Error(response.error || 'Failed to save credentials');
      }
    } catch (error: any) {
      console.error('Save credentials error:', error);
      toast.error(error.message || 'Failed to save credentials');
    } finally {
      setIsSaving(false);
    }
  };

  const clearForm = () => {
    setCredentials({
      serverUrl: process.env.NEXT_PUBLIC_MT4_BRIDGE_URL || 'http://localhost:8080',
      accountNumber: '',
      password: '',
      brokerName: ''
    });
    setValidationResult(null);
    setShowSecrets({
      accountNumber: false,
      password: false
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Server className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">MT4 Configuration</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Connect your MT4 broker account to enable automated trading on MetaTrader 4.
          </p>
        </div>

        {/* Status Card */}
        {hasCredentials && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">MT4 Account Connected</h3>
            </div>
            <p className="text-green-700 mt-2">
              Your MT4 broker credentials are configured and working. You can now create MT4 trading agents.
            </p>
          </div>
        )}

        {/* Setup Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="h-6 w-6 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-3">How to Configure MT4</h3>
              <div className="space-y-2 text-blue-800">
                <p>1. Ensure your MT4 Bridge is running (default: http://localhost:8080)</p>
                <p>2. Enter your MT4 broker <strong>Server URL</strong> (or use the bridge URL)</p>
                <p>3. Provide your MT4 <strong>Account Number</strong> and <strong>Password</strong></p>
                <p>4. Optionally add your <strong>Broker Name</strong> for reference</p>
                <p>5. Click <strong>Validate Credentials</strong> to test the connection</p>
                <p>6. Once validated, click <strong>Save Credentials</strong> to enable trading</p>
              </div>
              <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                <p className="text-sm text-blue-900 font-medium">
                  💡 Tip: If you're using the local MT4 bridge, leave the Server URL as default.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Credentials Form */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-gray-900">MT4 Credentials</h2>
            <p className="text-gray-600 mt-1">
              Enter your MT4 broker credentials. All data is encrypted and stored securely.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* Server URL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Server URL <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={credentials.serverUrl}
                onChange={(e) => handleCredentialChange('serverUrl', e.target.value)}
                placeholder="http://localhost:8080"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                The URL of your MT4 bridge server (default: http://localhost:8080)
              </p>
            </div>

            {/* Account Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Account Number <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSecrets.accountNumber ? 'text' : 'password'}
                  value={credentials.accountNumber}
                  onChange={(e) => handleCredentialChange('accountNumber', e.target.value)}
                  placeholder="Enter your MT4 account number"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('accountNumber')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets.accountNumber ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showSecrets.password ? 'text' : 'password'}
                  value={credentials.password}
                  onChange={(e) => handleCredentialChange('password', e.target.value)}
                  placeholder="Enter your MT4 password"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('password')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets.password ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Broker Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Broker Name <span className="text-gray-400">(Optional)</span>
              </label>
              <input
                type="text"
                value={credentials.brokerName}
                onChange={(e) => handleCredentialChange('brokerName', e.target.value)}
                placeholder="e.g., IC Markets, FTMO, etc."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: Your broker's name for reference
              </p>
            </div>

            {/* Validation Result */}
            {validationResult && (
              <div className={`p-4 rounded-lg border ${
                validationResult.valid
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}>
                <div className="flex items-center gap-3 mb-2">
                  {validationResult.valid ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`font-medium ${
                    validationResult.valid ? 'text-green-900' : 'text-red-900'
                  }`}>
                    {validationResult.valid ? 'Credentials Valid' : 'Validation Failed'}
                  </span>
                </div>

                {validationResult.valid ? (
                  <div className="text-green-800 text-sm space-y-1">
                    <p>✓ Connection successful</p>
                    {validationResult.balance !== undefined && (
                      <p>✓ Account balance: ${validationResult.balance.toLocaleString()}</p>
                    )}
                    {validationResult.leverage && (
                      <p>✓ Leverage: 1:{validationResult.leverage}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-red-800 text-sm">
                    {validationResult.error}
                  </p>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-4 pt-4">
              <button
                onClick={validateCredentials}
                disabled={isValidating || !credentials.serverUrl || !credentials.accountNumber || !credentials.password}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isValidating ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Shield className="h-5 w-5" />
                )}
                {isValidating ? 'Validating...' : 'Validate Credentials'}
              </button>

              {validationResult?.valid && (
                <button
                  onClick={saveCredentials}
                  disabled={isSaving}
                  className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isSaving ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <CheckCircle className="h-5 w-5" />
                  )}
                  {isSaving ? 'Saving...' : 'Save Credentials'}
                </button>
              )}

              <button
                onClick={clearForm}
                className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear Form
              </button>
            </div>
          </div>
        </div>

        {/* Security Notice */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mt-8">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">Security Notice</h3>
              <div className="text-yellow-800 space-y-2">
                <p>• Your MT4 credentials are encrypted using AES-256 encryption before storage</p>
                <p>• Never share your MT4 account credentials with anyone</p>
                <p>• Use demo accounts for testing before deploying to live accounts</p>
                <p>• Monitor your MT4 terminal regularly for unauthorized activity</p>
                <p>• You can revoke access by changing your MT4 password at any time</p>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mt-8">
          <div className="flex items-start gap-3">
            <Info className="h-6 w-6 text-gray-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Troubleshooting</h3>
              <div className="text-gray-700 space-y-2 text-sm">
                <p><strong>Connection Failed?</strong> Ensure your MT4 bridge is running:</p>
                <code className="block bg-gray-100 p-2 rounded mt-1">curl http://localhost:8080/api/v1/ping</code>

                <p className="mt-3"><strong>Invalid Credentials?</strong> Double-check your account number and password in MT4 terminal</p>

                <p className="mt-3"><strong>Need Help?</strong> Check the bridge logs:</p>
                <code className="block bg-gray-100 p-2 rounded mt-1">docker logs mt4-bridge-server --tail 50</code>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
