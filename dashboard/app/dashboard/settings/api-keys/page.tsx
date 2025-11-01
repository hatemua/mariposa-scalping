'use client';

import { useState, useEffect } from 'react';
import { apiKeysApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Key,
  Copy,
  Trash2,
  RefreshCw,
  Plus,
  Check,
  AlertTriangle,
  Eye,
  EyeOff,
  BarChart3
} from 'lucide-react';

interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  tier: string;
  isActive: boolean;
  requestsUsedToday: number;
  requestsPerDay: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    tier: 'free',
    expiresInDays: '',
    allowedIPs: ''
  });

  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const response = await apiKeysApi.listApiKeys();
      if (response.success) {
        setApiKeys(response.data || []);
      }
    } catch (error: any) {
      toast.error('Failed to load API keys');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Please enter a name for your API key');
      return;
    }

    try {
      const payload: any = {
        name: formData.name,
        tier: formData.tier as any
      };

      if (formData.expiresInDays) {
        payload.expiresInDays = parseInt(formData.expiresInDays);
      }

      if (formData.allowedIPs.trim()) {
        payload.allowedIPs = formData.allowedIPs
          .split(',')
          .map(ip => ip.trim())
          .filter(ip => ip);
      }

      const response = await apiKeysApi.generateApiKey(payload);

      if (response.success && response.data?.apiKey) {
        setNewlyGeneratedKey(response.data.apiKey);
        toast.success('API key generated successfully!');
        setShowGenerateForm(false);
        setFormData({ name: '', tier: 'free', expiresInDays: '', allowedIPs: '' });
        await loadApiKeys();
      } else {
        toast.error(response.error || 'Failed to generate API key');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to generate API key');
      console.error(error);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard!`);
  };

  const handleRevoke = async (keyId: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke "${name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const response = await apiKeysApi.revokeApiKey(keyId);
      if (response.success) {
        toast.success('API key revoked successfully');
        await loadApiKeys();
      } else {
        toast.error(response.error || 'Failed to revoke API key');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to revoke API key');
      console.error(error);
    }
  };

  const handleRotate = async (keyId: string, name: string) => {
    if (!confirm(`Rotate API key "${name}"? The old key will be revoked immediately.`)) {
      return;
    }

    try {
      const response = await apiKeysApi.rotateApiKey(keyId);
      if (response.success && response.data?.apiKey) {
        setNewlyGeneratedKey(response.data.apiKey);
        toast.success('API key rotated successfully!');
        await loadApiKeys();
      } else {
        toast.error(response.error || 'Failed to rotate API key');
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to rotate API key');
      console.error(error);
    }
  };

  const getTierBadgeColor = (tier: string) => {
    const colors: Record<string, string> = {
      free: 'bg-gray-100 text-gray-800',
      starter: 'bg-blue-100 text-blue-800',
      pro: 'bg-purple-100 text-purple-800',
      enterprise: 'bg-orange-100 text-orange-800'
    };
    return colors[tier] || colors.free;
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Key className="h-8 w-8 text-primary-600" />
              API Keys
            </h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              Manage your API keys for external integrations and automation
            </p>
          </div>
          <button
            onClick={() => setShowGenerateForm(!showGenerateForm)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Generate New Key
          </button>
        </div>

        {/* Newly Generated Key Alert */}
        {newlyGeneratedKey && (
          <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
            <div className="flex items-start">
              <AlertTriangle className="h-6 w-6 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="ml-3 flex-1">
                <h3 className="text-sm font-medium text-yellow-800">
                  Store this API key securely!
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <p className="mb-2">This key will only be shown once. Make sure to copy it now:</p>
                  <div className="flex items-center gap-2 bg-white p-3 rounded border border-yellow-200 font-mono text-xs break-all">
                    <code className="flex-1">{newlyGeneratedKey}</code>
                    <button
                      onClick={() => handleCopy(newlyGeneratedKey, 'API key')}
                      className="flex-shrink-0 p-2 hover:bg-yellow-50 rounded transition-colors"
                    >
                      <Copy className="h-4 w-4 text-yellow-600" />
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => setNewlyGeneratedKey(null)}
                  className="mt-3 text-sm font-medium text-yellow-800 hover:text-yellow-900"
                >
                  I've stored it safely, dismiss this message
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Generate Form */}
        {showGenerateForm && (
          <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Generate New API Key
            </h2>
            <form onSubmit={handleGenerate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Production Server"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Tier *
                </label>
                <select
                  value={formData.tier}
                  onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="free">Free (100 req/day)</option>
                  <option value="starter">Starter (1,000 req/day)</option>
                  <option value="pro">Pro (10,000 req/day)</option>
                  <option value="enterprise">Enterprise (Unlimited)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Expires in (days) - Optional
                  </label>
                  <input
                    type="number"
                    value={formData.expiresInDays}
                    onChange={(e) => setFormData({ ...formData, expiresInDays: e.target.value })}
                    placeholder="Never expires"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Allowed IPs (comma-separated) - Optional
                  </label>
                  <input
                    type="text"
                    value={formData.allowedIPs}
                    onChange={(e) => setFormData({ ...formData, allowedIPs: e.target.value })}
                    placeholder="192.168.1.1, 10.0.0.1"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
                >
                  Generate API Key
                </button>
                <button
                  type="button"
                  onClick={() => setShowGenerateForm(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* API Keys List */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading API keys...</p>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="p-8 text-center">
              <Key className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No API keys yet
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Generate your first API key to start using the API
              </p>
              <button
                onClick={() => setShowGenerateForm(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                Generate API Key
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-900">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Key
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Tier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Usage Today
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-gray-50 dark:hover:bg-gray-750">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {key.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Created {new Date(key.createdAt).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono text-gray-700 dark:text-gray-300">
                            {key.keyPrefix}...
                          </code>
                          <button
                            onClick={() => handleCopy(key.keyPrefix, 'Key prefix')}
                            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                          >
                            <Copy className="h-4 w-4 text-gray-400" />
                          </button>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTierBadgeColor(key.tier)}`}>
                          {key.tier}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">
                          {key.requestsUsedToday.toLocaleString()} / {key.requestsPerDay > 0 ? key.requestsPerDay.toLocaleString() : '∞'}
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1">
                          <div
                            className="bg-primary-600 h-1.5 rounded-full"
                            style={{
                              width: key.requestsPerDay > 0
                                ? `${Math.min(100, (key.requestsUsedToday / key.requestsPerDay) * 100)}%`
                                : '0%'
                            }}
                          ></div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {key.isActive ? (
                          <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                            <Check className="h-4 w-4" />
                            Active
                          </span>
                        ) : (
                          <span className="text-sm text-gray-400">Revoked</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRotate(key.id, key.name)}
                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                            title="Rotate key"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleRevoke(key.id, key.name)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Revoke key"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Documentation Link */}
        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
            📚 API Documentation
          </h3>
          <p className="text-sm text-blue-700 dark:text-blue-300 mb-3">
            Learn how to use your API keys with our comprehensive API documentation.
          </p>
          <div className="flex gap-3">
            <a
              href="/dashboard/api-tester"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              <BarChart3 className="h-4 w-4" />
              Try API Tester
            </a>
            <a
              href="https://docs.mariposa.com/api"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 text-blue-600 border border-blue-600 rounded-lg hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors text-sm"
            >
              View Full Docs
            </a>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
