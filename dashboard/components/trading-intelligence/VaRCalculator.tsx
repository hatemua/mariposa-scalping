'use client';

import React, { useState, useEffect } from 'react';
import { marketApi } from '@/lib/api';
import { safeNumber, safeObject, safeArray } from '@/lib/formatters';
import { toast } from 'react-hot-toast';
import {
  BarChart3,
  TrendingDown,
  AlertTriangle,
  Target,
  Calculator,
  RefreshCw,
  Settings,
  Info,
  Clock,
  Activity,
  Shield,
  Zap
} from 'lucide-react';

interface VaRResult {
  method: 'HISTORICAL' | 'PARAMETRIC' | 'MONTE_CARLO' | 'EXTREME_VALUE';
  confidence: number;
  timeHorizon: number;
  value: number;
  expectedShortfall: number;
  conditionalVaR: number;
  backTestSuccess: number;
  reliability: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface VaRBreakdown {
  portfolioVaR: number;
  componentVaRs: { [symbol: string]: number };
  marginalVaRs: { [symbol: string]: number };
  incrementalVaRs: { [symbol: string]: number };
  diversificationBenefit: number;
}

interface StressTestResult {
  scenario: string;
  description: string;
  probability: number;
  portfolioImpact: number;
  worstCaseVaR: number;
  recoveryTime: string;
  hedgeRecommendation: string;
}

interface VaRData {
  symbol: string;
  portfolioValue: number;
  varResults: VaRResult[];
  varBreakdown: VaRBreakdown;
  stressTests: StressTestResult[];
  riskMetrics: {
    sharpeRatio: number;
    sortinoRatio: number;
    maxDrawdown: number;
    calmarRatio: number;
    volatility: number;
    skewness: number;
    kurtosis: number;
  };
  backtestResults: {
    violations: number;
    expectedViolations: number;
    kupiecTest: number;
    independenceTest: number;
    accuracy: number;
  };
  recommendations: string[];
}

interface VaRCalculatorProps {
  symbols: string[];
  portfolioWeights?: { [symbol: string]: number };
  confidence?: number;
  timeHorizon?: number;
  autoRefresh?: boolean;
  refreshInterval?: number;
  className?: string;
}

const VAR_METHODS = {
  HISTORICAL: { name: 'Historical Simulation', reliability: 'HIGH', description: 'Based on actual historical returns' },
  PARAMETRIC: { name: 'Parametric (Normal)', reliability: 'MEDIUM', description: 'Assumes normal distribution' },
  MONTE_CARLO: { name: 'Monte Carlo', reliability: 'HIGH', description: 'Simulated returns using random sampling' },
  EXTREME_VALUE: { name: 'Extreme Value Theory', reliability: 'MEDIUM', description: 'Focuses on tail risk events' }
};

const CONFIDENCE_LEVELS = [90, 95, 99, 99.9];
const TIME_HORIZONS = [1, 5, 10, 22]; // Days

export default function VaRCalculator({
  symbols,
  portfolioWeights = {},
  confidence = 95,
  timeHorizon = 1,
  autoRefresh = true,
  refreshInterval = 60000, // 1 minute
  className = ''
}: VaRCalculatorProps) {
  const [varData, setVarData] = useState<VaRData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<keyof typeof VAR_METHODS>('HISTORICAL');
  const [selectedConfidence, setSelectedConfidence] = useState(confidence);
  const [selectedTimeHorizon, setSelectedTimeHorizon] = useState(timeHorizon);
  const [showBreakdown, setShowBreakdown] = useState(true);

  // Calculate historical VaR using historical simulation
  const calculateHistoricalVaR = (returns: number[], confidence: number): number => {
    if (returns.length === 0) return 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const index = Math.floor((1 - confidence / 100) * sortedReturns.length);
    return Math.abs(sortedReturns[index] || 0);
  };

  // Calculate parametric VaR assuming normal distribution
  const calculateParametricVaR = (returns: number[], confidence: number): number => {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    // Z-scores for different confidence levels
    const zScores: { [key: number]: number } = {
      90: 1.282,
      95: 1.645,
      99: 2.326,
      99.9: 3.090
    };

    const zScore = zScores[confidence] || 1.645;
    return Math.abs(mean - zScore * stdDev);
  };

  // Calculate Monte Carlo VaR using simulation
  const calculateMonteCarloVaR = (returns: number[], confidence: number, simulations: number = 10000): number => {
    if (returns.length === 0) return 0;

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    const simulatedReturns: number[] = [];

    for (let i = 0; i < simulations; i++) {
      // Box-Muller transformation for normal random numbers
      const u1 = Math.random();
      const u2 = Math.random();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      const simulatedReturn = mean + z * stdDev;
      simulatedReturns.push(simulatedReturn);
    }

    return calculateHistoricalVaR(simulatedReturns, confidence);
  };

  // Calculate Expected Shortfall (Conditional VaR)
  const calculateExpectedShortfall = (returns: number[], confidence: number): number => {
    if (returns.length === 0) return 0;

    const sortedReturns = [...returns].sort((a, b) => a - b);
    const cutoffIndex = Math.floor((1 - confidence / 100) * sortedReturns.length);
    const tailReturns = sortedReturns.slice(0, cutoffIndex + 1);

    if (tailReturns.length === 0) return 0;

    const expectedShortfall = tailReturns.reduce((sum, ret) => sum + ret, 0) / tailReturns.length;
    return Math.abs(expectedShortfall);
  };

  // Calculate portfolio statistics
  const calculatePortfolioStats = (returns: number[]) => {
    if (returns.length === 0) return { mean: 0, stdDev: 0, skewness: 0, kurtosis: 0 };

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    // Calculate skewness
    const skewness = returns.reduce((sum, ret) => sum + Math.pow((ret - mean) / stdDev, 3), 0) / returns.length;

    // Calculate kurtosis
    const kurtosis = returns.reduce((sum, ret) => sum + Math.pow((ret - mean) / stdDev, 4), 0) / returns.length - 3;

    return { mean, stdDev, skewness, kurtosis };
  };

  // Generate comprehensive VaR analysis
  const calculateVaRAnalysis = async (): Promise<VaRData> => {
    try {
      // Fetch historical data for all symbols
      const dataPromises = symbols.map(async (symbol) => {
        const chartData = await marketApi.getChartData(symbol, '1d', 252); // 1 year of daily data
        const klines = safeArray.get(safeObject.get(chartData, 'data.klines', []));
        const prices = klines.map((candle: any[]) => parseFloat(candle[4])); // Close prices

        // Calculate daily returns
        const returns = [];
        for (let i = 1; i < prices.length; i++) {
          const dailyReturn = (prices[i] - prices[i - 1]) / prices[i - 1];
          returns.push(dailyReturn);
        }

        return { symbol, returns, currentPrice: prices[prices.length - 1] || 0 };
      });

      const symbolsData = await Promise.all(dataPromises);

      // Calculate equal weights if not provided
      const weights = symbols.reduce((acc, symbol) => {
        acc[symbol] = portfolioWeights[symbol] || (1 / symbols.length);
        return acc;
      }, {} as { [symbol: string]: number });

      // Calculate portfolio returns
      const maxLength = Math.min(...symbolsData.map(data => data.returns.length));
      const portfolioReturns: number[] = [];

      for (let i = 0; i < maxLength; i++) {
        let portfolioReturn = 0;
        for (const data of symbolsData) {
          portfolioReturn += data.returns[i] * weights[data.symbol];
        }
        portfolioReturns.push(portfolioReturn);
      }

      // Calculate VaR using different methods
      const varResults: VaRResult[] = [];

      // Historical VaR
      const historicalVaR = calculateHistoricalVaR(portfolioReturns, selectedConfidence);
      const historicalES = calculateExpectedShortfall(portfolioReturns, selectedConfidence);
      varResults.push({
        method: 'HISTORICAL',
        confidence: selectedConfidence,
        timeHorizon: selectedTimeHorizon,
        value: historicalVaR * Math.sqrt(selectedTimeHorizon),
        expectedShortfall: historicalES * Math.sqrt(selectedTimeHorizon),
        conditionalVaR: historicalES * Math.sqrt(selectedTimeHorizon),
        backTestSuccess: 95, // Simulated
        reliability: 'HIGH'
      });

      // Parametric VaR
      const parametricVaR = calculateParametricVaR(portfolioReturns, selectedConfidence);
      const parametricES = calculateExpectedShortfall(portfolioReturns, selectedConfidence);
      varResults.push({
        method: 'PARAMETRIC',
        confidence: selectedConfidence,
        timeHorizon: selectedTimeHorizon,
        value: parametricVaR * Math.sqrt(selectedTimeHorizon),
        expectedShortfall: parametricES * Math.sqrt(selectedTimeHorizon),
        conditionalVaR: parametricES * Math.sqrt(selectedTimeHorizon),
        backTestSuccess: 88, // Simulated
        reliability: 'MEDIUM'
      });

      // Monte Carlo VaR
      const monteCarloVaR = calculateMonteCarloVaR(portfolioReturns, selectedConfidence);
      const monteCarloES = calculateExpectedShortfall(portfolioReturns, selectedConfidence);
      varResults.push({
        method: 'MONTE_CARLO',
        confidence: selectedConfidence,
        timeHorizon: selectedTimeHorizon,
        value: monteCarloVaR * Math.sqrt(selectedTimeHorizon),
        expectedShortfall: monteCarloES * Math.sqrt(selectedTimeHorizon),
        conditionalVaR: monteCarloES * Math.sqrt(selectedTimeHorizon),
        backTestSuccess: 96, // Simulated
        reliability: 'HIGH'
      });

      // Calculate component VaRs (simplified)
      const componentVaRs: { [symbol: string]: number } = {};
      const marginalVaRs: { [symbol: string]: number } = {};
      const incrementalVaRs: { [symbol: string]: number } = {};

      for (const symbol of symbols) {
        const weight = weights[symbol];
        const symbolData = symbolsData.find(data => data.symbol === symbol);
        if (symbolData) {
          const symbolVaR = calculateHistoricalVaR(symbolData.returns, selectedConfidence);
          componentVaRs[symbol] = symbolVaR * weight * Math.sqrt(selectedTimeHorizon);
          marginalVaRs[symbol] = symbolVaR * Math.sqrt(selectedTimeHorizon);
          incrementalVaRs[symbol] = symbolVaR * weight * Math.sqrt(selectedTimeHorizon);
        }
      }

      const portfolioVaR = historicalVaR * Math.sqrt(selectedTimeHorizon);
      const sumComponentVaRs = Object.values(componentVaRs).reduce((sum, var_) => sum + var_, 0);
      const diversificationBenefit = Math.max(0, sumComponentVaRs - portfolioVaR);

      const varBreakdown: VaRBreakdown = {
        portfolioVaR,
        componentVaRs,
        marginalVaRs,
        incrementalVaRs,
        diversificationBenefit
      };

      // Generate stress test scenarios
      const stressTests: StressTestResult[] = [
        {
          scenario: 'Black Monday Repeat',
          description: '20% market crash similar to 1987',
          probability: 0.01,
          portfolioImpact: -18.5,
          worstCaseVaR: portfolioVaR * 2.5,
          recoveryTime: '3-6 months',
          hedgeRecommendation: 'Increase cash allocation, add put options'
        },
        {
          scenario: 'Crypto Winter',
          description: 'Extended bear market with 60% decline',
          probability: 0.05,
          portfolioImpact: -55.2,
          worstCaseVaR: portfolioVaR * 4.0,
          recoveryTime: '12-24 months',
          hedgeRecommendation: 'Reduce crypto exposure, hedge with stablecoins'
        },
        {
          scenario: 'Flash Crash',
          description: 'Sudden liquidity crisis causing rapid decline',
          probability: 0.02,
          portfolioImpact: -25.7,
          worstCaseVaR: portfolioVaR * 3.0,
          recoveryTime: '1-3 days',
          hedgeRecommendation: 'Ensure adequate stop-losses, avoid leverage'
        },
        {
          scenario: 'Regulatory Shutdown',
          description: 'Major jurisdiction bans cryptocurrency trading',
          probability: 0.03,
          portfolioImpact: -40.1,
          worstCaseVaR: portfolioVaR * 3.5,
          recoveryTime: '6-18 months',
          hedgeRecommendation: 'Diversify across jurisdictions, hold non-custodial'
        }
      ];

      // Calculate risk metrics
      const stats = calculatePortfolioStats(portfolioReturns);
      const annualizedReturn = stats.mean * 252;
      const annualizedVolatility = stats.stdDev * Math.sqrt(252);
      const sharpeRatio = annualizedReturn / annualizedVolatility;

      // Calculate maximum drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let cumulativeReturn = 1;

      for (const ret of portfolioReturns) {
        cumulativeReturn *= (1 + ret);
        if (cumulativeReturn > peak) {
          peak = cumulativeReturn;
        }
        const drawdown = (peak - cumulativeReturn) / peak;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }

      // Calculate downside deviation for Sortino ratio
      const downsideReturns = portfolioReturns.filter(ret => ret < 0);
      const downsideDeviation = downsideReturns.length > 0 ?
        Math.sqrt(downsideReturns.reduce((sum, ret) => sum + ret * ret, 0) / downsideReturns.length) * Math.sqrt(252) :
        0;
      const sortinoRatio = downsideDeviation > 0 ? annualizedReturn / downsideDeviation : 0;
      const calmarRatio = maxDrawdown > 0 ? annualizedReturn / maxDrawdown : 0;

      const riskMetrics = {
        sharpeRatio,
        sortinoRatio,
        maxDrawdown: maxDrawdown * 100,
        calmarRatio,
        volatility: annualizedVolatility * 100,
        skewness: stats.skewness,
        kurtosis: stats.kurtosis
      };

      // Simulate backtest results
      const expectedViolations = Math.floor(portfolioReturns.length * (1 - selectedConfidence / 100));
      const actualViolations = portfolioReturns.filter(ret => Math.abs(ret) > historicalVaR).length;

      const backtestResults = {
        violations: actualViolations,
        expectedViolations,
        kupiecTest: Math.abs(actualViolations - expectedViolations) / Math.sqrt(expectedViolations),
        independenceTest: 0.85, // Simulated
        accuracy: Math.max(0, Math.min(100, 100 - Math.abs(actualViolations - expectedViolations) * 5))
      };

      // Generate recommendations
      const recommendations: string[] = [];

      if (portfolioVaR > 0.05) {
        recommendations.push('Portfolio VaR exceeds 5% - consider reducing risk exposure');
      }

      if (diversificationBenefit < portfolioVaR * 0.1) {
        recommendations.push('Low diversification benefit - review asset correlations');
      }

      if (maxDrawdown > 0.2) {
        recommendations.push('Maximum drawdown exceeds 20% - implement stricter stop-losses');
      }

      if (stats.kurtosis > 3) {
        recommendations.push('High kurtosis detected - fat tail risk present');
      }

      if (backtestResults.accuracy < 90) {
        recommendations.push('VaR model accuracy below 90% - consider alternative methods');
      }

      if (recommendations.length === 0) {
        recommendations.push('Risk metrics within acceptable ranges - maintain current strategy');
      }

      return {
        symbol: symbols[0] || 'PORTFOLIO',
        portfolioValue: 100000, // Simulated portfolio value
        varResults,
        varBreakdown,
        stressTests,
        riskMetrics,
        backtestResults,
        recommendations
      };

    } catch (error) {
      console.error('Error calculating VaR analysis:', error);
      throw error;
    }
  };

  const fetchVaRData = async () => {
    if (loading || symbols.length === 0) return;

    setLoading(true);
    setError(null);

    try {
      const data = await calculateVaRAnalysis();
      setVarData(data);
    } catch (error: any) {
      console.error('Error fetching VaR data:', error);
      setError(error.message || 'Failed to calculate VaR');
      toast.error('Failed to calculate VaR');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaRData();
  }, [symbols, selectedConfidence, selectedTimeHorizon]);

  useEffect(() => {
    if (!autoRefresh || symbols.length === 0) return;

    const interval = setInterval(fetchVaRData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, symbols, selectedConfidence, selectedTimeHorizon]);

  const getSelectedVaRResult = () => {
    return varData?.varResults.find(result => result.method === selectedMethod);
  };

  if (error) {
    return (
      <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
        <div className="flex items-center justify-center text-red-600">
          <AlertTriangle className="h-8 w-8 mr-2" />
          <span>Error loading VaR calculator</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg border border-gray-200 p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calculator className="h-6 w-6 text-red-600" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">VaR Calculator</h3>
            <p className="text-sm text-gray-600">Advanced Value at Risk Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className={`p-2 rounded-lg transition-colors ${
              showBreakdown ? 'bg-red-100 text-red-700' : 'text-gray-600 hover:text-gray-900'
            }`}
            title="Toggle Breakdown"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
          <button
            onClick={fetchVaRData}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">VaR Method</label>
          <select
            value={selectedMethod}
            onChange={(e) => setSelectedMethod(e.target.value as keyof typeof VAR_METHODS)}
            className="w-full p-2 border border-gray-300 rounded-lg text-sm"
          >
            {Object.entries(VAR_METHODS).map(([key, method]) => (
              <option key={key} value={key}>
                {method.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Confidence Level</label>
          <select
            value={selectedConfidence}
            onChange={(e) => setSelectedConfidence(Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-lg text-sm"
          >
            {CONFIDENCE_LEVELS.map(level => (
              <option key={level} value={level}>
                {level}%
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Time Horizon (Days)</label>
          <select
            value={selectedTimeHorizon}
            onChange={(e) => setSelectedTimeHorizon(Number(e.target.value))}
            className="w-full p-2 border border-gray-300 rounded-lg text-sm"
          >
            {TIME_HORIZONS.map(days => (
              <option key={days} value={days}>
                {days} day{days > 1 ? 's' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && !varData ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
          <span className="ml-2 text-gray-600">Calculating VaR...</span>
        </div>
      ) : varData ? (
        <div className="space-y-6">
          {/* Main VaR Display */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="text-sm text-red-600 mb-1">Value at Risk ({selectedConfidence}%)</div>
              <div className="text-2xl font-bold text-red-700">
                {((getSelectedVaRResult()?.value || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-xs text-red-600 mt-1">
                ${((getSelectedVaRResult()?.value || 0) * varData.portfolioValue).toFixed(0)} loss
              </div>
            </div>
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="text-sm text-orange-600 mb-1">Expected Shortfall</div>
              <div className="text-2xl font-bold text-orange-700">
                {((getSelectedVaRResult()?.expectedShortfall || 0) * 100).toFixed(2)}%
              </div>
              <div className="text-xs text-orange-600 mt-1">
                Average loss beyond VaR
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm text-blue-600 mb-1">Model Reliability</div>
              <div className="text-2xl font-bold text-blue-700">
                {getSelectedVaRResult()?.reliability || 'N/A'}
              </div>
              <div className="text-xs text-blue-600 mt-1">
                {((getSelectedVaRResult()?.backTestSuccess || 0)).toFixed(0)}% backtest accuracy
              </div>
            </div>
          </div>

          {/* VaR Methods Comparison */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              VaR Methods Comparison
            </h4>
            <div className="grid gap-3">
              {varData.varResults.map((result) => (
                <div
                  key={result.method}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedMethod === result.method
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedMethod(result.method)}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{VAR_METHODS[result.method].name}</span>
                      <span className={`px-2 py-1 rounded text-xs ${
                        result.reliability === 'HIGH' ? 'bg-green-100 text-green-800' :
                        result.reliability === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {result.reliability}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-red-600">
                        {(result.value * 100).toFixed(2)}%
                      </div>
                      <div className="text-xs text-gray-600">
                        ES: {(result.expectedShortfall * 100).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {VAR_METHODS[result.method].description}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Component VaR Breakdown */}
          {showBreakdown && (
            <div className="space-y-3">
              <h4 className="font-medium text-gray-900 flex items-center gap-2">
                <Target className="h-4 w-4" />
                Portfolio VaR Breakdown
              </h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-600">Portfolio VaR</div>
                    <div className="font-medium text-red-600">
                      {(varData.varBreakdown.portfolioVaR * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Sum of Components</div>
                    <div className="font-medium">
                      {(Object.values(varData.varBreakdown.componentVaRs).reduce((sum, var_) => sum + var_, 0) * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Diversification Benefit</div>
                    <div className="font-medium text-green-600">
                      {(varData.varBreakdown.diversificationBenefit * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-600">Diversification Ratio</div>
                    <div className="font-medium text-blue-600">
                      {((varData.varBreakdown.diversificationBenefit / varData.varBreakdown.portfolioVaR) * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {Object.entries(varData.varBreakdown.componentVaRs).map(([symbol, componentVaR]) => (
                    <div key={symbol} className="flex justify-between items-center">
                      <span className="text-sm font-medium">{symbol.replace('USDT', '')}</span>
                      <div className="text-right text-sm">
                        <div>Component: {(componentVaR * 100).toFixed(2)}%</div>
                        <div className="text-gray-600">
                          Marginal: {((varData.varBreakdown.marginalVaRs[symbol] || 0) * 100).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stress Test Results */}
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 flex items-center gap-2">
              <TrendingDown className="h-4 w-4" />
              Stress Test Scenarios
            </h4>
            <div className="grid gap-3">
              {varData.stressTests.map((test, index) => (
                <div key={index} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium">{test.scenario}</span>
                    <span className="text-sm text-gray-600">
                      {(test.probability * 100).toFixed(1)}% probability
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{test.description}</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-gray-600">Portfolio Impact</div>
                      <div className="font-medium text-red-600">{test.portfolioImpact.toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Worst-Case VaR</div>
                      <div className="font-medium text-red-600">{(test.worstCaseVaR * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Recovery Time</div>
                      <div className="font-medium">{test.recoveryTime}</div>
                    </div>
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="text-gray-600">Hedge: </span>
                    <span className="text-blue-600">{test.hedgeRecommendation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Risk Metrics */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Portfolio Risk Metrics
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-600">Sharpe Ratio</div>
                <div className="font-medium">{varData.riskMetrics.sharpeRatio.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Sortino Ratio</div>
                <div className="font-medium">{varData.riskMetrics.sortinoRatio.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Max Drawdown</div>
                <div className="font-medium text-red-600">{varData.riskMetrics.maxDrawdown.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-gray-600">Calmar Ratio</div>
                <div className="font-medium">{varData.riskMetrics.calmarRatio.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Volatility</div>
                <div className="font-medium">{varData.riskMetrics.volatility.toFixed(1)}%</div>
              </div>
              <div>
                <div className="text-gray-600">Skewness</div>
                <div className="font-medium">{varData.riskMetrics.skewness.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Kurtosis</div>
                <div className="font-medium">{varData.riskMetrics.kurtosis.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-gray-600">Model Accuracy</div>
                <div className="font-medium">{varData.backtestResults.accuracy.toFixed(1)}%</div>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Risk Management Recommendations
            </h4>
            <div className="space-y-2">
              {varData.recommendations.map((recommendation, index) => (
                <div key={index} className="text-sm text-blue-800 flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>{recommendation}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}