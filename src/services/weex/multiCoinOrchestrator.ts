/**
 * MARIPOSA WEEX V6 - Multi-Coin Orchestrator
 *
 * Orchestrates trading across multiple coins (BTC, ETH, SOL, DOGE).
 * - Max 1 position per coin
 * - Max 3 total positions
 * - Runs analysis sequentially for each coin without open position
 */

import { EventEmitter } from 'events';
import { binanceService } from '../binanceService';
import { weexService } from '../weexService';
import { weexV6Executor } from './weexV6Executor';
import { weexPositionMonitor } from './weexPositionMonitor';
import { WeexPosition } from '../../models/WeexPosition';
import {
  TRADING_PAIRS,
  TradingPairConfig,
  MAX_POSITIONS_PER_COIN,
  MAX_TOTAL_POSITIONS,
  getTradingPairConfig,
  WEEX_V6_CONFIG,
} from '../../config/environment';
import { TradeSetup } from '../../types/v6/setup.types';
import { mtfExpertService } from '../v6/mtfExpertService';
import { momentumExpertService } from '../v6/momentumExpertService';

// ============================================================================
// TYPES
// ============================================================================

interface CoinPositionState {
  symbol: string;
  hasPosition: boolean;
  positionId?: string;
  direction?: 'BUY' | 'SELL';
  entryPrice?: number;
  pnl?: number;
}

interface MultiCoinHealth {
  isRunning: boolean;
  totalOpenPositions: number;
  positionsPerCoin: Record<string, number>;
  lastCheckTime: Date | null;
  cycleCount: number;
  errors: string[];
}

// ============================================================================
// QUALITY FILTER CONFIGURATION - STRICT FOR HIGH WIN RATE
// ============================================================================

const QUALITY_FILTER_CONFIG = {
  // Profit prediction filter - lowered since TP is smaller
  MIN_PROFIT_THRESHOLD_USD: 20,  // Lowered from 30 since TP is smaller
  LEVERAGE: WEEX_V6_CONFIG.PROFIT_PREDICTION?.LEVERAGE || 20,

  // MTF confluence filter - LOWERED for scalping mode (requires H4 + one other TF)
  MIN_MTF_CONFLUENCE_PCT: 50,  // LOWERED: H4+M15=60% or H4+H1=70% will PASS, H4 only=40% blocks

  // Momentum filter - don't trade against exhaustion
  BLOCK_ON_EXHAUSTION: true,

  // Entry quality filter - RAISED for higher win rate
  MIN_ENTRY_QUALITY: 'GOOD' as const,  // RAISED from FAIR to GOOD

  // Win rate tracking - pause trading if win rate drops
  WIN_RATE_TRACKING: {
    ENABLED: true,
    WINDOW_SIZE: 20,                  // Last 20 trades
    MIN_WIN_RATE_PCT: 70,             // Pause if < 70%
    PAUSE_MINUTES_ON_LOW_WIN_RATE: 30,
  },
};

// ============================================================================
// MULTI-COIN ORCHESTRATOR CLASS
// ============================================================================

class MultiCoinOrchestrator extends EventEmitter {
  private isRunning = false;
  private analysisInterval: NodeJS.Timeout | null = null;
  private cycleCount = 0;
  private errors: string[] = [];
  private lastCheckTime: Date | null = null;

  // Track positions per coin
  private positionsPerCoin: Map<string, CoinPositionState> = new Map();

  // Prevent race condition - only one trade at a time
  private tradeLock = false;

  // Analysis interval (15 minutes by default)
  private readonly ANALYSIS_INTERVAL_MS = 15 * 60 * 1000;

  // Win rate tracking
  private tradeHistory: { symbol: string; result: 'WIN' | 'LOSS'; timestamp: Date }[] = [];
  private pausedUntil: Date | null = null;

  constructor() {
    super();
    // Initialize position tracking for all coins
    for (const pair of TRADING_PAIRS) {
      this.positionsPerCoin.set(pair.weexSymbol, {
        symbol: pair.weexSymbol,
        hasPosition: false,
      });
    }
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the multi-coin orchestrator
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[MULTI-COIN] Already running');
      return;
    }

