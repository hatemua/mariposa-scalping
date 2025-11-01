'use client';

import { useState } from 'react';
import { publicApi } from '@/lib/api';
import { toast } from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Zap,
  Send,
  Copy,
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Code,
  FileJson,
  Terminal
} from 'lucide-react';

interface Endpoint {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  category: string;
  params?: { name: string; type: string; required?: boolean; options?: string[]; description?: string }[];
  tier: string;
}

const ENDPOINTS: Endpoint[] = [
  {
    name: 'List Opportunities',
    method: 'GET',
    path: '/opportunities',
    category: 'Opportunities',
    tier: 'Free+',
    params: [
      { name: 'limit', type: 'number', description: 'Max results (1-100)', required: false },
      { name: 'category', type: 'select', options: ['ALL', 'BREAKOUT', 'REVERSAL', 'MOMENTUM', 'WHALE_ACTIVITY'], required: false },
      { name: 'minConfidence', type: 'number', description: 'Min confidence (0-1)', required: false },
      { name: 'minScore', type: 'number', description: 'Min score (0-100)', required: false },
      { name: 'riskLevel', type: 'select', options: ['ALL', 'LOW', 'MEDIUM', 'HIGH'], required: false },
    ]
  },
  {
    name: 'Top Opportunities',
    method: 'GET',
    path: '/opportunities/top',
    category: 'Opportunities',
    tier: 'Free+',
    params: [
      { name: 'limit', type: 'number', description: 'Max results (1-50)', required: false },
      { name: 'sortBy', type: 'select', options: ['score', 'confidence', 'riskReward'], required: false },
    ]
  },
  {
    name: 'List Whale Activities',
    method: 'GET',
    path: '/whale-activities',
    category: 'Whale Activities',
    tier: 'Starter+',
    params: [
      { name: 'limit', type: 'number', description: 'Max results (1-100)', required: false },
      { name: 'type', type: 'select', options: ['ALL', 'BUY_WALL', 'SELL_WALL', 'ACCUMULATION', 'LARGE_TRADE'], required: false },
      { name: 'side', type: 'select', options: ['ALL', 'BUY', 'SELL'], required: false },
      { name: 'impact', type: 'select', options: ['ALL', 'LOW', 'MEDIUM', 'HIGH'], required: false },
    ]
  },
  {
    name: 'Download Market Report',
    method: 'GET',
    path: '/market-reports/daily',
    category: 'Market Reports',
    tier: 'Starter+',
    params: [
      { name: 'date', type: 'text', description: 'Date (YYYY-MM-DD)', required: false },
    ]
  },
  {
    name: 'Send Report to Telegram',
    method: 'POST',
    path: '/market-reports/send-telegram',
    category: 'Market Reports',
    tier: 'Pro+',
    params: [
      { name: 'date', type: 'text', description: 'Date (YYYY-MM-DD)', required: false },
    ]
  }
];

