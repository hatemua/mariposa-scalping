/**
 * MARIPOSA V6 PRO - Strategic Analysis Service
 *
 * Orchestrates the 30-minute strategic analysis cycle:
 * 1. Fetches current market data from Binance
 * 2. Runs existing experts for level detection (Fib, S/R, Liquidity)
 * 3. Determines market bias from HTF analysis
 * 4. Calls Setup Architect to create trade setups
 * 5. Adds valid setups to the queue
 */

import { binanceService } from '../binanceService';
import { normalizeKlines, NormalizedKline, getCurrentPrice } from './utils/normalizeKlines';

// Use NormalizedKline type from utils
type Kline = NormalizedKline;
import { llmPatternDetectionService } from '../llmPatternDetectionService';
import { setupArchitectExpert } from './setupArchitectExpert';
import { setupQueueService } from './setupQueueService';
import { weexAiLogService } from '../weex/weexAiLogService';
import {
  TradeSetup,
  V6_SETUP_CONFIG,
  createExpiryDate,
} from '../../types/v6';
import {
  StrategicAnalysisResult,
  MarketBias,
  FibonacciLevelOutput,
  OrderBlockOutput,
  LiquidityZoneOutput,
  LevelWithZone,
  V6_ANALYSIS_CONFIG,
} from '../../types/v6';

// ============================================================================
// TYPES
// ============================================================================

interface PatternAnalysisInput {
  klines: Kline[];
  indicators: any;
  currentPrice: number;
  timeframe: string;
}

// ============================================================================
// STRATEGIC ANALYSIS SERVICE
// ============================================================================

class StrategicAnalysisService {
  private isRunning: boolean = false;
  private lastAnalysisTime: number = 0;
  private analysisInterval: NodeJS.Timeout | null = null;
  private cycleCount: number = 0;
  private totalSetupsCreated: number = 0;
  private totalSetupsExecuted: number = 0;
  private errors: string[] = [];

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /**
   * Start the strategic analysis cycle (runs every 30 minutes)
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('[V6-ANALYSIS] Already running');
      return;
    }

    console.log('[V6-ANALYSIS] Starting strategic analysis service...');
    console.log(`[V6-ANALYSIS] Interval: ${V6_ANALYSIS_CONFIG.ANALYSIS_INTERVAL_MINUTES} minutes`);

    // Initialize the setup queue
    await setupQueueService.initialize();

    this.isRunning = true;

    // Run immediately on start
    await this.runAnalysisCycle();

    // Then schedule recurring runs
    const intervalMs = V6_ANALYSIS_CONFIG.ANALYSIS_INTERVAL_MINUTES * 60 * 1000;
    this.analysisInterval = setInterval(async () => {
      await this.runAnalysisCycle();
    }, intervalMs);

    console.log('[V6-ANALYSIS] Service started successfully');
  }

  /**
   * Stop the strategic analysis service
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    console.log('[V6-ANALYSIS] Stopping strategic analysis service...');

    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }

    this.isRunning = false;
    console.log('[V6-ANALYSIS] Service stopped');
  }

  /**
   * Force an immediate analysis cycle (for testing)
   */
  async forceAnalysis(): Promise<StrategicAnalysisResult> {
    return await this.runAnalysisCycle();
  }

  // ============================================================================
  // MAIN ANALYSIS CYCLE
  // ============================================================================

