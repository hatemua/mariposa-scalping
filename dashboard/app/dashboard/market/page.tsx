'use client';

import { useEffect, useState } from 'react';
import { marketApi } from '@/lib/api';
import { wsClient } from '@/lib/websocket';
import { MarketData } from '@/types';
import { toast } from 'react-hot-toast';
import { TrendingUp, TrendingDown, Activity, DollarSign, Volume2, RefreshCw } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';

export default function MarketPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>(['BTCUSDT', 'ETHUSDT', 'ADAUSDT']);
  const [marketData, setMarketData] = useState<Record<string, MarketData>>({});
  const [loading, setLoading] = useState(true);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      wsClient.connect(token);
      loadSymbols();
      loadMarketData();
    }

    // Set up WebSocket listeners
    wsClient.on('market-update', handleMarketUpdate);
    wsClient.on('live-data', handleLiveData);
    wsClient.on('binance-status', handleBinanceStatus);

    return () => {
      wsClient.off('market-update', handleMarketUpdate);
      wsClient.off('live-data', handleLiveData);
      wsClient.off('binance-status', handleBinanceStatus);
      wsClient.unsubscribeFromMarket(selectedSymbols);
    };
  }, []);

  useEffect(() => {
    if (selectedSymbols.length > 0 && wsClient.connected) {
      subscribeToMarkets();
    }
  }, [selectedSymbols, wsClient.connected]);

  const loadSymbols = async () => {
    try {
      const response = await marketApi.getSymbols();
      if (response.success) {
        setSymbols(response.data);
      }
    } catch (error) {
      toast.error('Failed to load symbols');
    }
  };

  const loadMarketData = async () => {
    try {
      const promises = selectedSymbols.map(symbol =>
        marketApi.getMarketData(symbol).catch(() => null)
      );
      const responses = await Promise.all(promises);

      const newMarketData: Record<string, MarketData> = {};
      responses.forEach((response, index) => {
        if (response?.success) {
          newMarketData[selectedSymbols[index]] = response.data;
        }
      });

      setMarketData(newMarketData);
    } catch (error) {
      toast.error('Failed to load market data');
    } finally {
      setLoading(false);
    }
  };

  const subscribeToMarkets = async () => {
    if (!wsClient.connected) return;

    setSubscriptionLoading(true);
    try {
      wsClient.subscribeToMarket(selectedSymbols);
      toast.success(`Subscribed to ${selectedSymbols.length} markets`);
    } catch (error) {
      toast.error('Failed to subscribe to market updates');
    } finally {
      setSubscriptionLoading(false);
    }
  };

  const handleMarketUpdate = (data: any) => {
    if (data.type === 'ticker' && data.data) {
      setMarketData(prev => ({
        ...prev,
        [data.data.symbol]: {
          ...prev[data.data.symbol],
          ...data.data,
          timestamp: new Date().toISOString()
        }
      }));
    }
  };

  const handleLiveData = (data: any) => {
    if (data.symbol && data.data) {
      setMarketData(prev => ({
        ...prev,
        [data.symbol]: {
          ...prev[data.symbol],
          ...data.data,
          timestamp: new Date().toISOString()
        }
      }));
    }
  };

  const handleBinanceStatus = (data: any) => {
    if (data.status === 'connected') {
      toast.success('Binance connection established');
    } else if (data.status === 'disconnected') {
      toast.error('Binance connection lost');
    } else if (data.status === 'error') {
      toast.error(`Binance error: ${data.error}`);
    }
  };

  const handleSymbolToggle = (symbol: string) => {
    setSelectedSymbols(prev => {
      const newSelected = prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol];

      // Update WebSocket subscriptions
      if (prev.includes(symbol)) {
        wsClient.unsubscribeFromMarket([symbol]);
      } else {
        wsClient.subscribeToMarket([symbol]);
      }

      return newSelected;
    });
  };

  const refreshMarketData = () => {
    setLoading(true);
    loadMarketData();
  };

  const getLiveData = (symbol: string) => {
    wsClient.getLiveData(symbol);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Market Data</h1>
          <p className="text-gray-600">Real-time market prices and data</p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={refreshMarketData}
                className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={subscribeToMarkets}
                disabled={subscriptionLoading}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <Activity className="h-4 w-4" />
                {subscriptionLoading ? 'Subscribing...' : 'Subscribe All'}
              </button>
            </div>
            <div className="text-sm text-gray-600">
              {selectedSymbols.length} symbols selected
            </div>
          </div>
        </div>

        {/* Symbol Selection */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Select Symbols</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
            {symbols.map(symbol => (
              <button
                key={symbol}
                onClick={() => handleSymbolToggle(symbol)}
                className={`p-2 text-sm rounded-lg border transition-colors ${
                  selectedSymbols.includes(symbol)
                    ? 'bg-primary-100 border-primary-300 text-primary-800'
                    : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                }`}
              >
                {symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Market Data Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {selectedSymbols.map(symbol => {
            const data = marketData[symbol];
            const isPositive = data?.change24h >= 0;

            return (
              <div key={symbol} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{symbol}</h3>
                    <p className="text-sm text-gray-500">
                      Last updated: {data?.timestamp ? new Date(data.timestamp).toLocaleTimeString() : 'No data'}
                    </p>
                  </div>
                  <button
                    onClick={() => getLiveData(symbol)}
                    className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                    title="Get live data"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>

                {data ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Price</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-gray-900">
                          ${data.price?.toFixed(4) || 'N/A'}
                        </span>
                        {isPositive ? (
                          <TrendingUp className="h-4 w-4 text-green-600" />
                        ) : (
                          <TrendingDown className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">24h Change</span>
                      <span className={`font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {data.change24h ? `${data.change24h.toFixed(2)}%` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">High 24h</span>
                      <span className="font-medium text-gray-900">
                        ${data.high24h?.toFixed(4) || 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Low 24h</span>
                      <span className="font-medium text-gray-900">
                        ${data.low24h?.toFixed(4) || 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Volume2 className="h-3 w-3 text-gray-400" />
                        <span className="text-gray-600">Volume</span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {data.volume ? data.volume.toLocaleString() : 'N/A'}
                      </span>
                    </div>

                    {data.orderBook && (
                      <div className="pt-3 border-t border-gray-100">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Best Bid</h4>
                            {data.orderBook.bids?.[0] && (
                              <div className="text-sm">
                                <div className="text-green-600 font-medium">
                                  ${parseFloat(data.orderBook.bids[0][0]).toFixed(4)}
                                </div>
                                <div className="text-gray-500">
                                  {parseFloat(data.orderBook.bids[0][1]).toFixed(2)}
                                </div>
                              </div>
                            )}
                          </div>
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Best Ask</h4>
                            {data.orderBook.asks?.[0] && (
                              <div className="text-sm">
                                <div className="text-red-600 font-medium">
                                  ${parseFloat(data.orderBook.asks[0][0]).toFixed(4)}
                                </div>
                                <div className="text-gray-500">
                                  {parseFloat(data.orderBook.asks[0][1]).toFixed(2)}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center py-8">
                    <div className="text-center">
                      <DollarSign className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-500">No data available</p>
                      <button
                        onClick={() => getLiveData(symbol)}
                        className="mt-2 text-primary-600 hover:text-primary-700 text-sm"
                      >
                        Load data
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedSymbols.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
            <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Symbols Selected</h3>
            <p className="text-gray-600">Select symbols above to view real-time market data</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}