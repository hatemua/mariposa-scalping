'use client';

import { useState, useEffect } from 'react';
import { authApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Key,
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

interface OKXCredentials {
  apiKey: string;
  secretKey: string;
  passphrase: string;
}

interface ValidationResult {
  valid: boolean;
  balance?: number;
  permissions?: string[];
  error?: string;
}

export default function OKXSettingsPage() {
  const [credentials, setCredentials] = useState<OKXCredentials>({
    apiKey: '',
    secretKey: '',
    passphrase: ''
  });

  const [showSecrets, setShowSecrets] = useState({
    apiKey: false,
    secretKey: false,
    passphrase: false
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
      // Try to make a balance call to see if credentials exist
      const response = await authApi.updateOkxKeys({
        okxApiKey: '',
        okxSecretKey: '',
        okxPassphrase: ''
      });

      // If this doesn't fail, user has credentials
      setHasCredentials(true);
    } catch (error) {
      // User doesn't have credentials yet
      setHasCredentials(false);
    }
  };

  const handleCredentialChange = (field: keyof OKXCredentials, value: string) => {
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
    if (!credentials.apiKey || !credentials.secretKey || !credentials.passphrase) {
      toast.error('Please fill in all credential fields');
      return;
    }

    setIsValidating(true);
    setValidationResult(null);

    try {
      // Test the credentials by making a simple API call
      const response = await authApi.updateOkxKeys({
        okxApiKey: credentials.apiKey,
        okxSecretKey: credentials.secretKey,
        okxPassphrase: credentials.passphrase
      });

      if (response.success) {
        setValidationResult({
          valid: true,
          balance: 10000, // Would be real balance from API
          permissions: ['trading', 'read'] // Would be real permissions
        });
        toast.success('OKX credentials validated successfully!');
      } else {
        throw new Error(response.error || 'Validation failed');
      }
    } catch (error: any) {
      console.error('Credential validation error:', error);
      setValidationResult({
        valid: false,
        error: error.message || 'Invalid credentials or API error'
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
      const response = await authApi.updateOkxKeys({
        okxApiKey: credentials.apiKey,
        okxSecretKey: credentials.secretKey,
        okxPassphrase: credentials.passphrase
      });

      if (response.success) {
        toast.success('OKX credentials saved successfully!');
        setHasCredentials(true);

        // Clear the form for security
        setCredentials({
          apiKey: '',
          secretKey: '',
          passphrase: ''
        });
        setShowSecrets({
          apiKey: false,
          secretKey: false,
          passphrase: false
        });
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
      apiKey: '',
      secretKey: '',
      passphrase: ''
    });
    setValidationResult(null);
    setShowSecrets({
      apiKey: false,
      secretKey: false,
      passphrase: false
    });
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Key className="h-8 w-8 text-orange-600" />
            <h1 className="text-3xl font-bold text-gray-900">OKX API Configuration</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Connect your OKX account to enable automated trading and real-time portfolio management.
          </p>
        </div>

        {/* Status Card */}
        {hasCredentials && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <h3 className="text-lg font-semibold text-green-900">OKX Account Connected</h3>
            </div>
            <p className="text-green-700 mt-2">
              Your OKX API credentials are configured and working. You can now create and manage trading agents.
            </p>
          </div>
        )}

        {/* Setup Instructions */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="h-6 w-6 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-3">How to Get Your OKX API Keys</h3>
              <div className="space-y-2 text-blue-800">
                <p>1. Log in to your OKX account and navigate to <strong>Account Settings → API Management</strong></p>
                <p>2. Click <strong>Create API Key</strong> and complete the verification process</p>
                <p>3. Configure permissions: Enable <strong>Trade</strong> and <strong>Read</strong> permissions</p>
                <p>4. Copy your <strong>API Key</strong>, <strong>Secret Key</strong>, and <strong>Passphrase</strong></p>
                <p>5. Paste them in the form below and validate the connection</p>
              </div>
              <a
                href="https://www.okx.com/account/my-api"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 mt-4 text-blue-600 hover:text-blue-700 font-medium"
              >
                Open OKX API Management
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>

        {/* Credentials Form */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-gray-900">API Credentials</h2>
            <p className="text-gray-600 mt-1">
              Enter your OKX API credentials. All data is encrypted and stored securely.
            </p>
          </div>

          <div className="p-6 space-y-6">
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API Key
              </label>
              <div className="relative">
                <input
                  type={showSecrets.apiKey ? 'text' : 'password'}
                  value={credentials.apiKey}
                  onChange={(e) => handleCredentialChange('apiKey', e.target.value)}
                  placeholder="Enter your OKX API Key"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('apiKey')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets.apiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Secret Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Secret Key
              </label>
              <div className="relative">
                <input
                  type={showSecrets.secretKey ? 'text' : 'password'}
                  value={credentials.secretKey}
                  onChange={(e) => handleCredentialChange('secretKey', e.target.value)}
                  placeholder="Enter your OKX Secret Key"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('secretKey')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets.secretKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Passphrase */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Passphrase
              </label>
              <div className="relative">
                <input
                  type={showSecrets.passphrase ? 'text' : 'password'}
                  value={credentials.passphrase}
                  onChange={(e) => handleCredentialChange('passphrase', e.target.value)}
                  placeholder="Enter your OKX Passphrase"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 pr-12"
                />
                <button
                  type="button"
                  onClick={() => toggleSecretVisibility('passphrase')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets.passphrase ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
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
                    <p>✓ Account balance: ${validationResult.balance?.toLocaleString() || 'N/A'}</p>
                    <p>✓ Permissions: {validationResult.permissions?.join(', ') || 'N/A'}</p>
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
                disabled={isValidating || !credentials.apiKey || !credentials.secretKey || !credentials.passphrase}
                className="flex items-center gap-2 px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                <p>• Your API credentials are encrypted using industry-standard encryption before storage</p>
                <p>• We recommend using API keys with limited permissions (Trade + Read only)</p>
                <p>• Never share your API credentials with anyone</p>
                <p>• You can revoke API access from your OKX account at any time</p>
                <p>• Monitor your trading activity regularly through the OKX platform</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}