  /**
   * Run a complete strategic analysis cycle
   */
  private async runAnalysisCycle(): Promise<StrategicAnalysisResult> {
    const startTime = Date.now();
    this.cycleCount++;

    console.log('');
    console.log('==================================================');
    console.log(`[V6-ANALYSIS] Starting 30-min analysis cycle #${this.cycleCount}`);
    console.log('==================================================');

    const result: StrategicAnalysisResult = {
      timestamp: new Date(),
      currentPrice: 0,
      symbol: 'BTCUSDT',
      marketBias: {
        direction: 'NEUTRAL',
        strength: 0,
        htf4H: 'NEUTRAL',
        htf1H: 'NEUTRAL',
        preferredDirection: 'BOTH',
        avoidDirection: 'NONE',
        reasoning: '',
      },
      fibonacciLevels: [],
      orderBlocks: [],
      liquidityZones: [],
      supportResistanceLevels: [],
      generatedSetups: [],
      setupsAddedToQueue: 0,
      setupsRejected: 0,
      rejectionReasons: [],
      analysisVersion: 'V6-PRO',
      llmCallCount: 0,
      analysisTimeMs: 0,
      errors: [],
    };

    try {
      // Clean up expired setups first
      await setupQueueService.cleanupExpiredSetups();

      // Check if we can add more setups
      const availableSlots = setupQueueService.getAvailableSlots();
      if (availableSlots === 0) {
        console.log('[V6-ANALYSIS] Queue is full, skipping analysis');
        result.errors.push('Queue full - no available slots');
        result.analysisTimeMs = Date.now() - startTime;
        return result;
      }

      console.log(`[V6-ANALYSIS] ${availableSlots} setup slots available`);

      // Step 1: Fetch market data
      console.log('[V6-ANALYSIS] Fetching market data...');
      const marketData = await this.fetchMarketData();
      result.currentPrice = marketData.currentPrice;

      // Step 2: Get market bias from HTF analysis
      console.log('[V6-ANALYSIS] Analyzing market bias...');
      result.marketBias = await this.analyzeMarketBias(marketData);
      console.log(`[V6-ANALYSIS] Market Bias: ${result.marketBias.direction} (${result.marketBias.strength}%)`);
      console.log(`[V6-ANALYSIS] Preferred: ${result.marketBias.preferredDirection}, Avoid: ${result.marketBias.avoidDirection}`);

      // Step 3: Run V6 expert analysis in parallel
      console.log('[V6-ANALYSIS] Running expert analysis...');
      const [fibResult, srResult, liqResult] = await Promise.all([
        this.getFibonacciLevels(marketData),
        this.getSupportResistanceLevels(marketData),
        this.getLiquidityZones(marketData),
      ]);

      result.fibonacciLevels = fibResult.levels;
      result.orderBlocks = srResult.orderBlocks;
      result.liquidityZones = liqResult;
      result.supportResistanceLevels = srResult.levels;
      result.llmCallCount += 1; // S/R uses LLM

      console.log(`[V6-ANALYSIS] Fib levels: ${result.fibonacciLevels.length}`);
      console.log(`[V6-ANALYSIS] Order blocks: ${result.orderBlocks.length}`);
      console.log(`[V6-ANALYSIS] Liquidity zones: ${result.liquidityZones.length}`);
      console.log(`[V6-ANALYSIS] S/R levels: ${result.supportResistanceLevels.length}`);

      // DEBUG: Log detailed expert outputs with defensive checks
      console.log('[V6-DEBUG] ============ EXPERT OUTPUTS ============');
      console.log('[V6-DEBUG] FIB EXPERT:');
      const swingHighStr = typeof fibResult.swingHigh === 'number' ? `$${fibResult.swingHigh.toFixed(2)}` : 'N/A';
      const swingLowStr = typeof fibResult.swingLow === 'number' ? `$${fibResult.swingLow.toFixed(2)}` : 'N/A';
      console.log(`[V6-DEBUG]   Swing High: ${swingHighStr} | Swing Low: ${swingLowStr}`);
      console.log(`[V6-DEBUG]   Trend: ${fibResult.trendDirection || 'N/A'}`);
      if (fibResult.goldenPocket && typeof fibResult.goldenPocket.low === 'number' && typeof fibResult.goldenPocket.high === 'number') {
        console.log(`[V6-DEBUG]   Golden Pocket: $${fibResult.goldenPocket.low.toFixed(0)} - $${fibResult.goldenPocket.high.toFixed(0)}`);
      }
      for (const level of (fibResult.levels || []).slice(0, 5)) {
        if (level && typeof level.price === 'number') {
          console.log(`[V6-DEBUG]   ${level.levelName}: $${level.price.toFixed(0)} (${level.strength}${level.tested ? ', TESTED' : ', FRESH'})`);
        }
      }

      console.log('[V6-DEBUG] SR EXPERT:');
      for (const level of (srResult.levels || []).slice(0, 5)) {
        if (level && typeof level.price === 'number') {
          console.log(`[V6-DEBUG]   ${level.type}: $${level.price.toFixed(0)} (${level.strength}, ${level.source})`);
        }
      }
      console.log(`[V6-DEBUG]   Order Blocks: ${(srResult.orderBlocks || []).length}`);
      for (const ob of (srResult.orderBlocks || [])) {
        if (ob && ob.zone && typeof ob.zone.low === 'number' && typeof ob.zone.high === 'number') {
          console.log(`[V6-DEBUG]     ${ob.type}: $${ob.zone.low.toFixed(0)}-$${ob.zone.high.toFixed(0)} (${ob.strength})`);
        }
      }

      console.log('[V6-DEBUG] LIQUIDITY EXPERT:');
      if (!liqResult || liqResult.length === 0) {
        console.log('[V6-DEBUG]   NO LIQUIDITY ZONES FOUND - this may prevent setup creation!');
      } else {
        for (const zone of liqResult) {
          if (zone && typeof zone.price === 'number') {
            console.log(`[V6-DEBUG]   ${zone.type}: $${zone.price.toFixed(0)} (${zone.estimatedVolume})`);
          }
        }
      }
      console.log('[V6-DEBUG] ==========================================');

      // Step 4: Get existing setups for duplicate prevention
      const existingSetups = setupQueueService.getActiveSetups();
      console.log(`[V6-ANALYSIS] Existing setups in queue: ${existingSetups.length}`);

      // Step 5: Call Setup Architect to create setups
      console.log('[V6-ANALYSIS] Calling Setup Architect...');
      const architectInput = {
        timestamp: new Date(),
        currentPrice: result.currentPrice,
        symbol: 'BTCUSDT',
        marketBias: result.marketBias,
        fibonacciAnalysis: {
          swingHigh: fibResult.swingHigh,
          swingLow: fibResult.swingLow,
          swingHighTime: fibResult.swingHighTime,
          swingLowTime: fibResult.swingLowTime,
          trendDirection: fibResult.trendDirection,
          levels: fibResult.levels,
          goldenPocket: fibResult.goldenPocket,
        },
        supportResistance: {
          levels: srResult.levels,
          orderBlocks: srResult.orderBlocks,
          supplyDemandZones: [],
          nearestSupport: srResult.nearestSupport ? {
            price: srResult.nearestSupport.price,
            zone: srResult.nearestSupport.zone,
            type: 'SUPPORT' as const,
            source: 'SR' as const,
            strength: 'MODERATE' as const,
            timeframe: '15m' as const,
            tested: true,
          } : null,
          nearestResistance: srResult.nearestResistance ? {
            price: srResult.nearestResistance.price,
            zone: srResult.nearestResistance.zone,
            type: 'RESISTANCE' as const,
            source: 'SR' as const,
            strength: 'MODERATE' as const,
            timeframe: '15m' as const,
            tested: true,
          } : null,
        },
        liquidityZones: liqResult,
        atr: marketData.atr,
        atrPercent: (marketData.atr / result.currentPrice) * 100,
        volatility: this.getVolatilityLevel(marketData.atr, result.currentPrice),
        recentHigh: marketData.recentHigh,
        recentLow: marketData.recentLow,
        priceChange24h: marketData.priceChange24h,
        // Pass existing setups for duplicate prevention
        existingSetups: existingSetups.map(s => ({
          direction: s.direction,
          entryPrice: s.entryZone.midpoint,
          stopLoss: s.stopLoss,
          takeProfit1: s.takeProfit1,
          grade: s.grade,
          ageMinutes: Math.round((Date.now() - s.createdAt.getTime()) / 60000),
        })),
      };

      const architectOutput = await setupArchitectExpert.createSetups(architectInput);

      result.llmCallCount += 1;

      // architectOutput is TradeSetup[] directly from setupArchitectExpert.createSetups()
      const createdSetups = architectOutput;

      // Log strategic analysis to WEEX AI Log API (fire-and-forget)
      const buySetups = createdSetups.filter(s => s.direction === 'BUY').length;
      const sellSetups = createdSetups.filter(s => s.direction === 'SELL').length;
      const gradeA = createdSetups.filter(s => s.grade === 'A').length;
      const gradeB = createdSetups.filter(s => s.grade === 'B').length;
      const gradeC = createdSetups.filter(s => s.grade === 'C').length;

      weexAiLogService.logStrategicAnalysis(
        {
          symbol: 'BTCUSDT',
          timeframe: '15m',
          marketBias: String(result.marketBias),
          fibLevels: (fibResult.levels || []).map((l: any) => l.price),
          srLevels: (srResult.levels || []).map((l: any) => l.price),
        },
        {
          setupsCreated: createdSetups.length,
          buySetups,
          sellSetups,
          gradeDistribution: { A: gradeA, B: gradeB, C: gradeC },
        }
      );

      // Step 5: Process setups and add to queue
      console.log(`[V6-ANALYSIS] Processing ${createdSetups.length} potential setups...`);

      for (const setup of createdSetups) {
        // Check if we can still add more
        if (!setupQueueService.canAddMoreSetups()) {
          console.log('[V6-ANALYSIS] Queue full, stopping setup processing');
          result.rejectionReasons.push('Queue full');
          break;
        }

        // Add to queue (setup already in correct format from setupArchitectExpert)
        const addedSetup = await setupQueueService.addSetup(setup);

        if (addedSetup) {
          result.generatedSetups.push(addedSetup);
          result.setupsAddedToQueue++;
          this.totalSetupsCreated++;
          console.log(`[V6-ANALYSIS] Added setup: ${addedSetup.direction} @ $${addedSetup.entryZone.midpoint.toFixed(0)} (Grade ${addedSetup.grade})`);
        } else {
          result.setupsRejected++;
          result.rejectionReasons.push(`Rejected ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(0)}`);
        }
      }

      // Step 7: DIVERSITY CHECK - Ensure we have both BUY and SELL, and at least 1 near-price setup
      const allActiveSetups = setupQueueService.getActiveSetups();
      const hasBuy = allActiveSetups.some(s => s.direction === 'BUY');
      const hasSell = allActiveSetups.some(s => s.direction === 'SELL');
      const nearPriceThreshold = result.currentPrice * 0.005; // 0.5%
      const hasNearPrice = allActiveSetups.some(s => {
        const distance = Math.abs(s.entryZone.midpoint - result.currentPrice);
        return distance < nearPriceThreshold;
      });

      console.log(`[V6-ANALYSIS] Diversity check: BUY=${hasBuy}, SELL=${hasSell}, NearPrice=${hasNearPrice}`);

      if ((!hasBuy || !hasSell || !hasNearPrice) && setupQueueService.canAddMoreSetups()) {
        console.log('[V6-ANALYSIS] Creating diversity fallback setups...');

        // Create diversity setups to fill gaps
        const diversitySetups = await setupArchitectExpert.createDiversitySetups({
          ...architectInput,
          needBuy: !hasBuy,
          needSell: !hasSell,
          needNearPrice: !hasNearPrice,
        });

        for (const setup of diversitySetups) {
          if (!setupQueueService.canAddMoreSetups()) break;

          const addedSetup = await setupQueueService.addSetup(setup);
          if (addedSetup) {
            result.generatedSetups.push(addedSetup);
            result.setupsAddedToQueue++;
            this.totalSetupsCreated++;
            console.log(`[V6-ANALYSIS] Added DIVERSITY setup: ${addedSetup.direction} @ $${addedSetup.entryZone.midpoint.toFixed(0)} (Grade ${addedSetup.grade})`);
          }
        }
      }

      // Log summary
      console.log('');
      console.log('[V6-ANALYSIS] Cycle complete:');
      console.log(`   Setups created: ${result.setupsAddedToQueue}`);
      console.log(`   Setups rejected: ${result.setupsRejected}`);
      console.log(`   LLM calls: ${result.llmCallCount}`);

    } catch (error: any) {
      console.error('[V6-ANALYSIS] Cycle error:', error.message);
      result.errors.push(error.message);
      this.errors.push(error.message);
    }

    result.analysisTimeMs = Date.now() - startTime;
    this.lastAnalysisTime = Date.now();

    console.log(`   Time: ${result.analysisTimeMs}ms`);
    console.log('==================================================');
    console.log('');

    // Log queue state
    setupQueueService.logQueueState();

    return result;
  }

