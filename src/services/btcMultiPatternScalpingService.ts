import { binanceService } from './binanceService';
import {
  llmPatternDetectionService,
  LLMPatternDetectionService
} from './llmPatternDetectionService';
import { signalBroadcastService } from './signalBroadcastService';
import { v4 as uuidv4 } from 'uuid';

interface Kline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

interface TimeframeAnalysis {
  timeframe: string;
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  momentum: 'STRONG' | 'MODERATE' | 'WEAK';
  strength: number; // 0-100
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  patterns: {
    fibonacci: any;
    chart: any;
    candlestick: any;
    supportResistance: any;
  };
}

interface MultiTimeframeAnalysis {
  primary: TimeframeAnalysis; // 5m
  supporting: TimeframeAnalysis[]; // 1m, 10m, 30m
  confluenceScore: number; // 0-100, how many timeframes agree
  overallRecommendation: 'BUY' | 'SELL' | 'HOLD';
  overallConfidence: number;
}

interface BTCScalpingSignal {
  id: string;
  symbol: 'BTCUSDT';
  category: 'FIBONACCI_SCALPING';
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number; // 0-100
  timestamp: Date;

  // Entry/Exit parameters
  entryPrice: number;
  stopLossPrice: number | null;
  takeProfitPrice: number | null;
  riskRewardRatio: number;

  // Multi-timeframe analysis
  multiTimeframeAnalysis: MultiTimeframeAnalysis;

  // Pattern details from all 4 LLM specialists
  fibonacciAnalysis: any;
  chartPatternAnalysis: any;
  candlestickAnalysis: any;
  supportResistanceAnalysis: any;

  // Consensus from 4 LLMs
  llmConsensus: {
    fibonacciVote: 'BUY' | 'SELL' | 'HOLD';
    chartPatternVote: 'BUY' | 'SELL' | 'HOLD';
    candlestickVote: 'BUY' | 'SELL' | 'HOLD';
    supportResistanceVote: 'BUY' | 'SELL' | 'HOLD';
    consensusAchieved: boolean; // 3/4 agreement
    votesFor: number;
    votesAgainst: number;
    votesNeutral: number;
  };

  // Technical indicators snapshot
  technicalIndicators: any;

  // Overall reasoning
  reasoning: string;
}

interface ExitSignal {
  shouldExit: boolean;
  reason: string;
  confidence: number;
  exitType: 'FULL' | 'PARTIAL' | 'NONE';
  partialExitPercentage?: number; // If partial exit, what % to close
  llmRecommendations: {
    fibonacci: { exit: boolean; reason: string };
    chartPattern: { exit: boolean; reason: string };
    candlestick: { exit: boolean; reason: string };
    supportResistance: { exit: boolean; reason: string };
  };
}

export class BTCMultiPatternScalpingService {
  private readonly SYMBOL = 'BTCUSDT';
  private readonly PRIMARY_TIMEFRAME = '5m';
  private readonly SUPPORTING_TIMEFRAMES = ['1m', '15m', '30m']; // Fixed: 10m → 15m (Binance supported)
  private readonly CONFIDENCE_THRESHOLD = 60; // TEMPORARY: Lowered to 60% for testing (was 70%)
  private readonly CONSENSUS_THRESHOLD = 3; // Minimum 3/4 LLMs must agree

  // WebSocket integration
  private klineCache = new Map<string, Kline[]>();
  private isRunning = false;
  private lastSignalTime: number = 0;
  private readonly MIN_SIGNAL_INTERVAL = 60000; // 1 minute minimum between signals