    console.log('');
    console.log('==================================================');
    console.log('[MULTI-COIN] Starting Multi-Coin Orchestrator');
    console.log('==================================================');
    console.log(`[MULTI-COIN] Trading pairs: ${TRADING_PAIRS.map(p => p.binanceSymbol).join(', ')}`);
    console.log(`[MULTI-COIN] Max positions per coin: ${MAX_POSITIONS_PER_COIN}`);
    console.log(`[MULTI-COIN] Max total positions: ${MAX_TOTAL_POSITIONS}`);
    console.log(`[MULTI-COIN] Analysis interval: ${this.ANALYSIS_INTERVAL_MS / 60000} minutes`);
    console.log('==================================================');
    console.log('');

    this.isRunning = true;

    // Load existing positions from database
    await this.loadExistingPositions();

    // Start position monitor for all coins
    weexPositionMonitor.start();

    // Run first analysis cycle immediately
    await this.runAnalysisCycle();

    // Schedule recurring analysis
    this.analysisInterval = setInterval(async () => {
      await this.runAnalysisCycle();
    }, this.ANALYSIS_INTERVAL_MS);

    console.log('[MULTI-COIN] Orchestrator started successfully');
  }

  /**
   * Stop the orchestrator
   */
  stop(): void {
    if (!this.isRunning) return;

    console.log('[MULTI-COIN] Stopping orchestrator...');

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    weexPositionMonitor.stop();
    this.isRunning = false;

    console.log('[MULTI-COIN] Orchestrator stopped');
  }

  // ============================================================================
  // POSITION TRACKING
  // ============================================================================

  /**
   * Load existing positions from database
   */
  private async loadExistingPositions(): Promise<void> {
    try {
      const openPositions = await WeexPosition.find({ status: 'OPEN' });
      console.log(`[MULTI-COIN] Found ${openPositions.length} open positions in database`);

      for (const pos of openPositions) {
        const state = this.positionsPerCoin.get(pos.symbol);
        if (state) {
          state.hasPosition = true;
          state.positionId = pos.orderId;
          state.direction = pos.direction as 'BUY' | 'SELL';
          state.entryPrice = pos.entryPrice;
          console.log(`[MULTI-COIN] Loaded: ${pos.symbol} ${pos.direction} @ $${pos.entryPrice.toFixed(2)}`);
        }
      }

      // Also check WEEX directly for any positions not in DB
      await this.syncWithExchange();

    } catch (error: any) {
      console.error(`[MULTI-COIN] Error loading positions: ${error.message}`);
      this.addError(error.message);
    }
  }

  /**
   * Sync position state with exchange
   */
  private async syncWithExchange(): Promise<void> {
    try {
      const weexPositions = await weexService.getAllPositions();

      for (const weexPos of weexPositions) {
        const qty = parseFloat(weexPos.size || weexPos.hold_available || '0');
        if (qty > 0) {
          // Skip if recently closed (prevents re-marking closed position as open)
          if (weexPositionMonitor.isRecentlyClosed(weexPos.symbol)) {
            console.log(`[MULTI-COIN] Skipping recently closed position: ${weexPos.symbol}`);
            continue;
          }

          const state = this.positionsPerCoin.get(weexPos.symbol);
          if (state && !state.hasPosition) {
            state.hasPosition = true;
            console.log(`[MULTI-COIN] Found untracked position on exchange: ${weexPos.symbol}`);
          }
        }
      }
    } catch (error: any) {
      console.error(`[MULTI-COIN] Error syncing with exchange: ${error.message}`);
    }
  }

  /**
   * Get total open positions count
   */
  private getTotalOpenPositions(): number {
    let count = 0;
    for (const state of this.positionsPerCoin.values()) {
      if (state.hasPosition) count++;
    }
    return count;
  }

  /**
   * Check if a coin has an open position
   */
  hasOpenPosition(weexSymbol: string): boolean {
    const state = this.positionsPerCoin.get(weexSymbol);
    return state?.hasPosition || false;
  }

  /**
   * Mark position opened for a coin
   */
  markPositionOpened(weexSymbol: string, positionId: string, direction: 'BUY' | 'SELL', entryPrice: number): void {
    const state = this.positionsPerCoin.get(weexSymbol);
    if (state) {
      state.hasPosition = true;
      state.positionId = positionId;
      state.direction = direction;
      state.entryPrice = entryPrice;
      console.log(`[MULTI-COIN] Position opened: ${weexSymbol} ${direction} @ $${entryPrice.toFixed(2)}`);
    }
  }

  /**
   * Mark position closed for a coin
   */
  markPositionClosed(weexSymbol: string): void {
    const state = this.positionsPerCoin.get(weexSymbol);
    if (state) {
      state.hasPosition = false;
      state.positionId = undefined;
      state.direction = undefined;
      state.entryPrice = undefined;
      state.pnl = undefined;
      console.log(`[MULTI-COIN] Position closed: ${weexSymbol}`);
    }
  }

  // ============================================================================
  // WIN RATE TRACKING
  // ============================================================================

  /**
   * Calculate current win rate from trade history
   */
  private calculateWinRate(): number {
    if (this.tradeHistory.length === 0) return 0;
    const wins = this.tradeHistory.filter(t => t.result === 'WIN').length;
    return (wins / this.tradeHistory.length) * 100;
  }

  /**
   * Check if trading should be paused due to low win rate
   */
  private checkWinRateFilter(): { shouldTrade: boolean; reason: string; winRate: number } {
    // Check if paused
    if (this.pausedUntil && new Date() < this.pausedUntil) {
      const remainingMs = this.pausedUntil.getTime() - Date.now();
      return {
        shouldTrade: false,
        reason: `Paused for ${Math.ceil(remainingMs / 60000)} more minutes due to low win rate`,
        winRate: this.calculateWinRate()
      };
    }

    const windowSize = QUALITY_FILTER_CONFIG.WIN_RATE_TRACKING.WINDOW_SIZE;
    if (this.tradeHistory.length < 5) {
      return { shouldTrade: true, reason: 'Not enough history', winRate: 0 };
    }

    const recentTrades = this.tradeHistory.slice(-windowSize);
    const wins = recentTrades.filter(t => t.result === 'WIN').length;
    const winRate = (wins / recentTrades.length) * 100;

    if (winRate < QUALITY_FILTER_CONFIG.WIN_RATE_TRACKING.MIN_WIN_RATE_PCT) {
      this.pausedUntil = new Date(Date.now() +
        QUALITY_FILTER_CONFIG.WIN_RATE_TRACKING.PAUSE_MINUTES_ON_LOW_WIN_RATE * 60 * 1000);
      console.log(`[MULTI-COIN] WIN RATE PAUSE: ${winRate.toFixed(0)}% < ${QUALITY_FILTER_CONFIG.WIN_RATE_TRACKING.MIN_WIN_RATE_PCT}%`);
      console.log(`[MULTI-COIN] Trading paused until ${this.pausedUntil.toISOString()}`);
      return {
        shouldTrade: false,
        reason: `Win rate ${winRate.toFixed(0)}% < ${QUALITY_FILTER_CONFIG.WIN_RATE_TRACKING.MIN_WIN_RATE_PCT}%`,
        winRate
      };
    }

    return { shouldTrade: true, reason: `Win rate ${winRate.toFixed(0)}% OK`, winRate };
  }

  /**
   * Record trade result (called by position monitor when position closes)
   */
  recordTradeResult(symbol: string, result: 'WIN' | 'LOSS'): void {
    this.tradeHistory.push({ symbol, result, timestamp: new Date() });
    // Keep only last 50 trades
    if (this.tradeHistory.length > 50) {
      this.tradeHistory.shift();
    }
    const winRate = this.calculateWinRate();
    console.log(`[MULTI-COIN] Trade result recorded: ${symbol} ${result} | Win rate: ${winRate.toFixed(0)}% (${this.tradeHistory.length} trades)`);
  }

  /**
   * Get win rate stats for health check
   */
  getWinRateStats(): { winRate: number; totalTrades: number; isPaused: boolean; pausedUntil: Date | null } {
    return {
      winRate: this.calculateWinRate(),
      totalTrades: this.tradeHistory.length,
      isPaused: this.pausedUntil !== null && new Date() < this.pausedUntil,
      pausedUntil: this.pausedUntil,
    };
  }

  // ============================================================================
  // ANALYSIS CYCLE
  // ============================================================================

  /**
   * Run analysis cycle for all coins (PARALLEL)
   */
  private async runAnalysisCycle(): Promise<void> {
    this.cycleCount++;
    this.lastCheckTime = new Date();

    console.log('');
    console.log('==================================================');
    console.log(`[MULTI-COIN] Analysis Cycle #${this.cycleCount} (PARALLEL)`);
    console.log('==================================================');

    // Check total positions
    const totalPositions = this.getTotalOpenPositions();
    console.log(`[MULTI-COIN] Current positions: ${totalPositions}/${MAX_TOTAL_POSITIONS}`);

    if (totalPositions >= MAX_TOTAL_POSITIONS) {
      console.log('[MULTI-COIN] Max total positions reached, skipping analysis');
      this.logPositionStatus();
      return;
    }

    // Sync with exchange
    await this.syncWithExchange();

    // Filter to coins without positions
    const availablePairs = TRADING_PAIRS.filter(
      pair => !this.hasOpenPosition(pair.weexSymbol)
    );

    if (availablePairs.length === 0) {
      console.log('[MULTI-COIN] All coins have positions, skipping');
      this.logPositionStatus();
      return;
    }

    console.log(`[MULTI-COIN] Analyzing ${availablePairs.length} coins in PARALLEL...`);

    // Analyze all available coins in parallel (staggered by 100ms to avoid rate limits)
    const analysisPromises = availablePairs.map((pair, index) =>
      this.delayedAnalysis(pair, index * 100)
    );

    await Promise.all(analysisPromises);

    this.logPositionStatus();
    console.log('==================================================');
    console.log('');
  }

  /**
   * Run analysis with a staggered delay to avoid rate limits
   */
  private async delayedAnalysis(pair: TradingPairConfig, delayMs: number): Promise<void> {
    if (delayMs > 0) {
      await this.sleep(delayMs);
    }
    try {
      await this.analyzeAndTrade(pair);
    } catch (error: any) {
      console.error(`[MULTI-COIN] ${pair.binanceSymbol}: Analysis error: ${error.message}`);
      this.addError(`${pair.binanceSymbol}: ${error.message}`);
    }
  }

  /**
   * Analyze and potentially trade a specific coin
   */
  private async analyzeAndTrade(pair: TradingPairConfig): Promise<void> {
    // ========================================================================
    // QUALITY FILTER #0: Win Rate Check (FIRST - before any analysis)
    // ========================================================================
    if (QUALITY_FILTER_CONFIG.WIN_RATE_TRACKING.ENABLED) {
      const winRateCheck = this.checkWinRateFilter();
      if (!winRateCheck.shouldTrade) {
        console.log(`[MULTI-COIN] ${pair.binanceSymbol}: BLOCKED - ${winRateCheck.reason}`);
        return;
      }
      if (this.tradeHistory.length >= 5) {
        console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Win rate filter PASS - ${winRateCheck.reason}`);
      }
    }

    // Fetch current price
    const currentPrice = await binanceService.getTickerPrice(pair.binanceSymbol);
    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Current price $${currentPrice.toFixed(2)}`);

    // Fetch candles for analysis
    const candles15m = await binanceService.getKlines(pair.binanceSymbol, '15m', 100);
    const candles1h = await binanceService.getKlines(pair.binanceSymbol, '1h', 50);
    const candles4h = await binanceService.getKlines(pair.binanceSymbol, '4h', 50);

    if (!candles15m || candles15m.length < 50) {
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Insufficient candle data`);
      return;
    }

    // Simple trend analysis
    const trend = this.analyzeTrend(candles1h, candles4h);
    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Trend = ${trend.direction} (strength: ${trend.strength}%)`);

    // Check for entry opportunity based on simple criteria
    const entry = this.findEntryOpportunity(candles15m, currentPrice, trend, pair);

    if (!entry) {
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: No entry opportunity found`);
      return;
    }

    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Entry opportunity found!`);
    console.log(`[MULTI-COIN]   Direction: ${entry.direction}`);
    console.log(`[MULTI-COIN]   Entry: $${entry.entryPrice.toFixed(2)}`);
    console.log(`[MULTI-COIN]   SL: $${entry.stopLoss.toFixed(2)} (${entry.slPercent.toFixed(2)}%)`);
    console.log(`[MULTI-COIN]   TP: $${entry.takeProfit.toFixed(2)} (${entry.tpPercent.toFixed(2)}%)`);

    // ========================================================================
    // QUALITY FILTER #1: Profit Prediction Filter
    // ========================================================================
    const positionSizeUSD = pair.positionSize * currentPrice;
    const expectedProfitUSD = positionSizeUSD * (entry.tpPercent / 100) * QUALITY_FILTER_CONFIG.LEVERAGE;

    if (expectedProfitUSD < QUALITY_FILTER_CONFIG.MIN_PROFIT_THRESHOLD_USD) {
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: BLOCKED - Expected profit $${expectedProfitUSD.toFixed(2)} < $${QUALITY_FILTER_CONFIG.MIN_PROFIT_THRESHOLD_USD}`);
      console.log(`[MULTI-COIN]   TP ${entry.tpPercent.toFixed(2)}% at ${QUALITY_FILTER_CONFIG.LEVERAGE}x leverage on $${positionSizeUSD.toFixed(0)} position`);
      return;
    }
    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Profit filter PASS - Expected $${expectedProfitUSD.toFixed(2)} >= $${QUALITY_FILTER_CONFIG.MIN_PROFIT_THRESHOLD_USD}`);

    // ========================================================================
    // QUALITY FILTER #2: MTF Confluence Filter
    // ========================================================================
    const mtfAnalysis = await mtfExpertService.analyze(pair.binanceSymbol);

    // Check MTF confluence score
    if (mtfAnalysis.confluenceScore < QUALITY_FILTER_CONFIG.MIN_MTF_CONFLUENCE_PCT) {
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: BLOCKED - MTF confluence ${mtfAnalysis.confluenceScore}% < ${QUALITY_FILTER_CONFIG.MIN_MTF_CONFLUENCE_PCT}%`);
      console.log(`[MULTI-COIN]   H4: ${mtfAnalysis.h4.trend} | H1: ${mtfAnalysis.h1.trend} | M15: ${mtfAnalysis.m15.trend} | M5: ${mtfAnalysis.m5.trend}`);
      return;
    }

    // Check MTF direction alignment with entry
    const mtfBias = mtfAnalysis.tradingBias;
    if (mtfBias !== 'NEUTRAL') {
      const alignedDirection = mtfBias === 'BUY' ? 'BUY' : 'SELL';
      if (entry.direction !== alignedDirection) {
        console.log(`[MULTI-COIN] ${pair.binanceSymbol}: BLOCKED - MTF bias is ${mtfBias} but entry is ${entry.direction}`);
        return;
      }
    }
    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: MTF filter PASS - Confluence ${mtfAnalysis.confluenceScore}%, Bias ${mtfBias}`);

    // ========================================================================
    // QUALITY FILTER #3: Momentum/Exhaustion Filter
    // ========================================================================
    const momentumAnalysis = await momentumExpertService.analyze(pair.binanceSymbol);

    // Check for exhaustion warning that blocks this direction
    if (QUALITY_FILTER_CONFIG.BLOCK_ON_EXHAUSTION && momentumAnalysis.exhaustionWarning.isExhausted) {
      if (momentumAnalysis.exhaustionWarning.direction === entry.direction) {
        console.log(`[MULTI-COIN] ${pair.binanceSymbol}: BLOCKED - Momentum exhaustion for ${entry.direction}`);
        console.log(`[MULTI-COIN]   Reason: ${momentumAnalysis.exhaustionWarning.reason}`);
        return;
      }
    }

    // Check entry quality - require GOOD or better (stricter than before)
    const entryQuality = entry.direction === 'BUY'
      ? momentumAnalysis.entryQuality.forBuy
      : momentumAnalysis.entryQuality.forSell;

    // Quality ranking for comparison
    const qualityRank: Record<string, number> = { 'EXCELLENT': 4, 'GOOD': 3, 'FAIR': 2, 'POOR': 1 };
    const minQualityRank = qualityRank[QUALITY_FILTER_CONFIG.MIN_ENTRY_QUALITY];
    const currentQualityRank = qualityRank[entryQuality] || 1;

    if (currentQualityRank < minQualityRank) {
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: BLOCKED - Entry quality ${entryQuality} < ${QUALITY_FILTER_CONFIG.MIN_ENTRY_QUALITY}`);
      console.log(`[MULTI-COIN]   RSI: ${momentumAnalysis.rsi.value.toFixed(1)} | Overall: ${momentumAnalysis.overallMomentum}`);
      return;
    }
    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Momentum filter PASS - Quality ${entryQuality}, RSI ${momentumAnalysis.rsi.value.toFixed(1)}`);

    // ========================================================================
    // ALL FILTERS PASSED - Execute Trade
    // ========================================================================
    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: ALL QUALITY FILTERS PASSED - Executing trade`);

    // Execute the trade
    await this.executeTrade(pair, entry, currentPrice);
  }

  /**
   * Simple trend analysis
   */
  private analyzeTrend(candles1h: any[], candles4h: any[]): { direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; strength: number } {
    if (!candles1h || candles1h.length < 20 || !candles4h || candles4h.length < 20) {
      return { direction: 'NEUTRAL', strength: 50 };
    }

    // Get closes
    const closes1h = candles1h.slice(-20).map((c: any) => parseFloat(c[4] || c.close || 0));
    const closes4h = candles4h.slice(-20).map((c: any) => parseFloat(c[4] || c.close || 0));

    // Calculate EMAs
    const ema9_1h = this.calculateEMA(closes1h, 9);
    const ema21_1h = this.calculateEMA(closes1h, 21);
    const ema9_4h = this.calculateEMA(closes4h, 9);
    const ema21_4h = this.calculateEMA(closes4h, 21);

    const current1h = closes1h[closes1h.length - 1];
    const current4h = closes4h[closes4h.length - 1];

    // Score trend signals
    let bullScore = 0;
    let bearScore = 0;

    // 1H EMA alignment
    if (ema9_1h > ema21_1h) bullScore += 1;
    else if (ema9_1h < ema21_1h) bearScore += 1;

    // 4H EMA alignment
    if (ema9_4h > ema21_4h) bullScore += 2;
    else if (ema9_4h < ema21_4h) bearScore += 2;

    // Price vs 1H EMA21
    if (current1h > ema21_1h) bullScore += 1;
    else if (current1h < ema21_1h) bearScore += 1;

    // Price vs 4H EMA21
    if (current4h > ema21_4h) bullScore += 2;
    else if (current4h < ema21_4h) bearScore += 2;

    const totalScore = bullScore + bearScore;
    const strength = totalScore > 0 ? Math.round((Math.max(bullScore, bearScore) / totalScore) * 100) : 50;

    if (bullScore > bearScore + 2) return { direction: 'BULLISH', strength };
    if (bearScore > bullScore + 2) return { direction: 'BEARISH', strength };
    return { direction: 'NEUTRAL', strength: 50 };
  }

  /**
   * Calculate EMA
   */
  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1];

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * Find entry opportunity based on simple criteria
   */
  private findEntryOpportunity(
    candles: any[],
    currentPrice: number,
    trend: { direction: string; strength: number },
    pair: TradingPairConfig
  ): { direction: 'BUY' | 'SELL'; entryPrice: number; stopLoss: number; takeProfit: number; slPercent: number; tpPercent: number } | null {

    // Need clear trend for entry
    if (trend.direction === 'NEUTRAL' || trend.strength < 60) {
      return null;
    }

    const direction: 'BUY' | 'SELL' = trend.direction === 'BULLISH' ? 'BUY' : 'SELL';

    // Calculate ATR for SL/TP sizing
    const atr = this.calculateATR(candles);
    const atrPercent = (atr / currentPrice) * 100;

    // Use pair-specific min percentages, with ATR as a guide
    const slPercent = Math.max(pair.minSlPercent, atrPercent * 0.8);
    const tpPercent = Math.max(pair.minTpPercent, slPercent * 1.5); // Minimum 1.5 R:R

    let stopLoss: number;
    let takeProfit: number;

    if (direction === 'BUY') {
      stopLoss = currentPrice * (1 - slPercent / 100);
      takeProfit = currentPrice * (1 + tpPercent / 100);
    } else {
      stopLoss = currentPrice * (1 + slPercent / 100);
      takeProfit = currentPrice * (1 - tpPercent / 100);
    }

    // Round to tick size
    stopLoss = this.roundToTickSize(stopLoss, pair.tickSize);
    takeProfit = this.roundToTickSize(takeProfit, pair.tickSize);

    // Check recent price action - look for pullback in trend direction
    const last5 = candles.slice(-5);
    const last5Closes = last5.map((c: any) => parseFloat(c[4] || c.close || 0));
    const recentHigh = Math.max(...last5.map((c: any) => parseFloat(c[2] || c.high || 0)));
    const recentLow = Math.min(...last5.map((c: any) => parseFloat(c[3] || c.low || 0)));

    // For BUY: want price near recent low (pullback)
    // For SELL: want price near recent high (pullback)
    const range = recentHigh - recentLow;
    const positionInRange = range > 0 ? (currentPrice - recentLow) / range : 0.5;

    if (direction === 'BUY' && positionInRange > 0.7) {
      // Price too high for buy entry
      return null;
    }
    if (direction === 'SELL' && positionInRange < 0.3) {
      // Price too low for sell entry
      return null;
    }

    return {
      direction,
      entryPrice: currentPrice,
      stopLoss,
      takeProfit,
      slPercent,
      tpPercent,
    };
  }

  /**
   * Calculate ATR
   */
  private calculateATR(candles: any[], period: number = 14): number {
    if (candles.length < period + 1) return 0;

    const trValues: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = parseFloat(candles[i][2] || candles[i].high || 0);
      const low = parseFloat(candles[i][3] || candles[i].low || 0);
      const prevClose = parseFloat(candles[i - 1][4] || candles[i - 1].close || 0);

      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      trValues.push(tr);
    }

    const recentTR = trValues.slice(-period);
    return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
  }

  /**
   * Round price to tick size
   */
  private roundToTickSize(price: number, tickSize: number): number {
    const decimals = Math.max(0, -Math.floor(Math.log10(tickSize)));
    const factor = Math.pow(10, decimals);
    return Math.round(price * factor) / factor;
  }

  /**
   * Execute trade on WEEX
   */
  private async executeTrade(
    pair: TradingPairConfig,
    entry: { direction: 'BUY' | 'SELL'; entryPrice: number; stopLoss: number; takeProfit: number },
    currentPrice: number
  ): Promise<void> {
    // Prevent race condition - only one trade at a time
    if (this.tradeLock) {
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Trade lock active, skipping`);
      return;
    }

    // Double-check position limits
    if (this.getTotalOpenPositions() >= MAX_TOTAL_POSITIONS) {
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Max positions reached, skipping`);
      return;
    }

    this.tradeLock = true;
    console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Executing ${entry.direction} trade...`);

    try {
      // Create a TradeSetup object for the position monitor
      const setup: TradeSetup = {
        id: `multi_${pair.binanceSymbol}_${Date.now()}`,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hour expiry
        symbol: pair.binanceSymbol,
        direction: entry.direction,
        bias: 'WITH_TREND', // Multi-coin only trades with trend
        grade: 'B', // Default grade for multi-coin setups
        confidence: 70,
        entryZone: {
          low: entry.entryPrice * 0.999,
          high: entry.entryPrice * 1.001,
          midpoint: entry.entryPrice,
        },
        stopLoss: entry.stopLoss,
        takeProfit1: entry.takeProfit,
        takeProfit2: entry.takeProfit,
        riskRewardRatio: Math.abs(entry.takeProfit - entry.entryPrice) / Math.abs(entry.stopLoss - entry.entryPrice),
        reasons: [{
          source: 'EMA_CONFLUENCE',
          level: entry.entryPrice,
          description: `Multi-coin trend entry: ${entry.direction}`,
          strength: 'MODERATE',
          weight: 5,
        }],
        requiredConfirmation: {
          patterns: [],
          minStrength: 'ANY',
          volumeRequired: false,
        },
        status: 'CONFIRMED',
        confirmationAttempts: 0,
        maxConfirmationAttempts: 1,
        htfTrend: entry.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
        marketContext: `Multi-coin ${entry.direction} trade on ${pair.binanceSymbol}`,
        analysisTimestamp: new Date(),
      };

      // Execute using the WEEX executor with pair-specific size
      const sizeBTC = pair.positionSize;
      const sizeUSD = sizeBTC * currentPrice;

      // Place order directly on WEEX with preset TP/SL
      const orderResult = await weexService.placeOrder({
        symbol: pair.weexSymbol,
        side: entry.direction === 'BUY' ? 'buy' : 'sell',
        orderType: 'market',
        quantity: sizeBTC.toFixed(6),
        positionAction: 'open',
        takeProfitPrice: entry.takeProfit,
        stopLossPrice: entry.stopLoss,
      });

      if (!orderResult || !orderResult.data || !orderResult.data.orderId) {
        throw new Error('Order failed - no orderId returned');
      }

      const orderId = orderResult.data.orderId;
      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Order placed! ID: ${orderId}`);

      // Mark position as opened
      this.markPositionOpened(pair.weexSymbol, orderId.toString(), entry.direction, entry.entryPrice);

      // Add to position monitor
      weexPositionMonitor.addPosition(setup, {
        success: true,
        orderId: orderId.toString(),
        executionPrice: entry.entryPrice,
        positionSizeBTC: sizeBTC,
        positionSizeUSD: sizeUSD,
        timestamp: new Date(),
      });

      console.log(`[MULTI-COIN] ${pair.binanceSymbol}: Trade executed successfully!`);
      console.log(`[MULTI-COIN]   Size: ${sizeBTC} ${pair.binanceSymbol.replace('USDT', '')} (~$${sizeUSD.toFixed(0)})`);

    } catch (error: any) {
      console.error(`[MULTI-COIN] ${pair.binanceSymbol}: Trade execution failed: ${error.message}`);
      this.addError(`${pair.binanceSymbol} execution: ${error.message}`);
    } finally {
      this.tradeLock = false;
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private addError(error: string): void {
    this.errors.push(`${new Date().toISOString()}: ${error}`);
    if (this.errors.length > 20) this.errors.shift();
  }

  private logPositionStatus(): void {
    console.log('');
    console.log('[MULTI-COIN] Position Status:');
    for (const [symbol, state] of this.positionsPerCoin) {
      const pair = TRADING_PAIRS.find(p => p.weexSymbol === symbol);
      const displaySymbol = pair?.binanceSymbol || symbol;
      if (state.hasPosition) {
        console.log(`  ${displaySymbol}: ${state.direction} @ $${state.entryPrice?.toFixed(2) || 'N/A'}`);
      } else {
        console.log(`  ${displaySymbol}: No position`);
      }
    }
    console.log(`  Total: ${this.getTotalOpenPositions()}/${MAX_TOTAL_POSITIONS}`);
    console.log('');
  }

  /**
   * Get health status
   */
  getHealth(): MultiCoinHealth {
    const positionsPerCoin: Record<string, number> = {};
    for (const [symbol, state] of this.positionsPerCoin) {
      positionsPerCoin[symbol] = state.hasPosition ? 1 : 0;
    }

    return {
      isRunning: this.isRunning,
      totalOpenPositions: this.getTotalOpenPositions(),
      positionsPerCoin,
      lastCheckTime: this.lastCheckTime,
      cycleCount: this.cycleCount,
      errors: [...this.errors.slice(-5)],
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const multiCoinOrchestrator = new MultiCoinOrchestrator();
export { MultiCoinOrchestrator };