  // ============================================================================
  // DATA FETCHING
  // ============================================================================

  /**
   * Fetch all required market data from Binance
   */
  private async fetchMarketData(): Promise<{
    candles15m: Kline[];
    candles1h: Kline[];
    candles4h: Kline[];
    currentPrice: number;
    atr: number;
    recentHigh: number;
    recentLow: number;
    priceChange24h: number;
  }> {
    // Fetch candles for different timeframes in parallel
    const [raw15m, raw1h, raw4h] = await Promise.all([
      binanceService.getKlines('BTCUSDT', '15m', V6_ANALYSIS_CONFIG.CANDLES_FOR_ANALYSIS),
      binanceService.getKlines('BTCUSDT', '1h', 50),
      binanceService.getKlines('BTCUSDT', '4h', 50),
    ]);

    // Normalize raw Binance data to structured objects
    const candles15m = normalizeKlines(raw15m);
    const candles1h = normalizeKlines(raw1h);
    const candles4h = normalizeKlines(raw4h);

    if (candles15m.length === 0) {
      throw new Error('No 15m candle data available from Binance');
    }

    const currentPrice = getCurrentPrice(candles15m);

    // Calculate ATR from 15m candles
    const atr = this.calculateATR(candles15m);

    // Get 24h high/low
    const last24hCandles = candles15m.slice(-96); // 96 15m candles = 24h
    const recentHigh = Math.max(...last24hCandles.map((k: Kline) => k.high));
    const recentLow = Math.min(...last24hCandles.map((k: Kline) => k.low));

    // Calculate 24h price change
    const price24hAgo = last24hCandles[0].close;
    const priceChange24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;

    return {
      candles15m,
      candles1h,
      candles4h,
      currentPrice,
      atr,
      recentHigh,
      recentLow,
      priceChange24h,
    };
  }

