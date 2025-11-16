'use client';

import React, { useState, useEffect } from 'react';
import { mt4Api } from '@/lib/api';
import { MT4BridgeStatus, MT4AccountInfo, MT4Position } from '@/types';
import {
  Activity,
  DollarSign,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  BarChart3
} from 'lucide-react';

interface MT4AccountInfoProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  showOpenOrders?: boolean;
  className?: string;
}

export default function MT4AccountInfoComponent({
  autoRefresh = true,
  refreshInterval = 10000,
  showOpenOrders = true,
  className = ''
}: MT4AccountInfoProps) {
  const [status, setStatus] = useState<MT4BridgeStatus | null>(null);
  const [account, setAccount] = useState<MT4AccountInfo | null>(null);
  const [positions, setPositions] = useState<MT4Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMT4Data = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch MT4 status
      const statusResponse = await mt4Api.getStatus();
      if (statusResponse.success && statusResponse.data) {
        setStatus(statusResponse.data as MT4BridgeStatus);
      }

      // Fetch account info if connected
      if (statusResponse.success && statusResponse.data?.connected) {
        try {
          const accountResponse = await mt4Api.getAccount();
          if (accountResponse.success && accountResponse.data) {
            setAccount(accountResponse.data as MT4AccountInfo);
          }
        } catch (err: any) {
          console.error('Failed to fetch MT4 account:', err);
        }

        // Fetch open positions if requested
        if (showOpenOrders) {
          try {
            const positionsResponse = await mt4Api.getOpenOrders();
            if (positionsResponse.success && positionsResponse.data?.orders) {
              setPositions(positionsResponse.data.orders as MT4Position[]);
            }
          } catch (err: any) {
            console.error('Failed to fetch MT4 positions:', err);
          }
        }
      }
    } catch (err: any) {
      console.error('Error fetching MT4 data:', err);
      setError(err.message || 'Failed to fetch MT4 data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMT4Data();
  }, []);

  useEffect(() => {
    if (autoRefresh && refreshInterval > 0) {
      const interval = setInterval(fetchMT4Data, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval]);

  if (loading && !status) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-5 w-5 text-blue-600 animate-spin mr-2" />
          <span className="text-gray-600">Loading MT4 data...</span>
        </div>
      </div>
    );
  }

  const isConnected = status?.connected === true;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-900">MT4 Account</h3>
              <div className="flex items-center gap-2 mt-1">
                {isConnected ? (
                  <>
                    <CheckCircle className="h-3 w-3 text-green-600" />
                    <span className="text-xs text-green-600 font-medium">Connected</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-3 w-3 text-red-600" />
                    <span className="text-xs text-red-600 font-medium">Disconnected</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={fetchMT4Data}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Refresh MT4 Data"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {error && (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
            <span className="text-red-700 text-sm">{error}</span>
          </div>
        )}

        {!isConnected && (
          <div className="flex items-center gap-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-900">MT4 Bridge Not Connected</p>
              <p className="text-amber-700 mt-1">
                Please ensure the MT4 Bridge is running and properly configured.
              </p>
            </div>
          </div>
        )}

        {isConnected && account && (
          <>
            {/* Account Info Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <DollarSign className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-600">Balance</span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  ${account.balance.toFixed(2)}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-600">Equity</span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  ${account.equity.toFixed(2)}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-gray-600" />
                  <span className="text-sm text-gray-600">Free Margin</span>
                </div>
                <div className="text-xl font-bold text-gray-900">
                  ${account.freeMargin.toFixed(2)}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">P&L</div>
                <div className={`text-xl font-bold ${account.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {account.profit >= 0 ? '+' : ''}${account.profit.toFixed(2)}
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Margin Level</div>
                <div className="text-xl font-bold text-blue-600">
                  {account.marginLevel.toFixed(2)}%
                </div>
              </div>

              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Leverage</div>
                <div className="text-xl font-bold text-purple-600">
                  1:{account.leverage}
                </div>
              </div>
            </div>

            {/* Open Positions */}
            {showOpenOrders && (
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">
                  Open Positions ({positions.length})
                </h4>
                {positions.length === 0 ? (
                  <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-lg">
                    No open positions
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left p-3 font-medium text-gray-700">Ticket</th>
                          <th className="text-left p-3 font-medium text-gray-700">Symbol</th>
                          <th className="text-left p-3 font-medium text-gray-700">Type</th>
                          <th className="text-right p-3 font-medium text-gray-700">Lots</th>
                          <th className="text-right p-3 font-medium text-gray-700">Entry</th>
                          <th className="text-right p-3 font-medium text-gray-700">Current</th>
                          <th className="text-right p-3 font-medium text-gray-700">P&L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {positions.map((position) => (
                          <tr key={position.ticket} className="hover:bg-gray-50">
                            <td className="p-3 text-gray-900 font-mono">#{position.ticket}</td>
                            <td className="p-3 text-gray-900 font-medium">{position.symbol}</td>
                            <td className="p-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                position.side === 'BUY'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {position.side}
                              </span>
                            </td>
                            <td className="p-3 text-right text-gray-900">{position.lots.toFixed(2)}</td>
                            <td className="p-3 text-right text-gray-600">
                              ${position.openPrice.toFixed(position.symbol.includes('JPY') ? 3 : 5)}
                            </td>
                            <td className="p-3 text-right text-gray-600">
                              ${position.currentPrice ? position.currentPrice.toFixed(position.symbol.includes('JPY') ? 3 : 5) : '-'}
                            </td>
                            <td className="p-3 text-right">
                              <span className={`font-semibold ${
                                (position.profit || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {(position.profit || 0) >= 0 ? '+' : ''}${(position.profit || 0).toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
