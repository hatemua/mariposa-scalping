'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, Star, TrendingUp, TrendingDown } from 'lucide-react';
import { marketApi } from '@/lib/api';

interface SymbolSelectorProps {
  selectedSymbol: string;
  onSymbolChange: (symbol: string) => void;
  availableSymbols: string[];
  className?: string;
}

interface SymbolData {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  isFavorite: boolean;
}

export default function SymbolSelector({
  selectedSymbol,
  onSymbolChange,
  availableSymbols,
  className = ''
}: SymbolSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [symbolsData, setSymbolsData] = useState<SymbolData[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']));
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load favorites from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('favoriteSymbols');
    if (stored) {
      setFavorites(new Set(JSON.parse(stored)));
    }
  }, []);

  // Fetch price data for all symbols
  useEffect(() => {
    const fetchSymbolsData = async () => {
      const data = await Promise.all(
        availableSymbols.map(async (symbol) => {
          try {
            const response = await marketApi.getMarketData(symbol);
            if (response.success && response.data) {
              return {
                symbol,
                price: response.data.price || 0,
                change24h: response.data.change24h || 0,
                volume: response.data.volume || 0,
                isFavorite: favorites.has(symbol)
              };
            }
          } catch (error) {
            console.warn(`Failed to fetch data for ${symbol}`);
          }
          return {
            symbol,
            price: 0,
            change24h: 0,
            volume: 0,
            isFavorite: favorites.has(symbol)
          };
        })
      );
      setSymbolsData(data);
    };

    fetchSymbolsData();
    const interval = setInterval(fetchSymbolsData, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [availableSymbols, favorites]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleFavorite = (symbol: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(symbol)) {
      newFavorites.delete(symbol);
    } else {
      newFavorites.add(symbol);
    }
    setFavorites(newFavorites);
    localStorage.setItem('favoriteSymbols', JSON.stringify(Array.from(newFavorites)));
  };

  const filteredSymbols = symbolsData.filter(data =>
    data.symbol.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Sort: favorites first, then by volume
  const sortedSymbols = [...filteredSymbols].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return b.volume - a.volume;
  });

  const selectedData = symbolsData.find(d => d.symbol === selectedSymbol);

  const handleSymbolSelect = (symbol: string) => {
    onSymbolChange(symbol);
    setIsOpen(false);
    setSearchTerm('');
  };

  const formatPrice = (price: number) => {
    if (price === 0) return '$0.00';
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    if (price < 100) return `$${price.toFixed(2)}`;
    return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatChange = (change: number) => {
    const sign = change > 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Selector Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-white border-2 border-gray-200 rounded-lg hover:border-blue-400 transition-all duration-200 shadow-sm hover:shadow-md min-w-[280px]"
      >
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-gray-900">{selectedSymbol}</span>
            {selectedData && selectedData.change24h !== 0 && (
              <span className={`flex items-center text-sm font-medium ${selectedData.change24h > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {selectedData.change24h > 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                {formatChange(selectedData.change24h)}
              </span>
            )}
          </div>
          {selectedData && selectedData.price > 0 && (
            <div className="text-sm text-gray-600">{formatPrice(selectedData.price)}</div>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full min-w-[320px] bg-white border border-gray-200 rounded-lg shadow-xl z-50 max-h-[480px] flex flex-col">
          {/* Search Bar */}
          <div className="p-3 border-b border-gray-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search symbols..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>

          {/* Symbols List */}
          <div className="overflow-y-auto flex-1">
            {sortedSymbols.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No symbols found</div>
            ) : (
              sortedSymbols.map((data) => (
                <div
                  key={data.symbol}
                  className={`flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                    data.symbol === selectedSymbol ? 'bg-blue-50 border-l-4 border-blue-500' : ''
                  }`}
                  onClick={() => handleSymbolSelect(data.symbol)}
                >
                  {/* Favorite Star */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(data.symbol);
                    }}
                    className="flex-shrink-0"
                  >
                    <Star
                      className={`w-4 h-4 ${
                        data.isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
                      } hover:text-yellow-400 transition-colors`}
                    />
                  </button>

                  {/* Symbol Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900">{data.symbol}</div>
                    {data.price > 0 && (
                      <div className="text-sm text-gray-600">{formatPrice(data.price)}</div>
                    )}
                  </div>

                  {/* Change Indicator */}
                  {data.change24h !== 0 && (
                    <div className={`flex items-center text-sm font-medium ${
                      data.change24h > 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {data.change24h > 0 ? (
                        <TrendingUp className="w-4 h-4 mr-1" />
                      ) : (
                        <TrendingDown className="w-4 h-4 mr-1" />
                      )}
                      {formatChange(data.change24h)}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Footer Info */}
          <div className="p-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 text-center">
            {sortedSymbols.length} symbols available
          </div>
        </div>
      )}
    </div>
  );
}