  /**
   * Start WebSocket-based real-time signal generation
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  BTC Fibonacci Scalping Service already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting BTC Fibonacci Scalping Service with WebSocket integration...');

    try {
      // Subscribe to WebSocket kline streams for all timeframes
      const allTimeframes = [this.PRIMARY_TIMEFRAME, ...this.SUPPORTING_TIMEFRAMES];
      for (const tf of allTimeframes) {
        binanceService.subscribeToKline([this.SYMBOL], tf);
        console.log(`📡 Subscribed to ${this.SYMBOL} ${tf} kline stream`);
      }

      // Load initial historical data
      await this.loadInitialData();

      // Listen for real-time kline updates from WebSocket
      binanceService.on('kline', this.handleKlineUpdate.bind(this));
      binanceService.on('disconnected', this.handleDisconnection.bind(this));
      binanceService.on('connected', this.handleReconnection.bind(this));

      console.log('✅ BTC Fibonacci Scalping Service started successfully');
      console.log(`   Primary: ${this.PRIMARY_TIMEFRAME}, Supporting: ${this.SUPPORTING_TIMEFRAMES.join(', ')}`);
      console.log(`   Signal generation triggered on ${this.PRIMARY_TIMEFRAME} candle close`);
    } catch (error: any) {
      console.error('❌ Failed to start BTC Fibonacci Scalping Service:', error.message);
      this.isRunning = false;
      throw error;
    }
  }

  /**
   * Stop the service
   */
  stop(): void {
    if (!this.isRunning) return;

    console.log('🛑 Stopping BTC Fibonacci Scalping Service...');
    this.isRunning = false;

    // Remove event listeners
    binanceService.off('kline', this.handleKlineUpdate);
    binanceService.off('disconnected', this.handleDisconnection);
    binanceService.off('connected', this.handleReconnection);

    console.log('✅ BTC Fibonacci Scalping Service stopped');
  }

  /**
   * Load initial historical kline data for all timeframes
   */
  private async loadInitialData(): Promise<void> {
    console.log('📊 Loading initial historical kline data...');

    const allTimeframes = [this.PRIMARY_TIMEFRAME, ...this.SUPPORTING_TIMEFRAMES];
    for (const tf of allTimeframes) {
      try {
        const klines = await binanceService.getKlines(this.SYMBOL, tf, 100);
        const normalized = this.normalizeKlines(klines);
        this.klineCache.set(`${this.SYMBOL}:${tf}`, normalized);
        console.log(`   ✓ Loaded ${normalized.length} ${tf} candles`);
      } catch (error: any) {
        console.error(`   ✗ Failed to load ${tf} klines:`, error.message);
      }
    }

    console.log('✅ Initial data loaded successfully');
  }

  /**
   * Handle real-time kline updates from WebSocket
   */
  private handleKlineUpdate(klineData: any): void {
    // Only process BTCUSDT and finalized (closed) candles
    if (klineData.symbol !== this.SYMBOL) return;
    if (!klineData.isFinal) return; // Wait for candle to close

    const cacheKey = `${klineData.symbol}:${klineData.interval}`;
    const cached = this.klineCache.get(cacheKey) || [];

    // Create normalized kline object
    const newKline: Kline = {
      openTime: klineData.openTime || klineData.startTime,
      open: parseFloat(klineData.open),
      high: parseFloat(klineData.high),
      low: parseFloat(klineData.low),
      close: parseFloat(klineData.close),
      volume: parseFloat(klineData.volume),
      closeTime: klineData.closeTime || klineData.endTime
    };

    // Update cache: append new candle and keep last 100
    const updated = [...cached, newKline].slice(-100);
    this.klineCache.set(cacheKey, updated);

    console.log(`📈 ${klineData.interval} candle closed: $${newKline.close.toFixed(2)} (volume: ${newKline.volume.toFixed(2)})`);

    // Trigger signal generation when primary timeframe (5m) candle closes
    if (klineData.interval === this.PRIMARY_TIMEFRAME) {
      this.onPrimaryCandleClose().catch(error => {
        console.error('❌ Error during signal generation:', error);
      });
    }
  }