  /**
   * Calculate ATR (Average True Range)
   */
  private calculateATR(candles: Kline[], period: number = 14): number {
    if (candles.length < period + 1) {
      return 0;
    }

    const trValues: number[] = [];

    for (let i = 1; i < candles.length; i++) {
      const high = candles[i].high;
      const low = candles[i].low;
      const prevClose = candles[i - 1].close;

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trValues.push(tr);
    }

    // Calculate ATR as SMA of TR
    const recentTR = trValues.slice(-period);
    return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
  }

  // ============================================================================
  // MARKET BIAS ANALYSIS
  // ============================================================================

  /**
   * Analyze market bias from higher timeframes
   */
  private async analyzeMarketBias(marketData: {
    candles1h: Kline[];
    candles4h: Kline[];
    currentPrice: number;
  }): Promise<MarketBias> {
    const { candles1h, candles4h, currentPrice } = marketData;

    // Analyze 4H trend
    const trend4H = this.analyzeTrend(candles4h);

    // Analyze 1H trend
    const trend1H = this.analyzeTrend(candles1h);

    // Calculate overall bias
    let direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let strength = 50;
    let preferredDirection: 'BUY' | 'SELL' | 'BOTH' = 'BOTH';
    let avoidDirection: 'BUY' | 'SELL' | 'NONE' = 'NONE';
    let reasoning = '';

    // Aligned trends = strong bias
    if (trend4H === 'BULLISH' && trend1H === 'BULLISH') {
      direction = 'BULLISH';
      strength = 80;
      preferredDirection = 'BUY';
      avoidDirection = 'SELL';
      reasoning = '4H and 1H trends aligned bullish - strong uptrend';
    } else if (trend4H === 'BEARISH' && trend1H === 'BEARISH') {
      direction = 'BEARISH';
      strength = 80;
      preferredDirection = 'SELL';
      avoidDirection = 'BUY';
      reasoning = '4H and 1H trends aligned bearish - strong downtrend';
    }
    // 4H bullish, 1H pullback = buy opportunity
    else if (trend4H === 'BULLISH' && trend1H === 'BEARISH') {
      direction = 'BULLISH';
      strength = 60;
      preferredDirection = 'BUY';
      avoidDirection = 'NONE';
      reasoning = '4H bullish with 1H pullback - potential buy opportunity';
    }
    // 4H bearish, 1H rally = sell opportunity
    else if (trend4H === 'BEARISH' && trend1H === 'BULLISH') {
      direction = 'BEARISH';
      strength = 60;
      preferredDirection = 'SELL';
      avoidDirection = 'NONE';
      reasoning = '4H bearish with 1H rally - potential sell opportunity';
    }
    // Mixed or neutral
    else {
      direction = 'NEUTRAL';
      strength = 40;
      preferredDirection = 'BOTH';
      avoidDirection = 'NONE';
      reasoning = 'Mixed signals - be selective with setups';
    }

    return {
      direction,
      strength,
      htf4H: trend4H,
      htf1H: trend1H,
      preferredDirection,
      avoidDirection,
      reasoning,
    };
  }