const CODE_EXAMPLES = {
  curl: (endpoint: Endpoint, apiKey: string, params: Record<string, any>) => {
    const queryString = Object.entries(params)
      .filter(([_, v]) => v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    const url = queryString
      ? `http://localhost:3001/api/v1${endpoint.path}?${queryString}`
      : `http://localhost:3001/api/v1${endpoint.path}`;

    return `curl -X ${endpoint.method} "${url}" \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json"`;
  },

  javascript: (endpoint: Endpoint, apiKey: string, params: Record<string, any>) => {
    const queryString = Object.entries(params)
      .filter(([_, v]) => v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

    return `const response = await fetch('http://localhost:3001/api/v1${endpoint.path}${queryString ? '?' + queryString : ''}', {
  method: '${endpoint.method}',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();
console.log(data);`;
  },

  python: (endpoint: Endpoint, apiKey: string, params: Record<string, any>) => {
    const paramsStr = Object.entries(params)
      .filter(([_, v]) => v !== '')
      .map(([k, v]) => `'${k}': '${v}'`)
      .join(', ');

    return `import requests

response = requests.${endpoint.method.toLowerCase()}(
    'http://localhost:3001/api/v1${endpoint.path}',
    headers={'Authorization': f'Bearer ${apiKey}'},
    params={${paramsStr}}
)

data = response.json()
print(data)`;
  }
};

export default function ApiTesterPage() {
  const [apiKey, setApiKey] = useState('');
  const [selectedEndpoint, setSelectedEndpoint] = useState<Endpoint>(ENDPOINTS[0]);
  const [params, setParams] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [responseTime, setResponseTime] = useState<number>(0);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [headers, setHeaders] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'curl' | 'javascript' | 'python'>('curl');

  const handleTest = async () => {
    if (!apiKey.trim()) {
      toast.error('Please enter your API key');
      return;
    }

    setLoading(true);
    setResponse(null);
    setStatusCode(null);

    const startTime = Date.now();

    try {
      // Filter out empty params
      const filteredParams = Object.entries(params)
        .filter(([_, v]) => v !== '' && v !== 'ALL')
        .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});

      const result = await publicApi.testEndpoint(
        apiKey,
        selectedEndpoint.method,
        selectedEndpoint.path,
        filteredParams
      );

      const endTime = Date.now();
      setResponseTime(endTime - startTime);
      setStatusCode(result.status);
      setHeaders(result.headers);
      setResponse(result.data);
      toast.success(`Request successful (${result.status})`);
    } catch (error: any) {
      const endTime = Date.now();
      setResponseTime(endTime - startTime);
      setStatusCode(error.response?.status || 500);
      setHeaders(error.response?.headers || {});
      setResponse(error.response?.data || { error: error.message });
      toast.error(error.response?.data?.error || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const getStatusColor = () => {
    if (!statusCode) return 'text-gray-500';
    if (statusCode < 300) return 'text-green-600';
    if (statusCode < 400) return 'text-yellow-600';
    return 'text-red-600';
  };

  const groupedEndpoints = ENDPOINTS.reduce((acc, endpoint) => {
    if (!acc[endpoint.category]) {
      acc[endpoint.category] = [];
    }
    acc[endpoint.category].push(endpoint);
    return acc;
  }, {} as Record<string, Endpoint[]>);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Zap className="h-8 w-8 text-primary-600" />
            API Tester
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Test your API endpoints interactively with live requests and responses
          </p>
        </div>

        {/* API Key Input */}
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            API Key
          </label>
          <input
            type="text"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="mk_live_your_api_key_here"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Get your API key from the <a href="/dashboard/settings/api-keys" className="text-primary-600 hover:underline">API Keys</a> page
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Endpoint Selector */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sticky top-4">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
                Endpoints
              </h2>
              <div className="space-y-4">
                {Object.entries(groupedEndpoints).map(([category, endpoints]) => (
                  <div key={category}>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                      {category}
                    </h3>
                    <div className="space-y-1">
                      {endpoints.map((endpoint) => (
                        <button
                          key={endpoint.path}
                          onClick={() => {
                            setSelectedEndpoint(endpoint);
                            setParams({});
                            setResponse(null);
                            setStatusCode(null);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                            selectedEndpoint.path === endpoint.path
                              ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{endpoint.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              endpoint.method === 'GET'
                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                            }`}>
                              {endpoint.method}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                            {endpoint.path}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Middle: Request Builder */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Request
                </h2>
                <span className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {selectedEndpoint.tier}
                </span>
              </div>

              <div className="mb-4">
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded-lg font-mono text-sm">
                  <span className={`font-semibold ${
                    selectedEndpoint.method === 'GET' ? 'text-blue-600' : 'text-green-600'
                  }`}>
                    {selectedEndpoint.method}
                  </span>
                  <span className="text-gray-600 dark:text-gray-400">/api/v1{selectedEndpoint.path}</span>
                </div>
              </div>

              {selectedEndpoint.params && selectedEndpoint.params.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                    Query Parameters
                  </h3>
                  <div className="space-y-3">
                    {selectedEndpoint.params.map((param) => (
                      <div key={param.name}>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          {param.name}
                          {!param.required && <span className="text-gray-400 ml-1">(optional)</span>}
                        </label>
                        {param.type === 'select' && param.options ? (
                          <select
                            value={params[param.name] || 'ALL'}
                            onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          >
                            {param.options.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={param.type === 'number' ? 'number' : 'text'}
                            value={params[param.name] || ''}
                            onChange={(e) => setParams({ ...params, [param.name]: e.target.value })}
                            placeholder={param.description}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleTest}
                disabled={loading}
                className="w-full mt-6 flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Testing...
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Send Request
                  </>
                )}
              </button>
            </div>

            {/* Code Examples */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white flex items-center gap-2">
                <Code className="h-5 w-5" />
                Code Examples
              </h2>

              <div className="flex gap-2 mb-4">
                {(['curl', 'javascript', 'python'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setActiveTab(lang)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      activeTab === lang
                        ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                  >
                    {lang.charAt(0).toUpperCase() + lang.slice(1)}
                  </button>
                ))}
              </div>

              <div className="relative">
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                  <code>{CODE_EXAMPLES[activeTab](selectedEndpoint, apiKey || 'YOUR_API_KEY', params)}</code>
                </pre>
                <button
                  onClick={() => handleCopy(CODE_EXAMPLES[activeTab](selectedEndpoint, apiKey || 'YOUR_API_KEY', params))}
                  className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                >
                  <Copy className="h-4 w-4 text-gray-300" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: Response */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 sticky top-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <FileJson className="h-5 w-5" />
                  Response
                </h2>
                {statusCode && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      {responseTime}ms
                    </span>
                    <span className={`text-sm font-semibold ${getStatusColor()}`}>
                      {statusCode}
                    </span>
                  </div>
                )}
              </div>

              {!response ? (
                <div className="text-center py-12">
                  <Terminal className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Click "Send Request" to see the response
                  </p>
                </div>
              ) : (
                <>
                  {/* Rate Limit Headers */}
                  {headers && (headers['x-ratelimit-limit'] || headers['X-RateLimit-Limit']) && (
                    <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-2">
                        Rate Limits
                      </h3>
                      <div className="space-y-1 text-xs text-blue-700 dark:text-blue-300">
                        <div className="flex justify-between">
                          <span>Limit:</span>
                          <span className="font-mono">{headers['x-ratelimit-limit'] || headers['X-RateLimit-Limit']}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Remaining:</span>
                          <span className="font-mono">{headers['x-ratelimit-remaining'] || headers['X-RateLimit-Remaining']}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Response Body */}
                  <div className="relative">
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg text-xs overflow-auto max-h-[600px]">
                      <code>{JSON.stringify(response, null, 2)}</code>
                    </pre>
                    <button
                      onClick={() => handleCopy(JSON.stringify(response, null, 2))}
                      className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 rounded transition-colors"
                    >
                      <Copy className="h-4 w-4 text-gray-300" />
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