  /**
   * Triggered when primary timeframe (5m) candle closes
   * Generates and broadcasts entry signals
   */
  private async onPrimaryCandleClose(): Promise<void> {
    // Rate limiting: don't generate signals too frequently
    const now = Date.now();
    if (now - this.lastSignalTime < this.MIN_SIGNAL_INTERVAL) {
      console.log('⏭️  Skipping signal generation (too soon since last signal)');
      return;
    }

    console.log('🔍 Primary timeframe (5m) candle closed - running multi-pattern analysis...');

    try {
      const signal = await this.generateEntrySignal();

      if (!signal) {
        console.log('ℹ️  No signal generated (rejected by confidence/consensus checks)');
      } else if (signal.recommendation === 'HOLD') {
        console.log(`❌ Signal REJECTED: Recommendation is HOLD (no tradeable signal)`);
      } else {
        console.log(`🎯 Signal Generated: ${signal.recommendation}`);
        console.log(`   Confidence: ${signal.confidence.toFixed(2)}%`);
        console.log(`   Entry: $${signal.entryPrice.toFixed(2)}`);
        console.log(`   Stop Loss: $${signal.stopLossPrice?.toFixed(2) || 'None'}`);
        console.log(`   Take Profit: $${signal.takeProfitPrice?.toFixed(2) || 'None'}`);
        console.log(`   R:R = 1:${signal.riskRewardRatio.toFixed(2)}`);
        console.log(`   LLM Consensus: ${signal.llmConsensus.votesFor}/4 agree`);

        // Broadcast signal (handled by Agenda job that calls generateEntrySignal)
        this.lastSignalTime = now;
      }
    } catch (error: any) {
      console.error('❌ Error generating signal:', error.message);
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnection(): void {
    console.log('⚠️  Binance WebSocket disconnected - signals paused until reconnection');
  }

  /**
   * Handle WebSocket reconnection
   */
  private async handleReconnection(): Promise<void> {
    console.log('✅ Binance WebSocket reconnected - reloading data...');
    await this.loadInitialData();
    console.log('✅ Data reloaded successfully - signal generation resumed');
  }

  /**
   * Normalize raw Binance API kline data to standard format
   */
  private normalizeKlines(rawKlines: any[]): Kline[] {
    return rawKlines.map(k => ({
      openTime: Array.isArray(k) ? parseInt(k[0]) : k.openTime,
      open: Array.isArray(k) ? parseFloat(k[1]) : parseFloat(k.open),
      high: Array.isArray(k) ? parseFloat(k[2]) : parseFloat(k.high),
      low: Array.isArray(k) ? parseFloat(k[3]) : parseFloat(k.low),
      close: Array.isArray(k) ? parseFloat(k[4]) : parseFloat(k.close),
      volume: Array.isArray(k) ? parseFloat(k[5]) : parseFloat(k.volume),
      closeTime: Array.isArray(k) ? parseInt(k[6]) : k.closeTime
    }));
  }

  /**
   * Generate entry signal for BTC scalping
   */
  async generateEntrySignal(): Promise<BTCScalpingSignal | null> {
    try {
      console.log('🔍 Generating BTC Fibonacci scalping signal...');

      // Step 1: Fetch multi-timeframe data
      const primaryData = await this.fetchTimeframeData(this.PRIMARY_TIMEFRAME);
      const supportingData = await Promise.all(
        this.SUPPORTING_TIMEFRAMES.map(tf => this.fetchTimeframeData(tf))
      );

      // Step 2: Analyze primary timeframe (5m) with all 4 LLM specialists
      const primaryAnalysis = await this.analyzeTimeframe(
        primaryData.klines,
        primaryData.indicators,
        primaryData.currentPrice,
        this.PRIMARY_TIMEFRAME
      );

      // Step 3: Analyze supporting timeframes
      const supportingAnalyses = await Promise.all(
        this.SUPPORTING_TIMEFRAMES.map((tf, i) =>
          this.analyzeTimeframe(
            supportingData[i].klines,
            supportingData[i].indicators,
            supportingData[i].currentPrice,
            tf
          )
        )
      );

      // Step 4: Calculate multi-timeframe confluence
      const mtfAnalysis = this.calculateMultiTimeframeConfluence(
        primaryAnalysis,
        supportingAnalyses
      );

      // DEBUG: Show LLM analysis results
      console.log(`🤖 LLM Analysis Results:`);
      console.log(`   Fibonacci: ${primaryAnalysis.patterns.fibonacci.confidence.toFixed(1)}% (${primaryAnalysis.patterns.fibonacci.type}${primaryAnalysis.patterns.fibonacci.currentLevel ? ` @ ${primaryAnalysis.patterns.fibonacci.currentLevel}` : ''})`);
      console.log(`   Chart Pattern: ${primaryAnalysis.patterns.chart.confidence.toFixed(1)}% (${primaryAnalysis.patterns.chart.type} - ${primaryAnalysis.patterns.chart.direction})`);
      console.log(`   Candlestick: ${primaryAnalysis.patterns.candlestick.confidence.toFixed(1)}% (${primaryAnalysis.patterns.candlestick.strength} ${primaryAnalysis.patterns.candlestick.direction}${primaryAnalysis.patterns.candlestick.patterns.length > 0 ? `: ${primaryAnalysis.patterns.candlestick.patterns[0]}` : ''})`);
      console.log(`   S/R: ${primaryAnalysis.patterns.supportResistance.confidence.toFixed(1)}% (${primaryAnalysis.patterns.supportResistance.currentZone})`);
      console.log(`   Consensus: ${primaryAnalysis.consensus.votesFor}/${primaryAnalysis.consensus.totalVotes} → ${primaryAnalysis.consensus.recommendation} (achieved: ${primaryAnalysis.consensus.consensusAchieved})`);
      console.log(`📊 Multi-Timeframe Confluence: ${mtfAnalysis.confluenceScore.toFixed(1)}%`);
      console.log(`📊 Overall Confidence: ${mtfAnalysis.overallConfidence.toFixed(2)}% (threshold: ${this.CONFIDENCE_THRESHOLD}%)`);

      // Step 5: Check if consensus achieved
      if (!primaryAnalysis.consensus.consensusAchieved) {
        console.log(`❌ Signal REJECTED: No consensus (${primaryAnalysis.consensus.votesFor}/${primaryAnalysis.consensus.totalVotes}, need ${this.CONSENSUS_THRESHOLD})`);
        return null;
      }
      console.log(`✅ Consensus threshold met: ${primaryAnalysis.consensus.votesFor}/${primaryAnalysis.consensus.totalVotes}`);

      // Step 6: Check if confidence meets threshold
      if (mtfAnalysis.overallConfidence < this.CONFIDENCE_THRESHOLD) {
        console.log(`❌ Signal REJECTED: Confidence ${mtfAnalysis.overallConfidence.toFixed(2)}% < ${this.CONFIDENCE_THRESHOLD}%`);
        console.log(`   Primary confidence: ${primaryAnalysis.confidence.toFixed(1)}%`);
        console.log(`   Adjusted by MTF: ${mtfAnalysis.confluenceScore.toFixed(1)}%`);
        return null;
      }
      console.log(`✅ Confidence threshold met: ${mtfAnalysis.overallConfidence.toFixed(2)}%`);

      // Step 7: Calculate entry, SL, TP based on LLM analysis
      const { entryPrice, stopLoss, takeProfit, riskReward } = this.calculateEntryParameters(
        primaryData.currentPrice,
        primaryAnalysis,
        primaryData.indicators
      );

      // Step 8: Build comprehensive signal
      const signal: BTCScalpingSignal = {
        id: uuidv4(),
        symbol: this.SYMBOL,
        category: 'FIBONACCI_SCALPING',
        recommendation: mtfAnalysis.overallRecommendation,
        confidence: mtfAnalysis.overallConfidence,
        timestamp: new Date(),
        entryPrice,
        stopLossPrice: stopLoss,
        takeProfitPrice: takeProfit,
        riskRewardRatio: riskReward,
        multiTimeframeAnalysis: mtfAnalysis,
        fibonacciAnalysis: primaryAnalysis.patterns.fibonacci,
        chartPatternAnalysis: primaryAnalysis.patterns.chart,
        candlestickAnalysis: primaryAnalysis.patterns.candlestick,
        supportResistanceAnalysis: primaryAnalysis.patterns.supportResistance,
        llmConsensus: primaryAnalysis.consensus,
        technicalIndicators: primaryData.indicators,
        reasoning: this.buildComprehensiveReasoning(primaryAnalysis, mtfAnalysis)
      };

      console.log(`✅ Signal generated: ${signal.recommendation} with ${signal.confidence}% confidence`);
      console.log(`   Entry: $${entryPrice.toFixed(2)}, SL: $${stopLoss?.toFixed(2)}, TP: $${takeProfit?.toFixed(2)}`);
      console.log(`   R:R = 1:${riskReward.toFixed(2)}`);

      // Broadcast signal to all eligible agents for validation and execution
      try {
        await signalBroadcastService.broadcastSignal({
          id: signal.id,
          symbol: signal.symbol,
          category: signal.category,
          recommendation: signal.recommendation,
          confidence: signal.confidence / 100, // Convert to 0-1 scale
          reasoning: signal.reasoning,
          entryPrice: entryPrice,
          stopLoss: stopLoss || undefined,
          targetPrice: takeProfit || undefined,
          timestamp: new Date(),
          priority: Math.floor(signal.confidence) // Use confidence as priority
        });

        console.log(`📢 Signal ${signal.id} broadcasted to agents`);
      } catch (error) {
        console.error(`Failed to broadcast signal ${signal.id}:`, error);
      }

      return signal;
    } catch (error: any) {
      console.error('❌ Error generating entry signal:', error.message);
      return null;
    }
  }

  /**
   * Generate exit signal for open position
   */
  async generateExitSignal(
    entryPrice: number,
    currentPnLPercent: number,
    entrySignalData: any
  ): Promise<ExitSignal> {
    try {
      console.log('🔍 Analyzing exit conditions for open position...');

      // Fetch current market data
      const currentData = await this.fetchTimeframeData(this.PRIMARY_TIMEFRAME);

      // Re-analyze with all 4 LLM specialists to see if pattern still valid
      const currentAnalysis = await this.analyzeTimeframe(
        currentData.klines,
        currentData.indicators,
        currentData.currentPrice,
        this.PRIMARY_TIMEFRAME
      );

      // Ask each LLM if we should exit
      const fibExit = this.shouldExitBasedOnFibonacci(
        currentAnalysis.patterns.fibonacci,
        entrySignalData?.fibonacciAnalysis,
        currentPnLPercent
      );

      const chartExit = this.shouldExitBasedOnChartPattern(
        currentAnalysis.patterns.chart,
        entrySignalData?.chartPatternAnalysis,
        currentPnLPercent
      );

      const candlestickExit = this.shouldExitBasedOnCandlestick(
        currentAnalysis.patterns.candlestick,
        currentPnLPercent
      );

      const srExit = this.shouldExitBasedOnSR(
        currentAnalysis.patterns.supportResistance,
        currentData.currentPrice,
        entryPrice,
        currentPnLPercent
      );

      // Count exit recommendations
      const exitVotes = [fibExit.exit, chartExit.exit, candlestickExit.exit, srExit.exit].filter(Boolean).length;

      // Check if pattern has reversed (3/4 LLMs now say opposite direction)
      const reversalDetected = this.detectReversal(currentAnalysis, entrySignalData);

      // Partial exit logic: If at 61.8% of profit target, recommend partial exit
      const partialExitRecommended = currentPnLPercent >= 0.618 * 1.5 && currentPnLPercent < 1.5;

      let shouldExit = false;
      let exitType: 'FULL' | 'PARTIAL' | 'NONE' = 'NONE';
      let reason = '';

      if (reversalDetected) {
        shouldExit = true;
        exitType = 'FULL';
        reason = 'Pattern reversal detected by LLMs';
      } else if (exitVotes >= 3) {
        shouldExit = true;
        exitType = 'FULL';
        reason = `${exitVotes}/4 LLMs recommend exit`;
      } else if (partialExitRecommended && exitVotes >= 2) {
        shouldExit = true;
        exitType = 'PARTIAL';
        reason = 'Reached 61.8% of profit target, partial exit recommended';
      }

      return {
        shouldExit,
        reason,
        confidence: (exitVotes / 4) * 100,
        exitType,
        partialExitPercentage: exitType === 'PARTIAL' ? 50 : undefined,
        llmRecommendations: {
          fibonacci: fibExit,
          chartPattern: chartExit,
          candlestick: candlestickExit,
          supportResistance: srExit
        }
      };
    } catch (error: any) {
      console.error('❌ Error generating exit signal:', error.message);
      return {
        shouldExit: false,
        reason: 'Analysis error',
        confidence: 0,
        exitType: 'NONE',
        llmRecommendations: {
          fibonacci: { exit: false, reason: 'Error' },
          chartPattern: { exit: false, reason: 'Error' },
          candlestick: { exit: false, reason: 'Error' },
          supportResistance: { exit: false, reason: 'Error' }
        }
      };
    }
  }

  /**
   * Fetch klines and calculate indicators for a timeframe
   * Uses WebSocket cache first, falls back to REST API if cache unavailable
   */
  private async fetchTimeframeData(timeframe: string) {
    const cacheKey = `${this.SYMBOL}:${timeframe}`;
    const cachedKlines = this.klineCache.get(cacheKey);

    // Use cache if available and sufficient (at least 50 candles)
    if (cachedKlines && cachedKlines.length >= 50) {
      const indicators = llmPatternDetectionService.calculateIndicators(cachedKlines);
      const currentPrice = cachedKlines[cachedKlines.length - 1].close;
      return { klines: cachedKlines, indicators, currentPrice };
    }

    // Fallback to REST API if cache miss or insufficient data
    console.log(`⚠️  Cache miss for ${timeframe}, fetching from Binance API...`);
    const klines = await binanceService.getKlines(this.SYMBOL, timeframe, 100);
    const normalized = this.normalizeKlines(klines);

    // Update cache
    this.klineCache.set(cacheKey, normalized);

    const indicators = llmPatternDetectionService.calculateIndicators(normalized);
    const currentPrice = normalized[normalized.length - 1].close;
    return { klines: normalized, indicators, currentPrice };
  }

  /**
   * Analyze a single timeframe with all 4 LLM specialists
   */
  private async analyzeTimeframe(
    klines: Kline[],
    indicators: any,
    currentPrice: number,
    timeframe: string
  ): Promise<any> {
    const input = { klines, indicators, currentPrice, timeframe };

    // Run all 4 LLM specialists in parallel
    const [fibonacci, chart, candlestick, supportResistance] = await Promise.all([
      llmPatternDetectionService.analyzeFibonacciPatterns(input),
      llmPatternDetectionService.analyzeChartPatterns(input),
      llmPatternDetectionService.analyzeCandlestickPatterns(input),
      llmPatternDetectionService.analyzeSupportResistance(input)
    ]);

    // Extract votes from LLM recommendations (fallback to reasoning parsing if not available)
    const fibVote = fibonacci.recommendation || this.extractVoteFromReasoning(fibonacci.reasoning);
    const chartVote = chart.recommendation || this.extractVoteFromReasoning(chart.reasoning);
    const candlestickVote = candlestick.recommendation || this.extractVoteFromReasoning(candlestick.reasoning);
    const srVote = supportResistance.recommendation || this.extractVoteFromReasoning(supportResistance.reasoning);

    // Calculate consensus
    const votes = [fibVote, chartVote, candlestickVote, srVote];
    const buyVotes = votes.filter(v => v === 'BUY').length;
    const sellVotes = votes.filter(v => v === 'SELL').length;
    const holdVotes = votes.filter(v => v === 'HOLD').length;

    const consensusAchieved = Math.max(buyVotes, sellVotes, holdVotes) >= this.CONSENSUS_THRESHOLD;
    const overallVote = buyVotes >= this.CONSENSUS_THRESHOLD ? 'BUY'
      : sellVotes >= this.CONSENSUS_THRESHOLD ? 'SELL'
      : 'HOLD';

    // Calculate overall confidence (weighted average)
    const avgConfidence = (
      fibonacci.confidence * 0.30 +
      chart.confidence * 0.30 +
      candlestick.confidence * 0.20 +
      supportResistance.confidence * 0.20
    );

    // Determine trend and momentum
    const trend = indicators.ema20 > indicators.ema50 ? 'BULLISH'
      : indicators.ema20 < indicators.ema50 ? 'BEARISH'
      : 'NEUTRAL';

    const momentum = indicators.adx > 25 ? 'STRONG'
      : indicators.adx > 15 ? 'MODERATE'
      : 'WEAK';

    return {
      timeframe,
      trend,
      momentum,
      strength: indicators.adx,
      recommendation: overallVote,
      confidence: avgConfidence,
      patterns: {
        fibonacci,
        chart,
        candlestick,
        supportResistance
      },
      consensus: {
        fibonacciVote: fibVote,
        chartPatternVote: chartVote,
        candlestickVote: candlestickVote,
        supportResistanceVote: srVote,
        consensusAchieved,
        recommendation: overallVote,
        totalVotes: 4,
        votesFor: overallVote === 'BUY' ? buyVotes : overallVote === 'SELL' ? sellVotes : holdVotes,
        votesAgainst: overallVote === 'BUY' ? sellVotes : overallVote === 'SELL' ? buyVotes : buyVotes + sellVotes,
        votesNeutral: holdVotes
      }
    };
  }

  /**
   * Calculate multi-timeframe confluence
   */
  private calculateMultiTimeframeConfluence(
    primary: any,
    supporting: any[]
  ): MultiTimeframeAnalysis {
    const allTimeframes = [primary, ...supporting];

    // Count how many timeframes agree with primary
    const agreement = allTimeframes.filter(
      tf => tf.recommendation === primary.recommendation
    ).length;

    const confluenceScore = (agreement / allTimeframes.length) * 100;

    // Overall confidence is primary confidence adjusted by confluence
    const overallConfidence = primary.confidence * (confluenceScore / 100);

    return {
      primary,
      supporting,
      confluenceScore,
      overallRecommendation: primary.recommendation,
      overallConfidence
    };
  }

  /**
   * Calculate entry parameters based on LLM analysis
   */
  private calculateEntryParameters(
    currentPrice: number,
    analysis: any,
    indicators: any
  ) {
    const { fibonacci, supportResistance } = analysis.patterns;

    // Entry: Current price (market entry)
    const entryPrice = currentPrice;

    // Stop Loss: Use Fibonacci level or S/R level, whichever is closer
    let stopLoss: number | null = null;
    if (analysis.recommendation === 'BUY') {
      // For BUY: SL below support (with null-safety)
      const fibSupport = fibonacci.entryZone?.min || currentPrice * 0.985;
      const srSupport = supportResistance.nearestSupport || currentPrice * 0.98;
      const atrStop = currentPrice - ((indicators.atr || currentPrice * 0.01) * 1.5);
      stopLoss = Math.min(fibSupport, srSupport, atrStop);
    } else if (analysis.recommendation === 'SELL') {
      // For SELL: SL above resistance (with null-safety)
      const fibResistance = fibonacci.entryZone?.max || currentPrice * 1.015;
      const srResistance = supportResistance.nearestResistance || currentPrice * 1.02;
      const atrStop = currentPrice + ((indicators.atr || currentPrice * 0.01) * 1.5);
      stopLoss = Math.max(fibResistance, srResistance, atrStop);
    }

    // Take Profit: Use Fibonacci extension or chart pattern target (with null-safety)
    let takeProfit: number | null = null;
    if (analysis.recommendation === 'BUY') {
      takeProfit = fibonacci.targetZone?.max
        || analysis.patterns.chart?.breakoutTarget
        || currentPrice * 1.015;
    } else if (analysis.recommendation === 'SELL') {
      takeProfit = fibonacci.targetZone?.min
        || analysis.patterns.chart?.breakoutTarget
        || currentPrice * 0.985;
    }

    // Calculate risk:reward ratio
    const risk = stopLoss ? Math.abs(entryPrice - stopLoss) : 0;
    const reward = takeProfit ? Math.abs(takeProfit - entryPrice) : 0;
    const riskReward = risk > 0 ? reward / risk : 0;

    return {
      entryPrice,
      stopLoss,
      takeProfit,
      riskReward
    };
  }

  /**
   * Build comprehensive reasoning from all LLM analysis
   */
  private buildComprehensiveReasoning(analysis: any, mtfAnalysis: MultiTimeframeAnalysis): string {
    const parts: string[] = [];

    parts.push(`**Multi-Timeframe Consensus (${mtfAnalysis.confluenceScore.toFixed(0)}% agreement)**`);
    parts.push(`Primary ${analysis.timeframe}: ${analysis.recommendation} (${analysis.confidence.toFixed(0)}% confidence)`);

    parts.push(`\n**Pattern Analysis:**`);
    parts.push(`• Fibonacci: ${analysis.patterns.fibonacci.reasoning}`);
    parts.push(`• Chart Pattern: ${analysis.patterns.chart.reasoning}`);
    parts.push(`• Candlestick: ${analysis.patterns.candlestick.reasoning}`);
    parts.push(`• S/R: ${analysis.patterns.supportResistance.reasoning}`);

    parts.push(`\n**LLM Votes:** ${analysis.consensus.votesFor}/4 agree, ${analysis.consensus.votesAgainst} disagree, ${analysis.consensus.votesNeutral} neutral`);

    return parts.join('\n');
  }

  /**
   * Extract vote from LLM reasoning (parse their recommendation)
   */
  private extractVoteFromReasoning(reasoning: string): 'BUY' | 'SELL' | 'HOLD' {
    const upper = reasoning.toUpperCase();
    if (upper.includes('BUY') || upper.includes('BULLISH')) return 'BUY';
    if (upper.includes('SELL') || upper.includes('BEARISH')) return 'SELL';
    return 'HOLD';
  }

  /**
   * Exit logic: Fibonacci analysis
   */
  private shouldExitBasedOnFibonacci(current: any, entry: any, pnl: number): { exit: boolean; reason: string } {
    if (current.currentLevel !== entry?.currentLevel) {
      return { exit: true, reason: 'Price moved away from Fibonacci entry level' };
    }
    return { exit: false, reason: 'Fibonacci pattern still valid' };
  }

  /**
   * Exit logic: Chart pattern analysis
   */
  private shouldExitBasedOnChartPattern(current: any, entry: any, pnl: number): { exit: boolean; reason: string } {
    if (current.type !== 'NONE' && current.direction !== entry?.direction) {
      return { exit: true, reason: `Chart pattern changed: ${current.type}` };
    }
    if (current.invalidationLevel && entry?.invalidationLevel) {
      return { exit: true, reason: 'Chart pattern invalidated' };
    }
    return { exit: false, reason: 'Chart pattern still valid' };
  }

  /**
   * Exit logic: Candlestick analysis
   */
  private shouldExitBasedOnCandlestick(current: any, pnl: number): { exit: boolean; reason: string } {
    if (current.strength === 'STRONG' && current.direction === 'BEARISH' && pnl > 0) {
      return { exit: true, reason: 'Strong bearish candlestick reversal detected' };
    }
    return { exit: false, reason: 'No reversal candlestick pattern' };
  }

  /**
   * Exit logic: Support/Resistance analysis
   */
  private shouldExitBasedOnSR(current: any, price: number, entry: number, pnl: number): { exit: boolean; reason: string } {
    // If price broke key support (for long) or resistance (for short)
    if (entry < price && price < current.nearestSupport) {
      return { exit: true, reason: 'Price broke below support' };
    }
    if (entry > price && price > current.nearestResistance) {
      return { exit: true, reason: 'Price broke above resistance' };
    }
    return { exit: false, reason: 'S/R levels holding' };
  }

  /**
   * Detect if pattern has reversed
   */
  private detectReversal(current: any, entry: any): boolean {
    if (!entry) return false;

    const entryVote = entry.llmConsensus?.fibonacciVote || entry.recommendation;
    const currentVote = current.recommendation;

    // Reversal: Entry was BUY, now 3/4 say SELL (or vice versa)
    if (entryVote === 'BUY' && currentVote === 'SELL' && current.consensus.votesFor >= 3) {
      return true;
    }
    if (entryVote === 'SELL' && currentVote === 'BUY' && current.consensus.votesFor >= 3) {
      return true;
    }

    return false;
  }
}

export const btcMultiPatternScalpingService = new BTCMultiPatternScalpingService();