  /**
   * Simple trend analysis using EMAs and structure
   */
  private analyzeTrend(candles: Kline[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
    if (candles.length < 21) return 'NEUTRAL';

    const closes = candles.map(k => k.close);
    const currentPrice = closes[closes.length - 1];

    // Calculate EMAs
    const ema9 = this.calculateEMA(closes, 9);
    const ema21 = this.calculateEMA(closes, 21);

    // Check EMA alignment
    const emaAligned = ema9 > ema21 ? 'BULLISH' : ema9 < ema21 ? 'BEARISH' : 'NEUTRAL';

    // Check price vs EMA21
    const priceVsEma = currentPrice > ema21 ? 'BULLISH' : currentPrice < ema21 ? 'BEARISH' : 'NEUTRAL';

    // Check recent structure
    const last5 = candles.slice(-5);
    const higherHighs = last5.filter((k, i) => i > 0 && k.high > last5[i - 1].high).length;
    const lowerLows = last5.filter((k, i) => i > 0 && k.low < last5[i - 1].low).length;

    const structure = higherHighs > lowerLows ? 'BULLISH' : lowerLows > higherHighs ? 'BEARISH' : 'NEUTRAL';

    // Combine signals
    const bullCount = [emaAligned, priceVsEma, structure].filter(s => s === 'BULLISH').length;
    const bearCount = [emaAligned, priceVsEma, structure].filter(s => s === 'BEARISH').length;

    if (bullCount >= 2) return 'BULLISH';
    if (bearCount >= 2) return 'BEARISH';
    return 'NEUTRAL';
  }

  /**
   * Calculate EMA
   */
  private calculateEMA(values: number[], period: number): number {
    if (values.length < period) {
      return values[values.length - 1];
    }

    const multiplier = 2 / (period + 1);
    let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

    for (let i = period; i < values.length; i++) {
      ema = (values[i] - ema) * multiplier + ema;
    }

    return ema;
  }

  // ============================================================================
  // V6 EXPERT CALLS
  // ============================================================================

  /**
   * Get Fibonacci levels using V6 method
   */
  private async getFibonacciLevels(marketData: { candles15m: Kline[]; currentPrice: number }): Promise<{
    swingHigh: number;
    swingLow: number;
    swingHighTime: number;
    swingLowTime: number;
    trendDirection: 'UP' | 'DOWN';
    levels: FibonacciLevelOutput[];
    goldenPocket: { low: number; high: number; midpoint: number } | null;
  }> {
    const indicators = await llmPatternDetectionService.calculateIndicators(marketData.candles15m);

    const input: PatternAnalysisInput = {
      klines: marketData.candles15m,
      indicators,
      currentPrice: marketData.currentPrice,
      timeframe: '15m',
    };

    const result = await llmPatternDetectionService.getFibonacciLevelsV6(input);

    // Map to expected output format
    return {
      swingHigh: result.swingHigh,
      swingLow: result.swingLow,
      swingHighTime: result.swingHighTime,
      swingLowTime: result.swingLowTime,
      trendDirection: result.trendDirection,
      levels: result.levels.map(l => ({
        level: l.level,
        levelName: l.levelName,
        price: l.price,
        zone: l.zone,
        type: l.type,
        strength: l.strength,
        tested: l.tested,
        confluenceWith: l.confluenceWith,
      })),
      goldenPocket: result.goldenPocket,
    };
  }

  /**
   * Get Support/Resistance levels and Order Blocks using V6 method
   */
  private async getSupportResistanceLevels(marketData: { candles15m: Kline[]; currentPrice: number }): Promise<{
    levels: LevelWithZone[];
    orderBlocks: OrderBlockOutput[];
    nearestSupport: { price: number; zone: { low: number; high: number; midpoint: number } } | null;
    nearestResistance: { price: number; zone: { low: number; high: number; midpoint: number } } | null;
  }> {
    const indicators = await llmPatternDetectionService.calculateIndicators(marketData.candles15m);

    const input: PatternAnalysisInput = {
      klines: marketData.candles15m,
      indicators,
      currentPrice: marketData.currentPrice,
      timeframe: '15m',
    };

    const result = await llmPatternDetectionService.getSupportResistanceLevelsV6(input);

    return {
      levels: result.levels.map(l => ({
        price: l.price,
        zone: l.zone,
        type: l.type,
        source: l.source as any,
        strength: l.strength,
        timeframe: l.timeframe as any,
        tested: l.tested,
        touches: l.touches,
        description: l.description,
      })),
      orderBlocks: result.orderBlocks.map(ob => ({
        type: ob.type,
        zone: ob.zone,
        strength: ob.strength,
        timeframe: ob.timeframe as any,
        createdAt: ob.createdAt,
        description: ob.description,
      })),
      nearestSupport: result.nearestSupport,
      nearestResistance: result.nearestResistance,
    };
  }

  /**
   * Get Liquidity Zones using V6 method
   */
  private async getLiquidityZones(marketData: { candles15m: Kline[]; currentPrice: number }): Promise<LiquidityZoneOutput[]> {
    const indicators = await llmPatternDetectionService.calculateIndicators(marketData.candles15m);

    const input: PatternAnalysisInput = {
      klines: marketData.candles15m,
      indicators,
      currentPrice: marketData.currentPrice,
      timeframe: '15m',
    };

    const result = await llmPatternDetectionService.getLiquidityZonesV6(input);

    return result.map(z => ({
      type: z.type,
      price: z.price,
      zone: z.zone,
      estimatedVolume: z.estimatedVolume,
      description: z.description,
    }));
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get volatility level based on ATR
   */
  private getVolatilityLevel(atr: number, currentPrice: number): 'LOW' | 'NORMAL' | 'HIGH' {
    const atrPercent = (atr / currentPrice) * 100;

    if (atrPercent < 0.3) return 'LOW';
    if (atrPercent > 0.8) return 'HIGH';
    return 'NORMAL';
  }

  /**
   * Get service health status
   */
  getHealth(): {
    isRunning: boolean;
    lastAnalysisTime: number;
    cycleCount: number;
    totalSetupsCreated: number;
    recentErrors: string[];
  } {
    return {
      isRunning: this.isRunning,
      lastAnalysisTime: this.lastAnalysisTime,
      cycleCount: this.cycleCount,
      totalSetupsCreated: this.totalSetupsCreated,
      recentErrors: this.errors.slice(-5),
    };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const strategicAnalysisService = new StrategicAnalysisService();
export { StrategicAnalysisService };
