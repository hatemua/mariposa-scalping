'use client';

import { useState, useEffect } from 'react';
import { mt4Api } from '@/lib/api';
import { toast } from 'react-hot-toast';
import DashboardLayout from '@/components/layout/DashboardLayout';
import {
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw
} from 'lucide-react';

interface BridgeStatus {
  connected: boolean;
  bridgeUrl?: string;
  error?: string;
}

export default function MT4SettingsPage() {
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    // Check bridge status on mount
    checkBridgeStatus();
  }, []);

  const checkBridgeStatus = async () => {
    setIsChecking(true);

    try {
      const response = await mt4Api.testConnection();

      if (response.success && response.data?.connected) {
        setBridgeStatus({
          connected: true,
          bridgeUrl: response.data.bridgeUrl
        });
        setLastChecked(new Date());
        toast.success('MT4 bridge is connected and ready!');
      } else {
        setBridgeStatus({
          connected: false,
          error: response.error || response.data?.error || 'Bridge connection failed'
        });
        setLastChecked(new Date());
        toast.error('MT4 bridge connection failed');
      }
    } catch (error: any) {
      console.error('Bridge status check error:', error);
      setBridgeStatus({
        connected: false,
        error: error.message || 'Failed to check bridge status'
      });
      setLastChecked(new Date());
      toast.error('Failed to check MT4 bridge status');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Server className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">MT4 Bridge Status</h1>
          </div>
          <p className="text-gray-600 text-lg">
            Monitor your MT4 bridge connection for automated trading on MetaTrader 4.
          </p>
        </div>

        {/* Status Card */}
        <div className="bg-white border border-gray-200 rounded-xl shadow-lg mb-8">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-gray-900">Bridge Connection Status</h2>
            <p className="text-gray-600 mt-1">
              The MT4 bridge connects your system to MetaTrader 4 for order execution.
            </p>
          </div>

          <div className="p-6">
            {/* Status Display */}
            {bridgeStatus && (
              <div className={`p-6 rounded-lg border-2 mb-6 ${
                bridgeStatus.connected
                  ? 'bg-green-50 border-green-300'
                  : 'bg-red-50 border-red-300'
              }`}>
                <div className="flex items-center gap-4 mb-4">
                  {bridgeStatus.connected ? (
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  ) : (
                    <XCircle className="h-12 w-12 text-red-600" />
                  )}
                  <div>
                    <h3 className={`text-2xl font-bold ${
                      bridgeStatus.connected ? 'text-green-900' : 'text-red-900'
                    }`}>
                      {bridgeStatus.connected ? 'Bridge Connected' : 'Bridge Disconnected'}
                    </h3>
                    {lastChecked && (
                      <p className={`text-sm mt-1 ${
                        bridgeStatus.connected ? 'text-green-700' : 'text-red-700'
                      }`}>
                        Last checked: {lastChecked.toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </div>

                {bridgeStatus.connected ? (
                  <div className="space-y-2 text-green-800">
                    <p className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      <span>MT4 bridge is online and ready to execute orders</span>
                    </p>
                    {bridgeStatus.bridgeUrl && (
                      <p className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        <span>Connected to: {bridgeStatus.bridgeUrl}</span>
                      </p>
                    )}
                    <p className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      <span>All MT4 agents can now execute signals</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 text-red-800">
                    <p className="flex items-center gap-2">
                      <XCircle className="h-5 w-5" />
                      <span>MT4 bridge is not responding</span>
                    </p>
                    {bridgeStatus.error && (
                      <p className="text-sm mt-2 p-3 bg-red-100 rounded">
                        Error: {bridgeStatus.error}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Check Connection Button */}
            <button
              onClick={checkBridgeStatus}
              disabled={isChecking}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isChecking ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
              {isChecking ? 'Checking Connection...' : 'Check Connection'}
            </button>
          </div>
        </div>

        {/* Information Card */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mb-8">
          <div className="flex items-start gap-3">
            <Info className="h-6 w-6 text-blue-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 mb-3">About MT4 Bridge</h3>
              <div className="space-y-2 text-blue-800">
                <p>The MT4 bridge is a service that connects this platform to your MetaTrader 4 terminal.</p>
                <p>• <strong>No configuration needed</strong> - The bridge uses shared credentials from the system</p>
                <p>• <strong>Automatic setup</strong> - All MT4 agents use the same bridge connection</p>
                <p>• <strong>Real-time execution</strong> - Orders are sent directly to MT4 with ultra-low latency</p>
                <p>• <strong>Secure connection</strong> - Communication uses encrypted channels</p>
              </div>
              <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                <p className="text-sm text-blue-900 font-medium">
                  💡 The bridge is configured by system administrators. You don't need to enter any credentials.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Troubleshooting */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-yellow-900 mb-2">Troubleshooting</h3>
              <div className="text-yellow-800 space-y-3 text-sm">
                <div>
                  <p className="font-semibold">Bridge Not Connected?</p>
                  <p className="mt-1">1. Check if the MT4 bridge service is running:</p>
                  <code className="block bg-yellow-100 p-2 rounded mt-1 font-mono">curl http://localhost:8080/api/v1/ping</code>
                </div>

                <div className="mt-3">
                  <p className="font-semibold">MT4 Terminal Issues?</p>
                  <p className="mt-1">2. Ensure MetaTrader 4 is running and logged in</p>
                  <p className="mt-1">3. Check that the ZeroMQ Expert Advisor is attached to a chart</p>
                </div>

                <div className="mt-3">
                  <p className="font-semibold">Docker Setup?</p>
                  <p className="mt-1">4. Check bridge container status:</p>
                  <code className="block bg-yellow-100 p-2 rounded mt-1 font-mono">docker ps | grep mt4-bridge</code>
                  <p className="mt-1">5. View bridge logs:</p>
                  <code className="block bg-yellow-100 p-2 rounded mt-1 font-mono">docker logs mt4-bridge-server --tail 50</code>
                </div>

                <div className="mt-3">
                  <p className="font-semibold">Need Help?</p>
                  <p className="mt-1">Contact your system administrator if the bridge remains disconnected.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
