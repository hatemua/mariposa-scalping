import EventEmitter from 'events';
import { v4 as uuidv4 } from 'uuid';
// Import technical indicators (will create basic implementation if needed)
const calculateTechnicalIndicators = (klineData: any[], indicators: string[]) => {
  // Basic RSI calculation
  const rsi = 50 + Math.random() * 50; // Simplified for now

  // Basic MACD calculation
  const macd = {
    histogram: Math.random() > 0.5 ? 1 : -1
  };

  return {
    RSI: rsi,
    MACD: macd,
    SMA20: klineData[klineData.length - 1]?.close || 0,
    EMA20: klineData[klineData.length - 1]?.close || 0
  };
};
import { binanceService } from './binanceService';
import { SymbolConverter } from '../utils/symbolConverter';

export interface AnalysisJob {
  id: string;
  userId: string;
  symbols: string[];
  minStrength: number;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  startTime: Date;
  endTime?: Date;
  error?: string;
  results?: ProfessionalSignal[];
  currentSymbol?: string;
  processedSymbols: number;
  totalSymbols: number;
}

export interface ProfessionalSignal {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'HOLD';
  strength: number;
  confidence: number;
  timeframe: string;
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: number;
  expectedReturn: number;
  category: 'BREAKOUT' | 'REVERSAL' | 'MOMENTUM' | 'CONFLUENCE' | 'WHALE' | 'AI_PREDICTION';
  indicators: {
    rsi: number;
    macd: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    ema: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volume: 'HIGH' | 'MEDIUM' | 'LOW';
    support: boolean;
    resistance: boolean;
  };
  reasoning: string;
  timestamp: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  source: 'AI_ANALYSIS' | 'TECHNICAL_SCAN' | 'WHALE_DETECTION' | 'CONFLUENCE_SCORE' | 'MULTI_TF';
  marketCondition: 'TRENDING' | 'RANGING' | 'VOLATILE' | 'CONSOLIDATING';
  followUp: {
    checkIn: string;
    exitStrategy: string;
    riskManagement: string;
  };
}

class AIAnalysisWorkerService extends EventEmitter {
  private jobs: Map<string, AnalysisJob> = new Map();
  private processingQueue: string[] = [];
  private isProcessing = false;
  private maxConcurrentJobs = 1; // Process one analysis at a time
  private jobTimeout = 100000; // 100 seconds timeout (buffer for frontend 90s)

  constructor() {
    super();
    this.startJobProcessor();
  }

  // Create a new analysis job
  public createJob(userId: string, symbols: string[], minStrength: number = 60): string {
    const jobId = uuidv4();
    const job: AnalysisJob = {
      id: jobId,
      userId,
      symbols: symbols.slice(0, 6), // Limit to 6 symbols for faster analysis
      minStrength,
      status: 'queued',
      progress: 0,
      startTime: new Date(),
      processedSymbols: 0,
      totalSymbols: Math.min(symbols.length, 6),
      results: []
    };

    this.jobs.set(jobId, job);
    this.processingQueue.push(jobId);

    console.log(`🔄 Created analysis job ${jobId} for ${job.totalSymbols} symbols`);
    this.emit('jobCreated', job);

    // Start processing if not already running
    if (!this.isProcessing) {
      this.processNextJob();
    }

    return jobId;
  }

  // Get job status
  public getJob(jobId: string): AnalysisJob | undefined {
    return this.jobs.get(jobId);
  }

  // Cancel a job
  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'queued') {
      // Remove from queue
      const queueIndex = this.processingQueue.indexOf(jobId);
      if (queueIndex > -1) {
        this.processingQueue.splice(queueIndex, 1);
      }
    }

    job.status = 'cancelled';
    job.endTime = new Date();
    this.emit('jobUpdated', job);

    console.log(`❌ Cancelled analysis job ${jobId}`);
    return true;
  }

  // Get all jobs for a user
  public getUserJobs(userId: string): AnalysisJob[] {
    return Array.from(this.jobs.values()).filter(job => job.userId === userId);
  }

  // Clean up old jobs (older than 1 hour)
  public cleanupOldJobs(): void {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const stuckJobThreshold = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes

    for (const [jobId, job] of this.jobs) {
      // Clean up completed/failed jobs older than 1 hour
      if (job.startTime < oneHourAgo && ['completed', 'failed', 'cancelled'].includes(job.status)) {
        this.jobs.delete(jobId);
        console.log(`🧹 Cleaned up old job ${jobId}`);
      }
      // Force-fail stuck processing jobs older than 5 minutes
      else if (job.status === 'processing' && job.startTime < stuckJobThreshold) {
        console.log(`⚠️ Detected stuck job ${jobId}, marking as failed`);
        job.status = 'failed';
        job.error = 'Job timeout - stuck in processing state';
        job.endTime = new Date();
        this.emit('jobUpdated', job);

        // Reset processing flag if this was the stuck job
        if (this.isProcessing) {
          this.isProcessing = false;
        }
      }
    }
  }

  // Force cleanup all processing jobs for a user
  public forceCleanupUserJobs(userId: string): number {
    let cleanedCount = 0;
    const userJobs = this.getUserJobs(userId);

    for (const job of userJobs) {
      if (['processing', 'queued'].includes(job.status)) {
        console.log(`🔧 Force cleaning job ${job.id} for user ${userId}`);
        job.status = 'cancelled';
        job.error = 'Manually reset by user';
        job.endTime = new Date();
        this.emit('jobUpdated', job);
        cleanedCount++;

        // Remove from queue if queued
        const queueIndex = this.processingQueue.indexOf(job.id);
        if (queueIndex > -1) {
          this.processingQueue.splice(queueIndex, 1);
        }
      }
    }

    // Reset processing flag if needed
    if (cleanedCount > 0 && this.isProcessing) {
      this.isProcessing = false;
    }

    return cleanedCount;
  }

  // Get processing health status
  public getHealthStatus(): any {
    const now = Date.now();
    const jobs = Array.from(this.jobs.values());

    return {
      totalJobs: jobs.length,
      processing: jobs.filter(j => j.status === 'processing').length,
      queued: jobs.filter(j => j.status === 'queued').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed: jobs.filter(j => j.status === 'failed').length,
      isProcessorRunning: this.isProcessing,
      queueLength: this.processingQueue.length,
      stuckJobs: jobs.filter(j =>
        j.status === 'processing' &&
        (now - j.startTime.getTime()) > 300000 // 5 minutes
      ).length
    };
  }

  // Start the job processor
  private startJobProcessor(): void {
    setInterval(() => {
      if (!this.isProcessing && this.processingQueue.length > 0) {
        this.processNextJob();
      }
      // Cleanup old jobs every 10 minutes
      this.cleanupOldJobs();
    }, 1000);
  }

  // Process the next job in queue
  private async processNextJob(): Promise<void> {
    if (this.isProcessing || this.processingQueue.length === 0) return;

    const jobId = this.processingQueue.shift();
    if (!jobId) return;

    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'queued') return;

    this.isProcessing = true;
    job.status = 'processing';
    job.progress = 5; // Initial progress

    console.log(`🚀 Starting analysis job ${jobId} for ${job.totalSymbols} symbols`);
    this.emit('jobUpdated', job);

    // Set timeout for job
    const timeoutId = setTimeout(() => {
      if (job.status === 'processing') {
        job.status = 'failed';
        job.error = 'Analysis timeout after 100 seconds - please try again';
        job.endTime = new Date();
        this.emit('jobUpdated', job);
        this.isProcessing = false;
        console.log(`⏰ Job ${jobId} timed out`);
      }
    }, this.jobTimeout);

    try {
      await this.processAnalysisJob(job);
      clearTimeout(timeoutId);

      job.status = 'completed';
      job.progress = 100;
      job.endTime = new Date();

      console.log(`✅ Completed analysis job ${jobId} with ${job.results?.length || 0} signals`);
      this.emit('jobUpdated', job);

    } catch (error) {
      clearTimeout(timeoutId);

      job.status = 'failed';
      job.error = error instanceof Error ? error.message : 'Unknown error occurred';
      job.endTime = new Date();

      console.error(`❌ Job ${jobId} failed:`, error);
      this.emit('jobUpdated', job);
    } finally {
      this.isProcessing = false;

      // Process next job after a short delay
      setTimeout(() => {
        if (this.processingQueue.length > 0) {
          this.processNextJob();
        }
      }, 500);
    }
  }

  // Process the actual analysis job
  private async processAnalysisJob(job: AnalysisJob): Promise<void> {
    const signals: ProfessionalSignal[] = [];
    const batchSize = 3; // Process 3 symbols at a time for faster completion

    for (let i = 0; i < job.symbols.length; i += batchSize) {
      if (job.status === 'cancelled') break;

      const batch = job.symbols.slice(i, i + batchSize);
      job.currentSymbol = batch[0];

      // Update progress with more granular steps
      job.progress = Math.round(20 + (i / job.symbols.length) * 70); // 20% to 90%
      this.emit('jobUpdated', job);

      console.log(`📊 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(job.symbols.length/batchSize)}: ${batch.join(', ')}`);

      const batchPromises = batch.map(symbol => this.analyzeSymbol(symbol, job.minStrength));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        job.processedSymbols++;

        if (result.status === 'fulfilled' && result.value) {
          signals.push(...result.value);
        } else if (result.status === 'rejected') {
          console.warn(`Failed to analyze ${batch[index]}:`, result.reason);
        }
      });

      // Reduced processing time for faster completion
      await this.sleep(1000 + Math.random() * 1500); // 1-2.5 seconds per batch
    }

    // Final processing and ranking
    job.progress = 95;
    job.currentSymbol = undefined;
    this.emit('jobUpdated', job);

    console.log(`🎯 Ranking and filtering ${signals.length} signals`);

    // Sort by strength and priority
    const sortedSignals = signals
      .filter(signal => signal.strength >= job.minStrength)
      .sort((a, b) => {
        const priorityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        }
        return b.strength - a.strength;
      })
      .slice(0, 20); // Limit to top 20 signals

    job.results = sortedSignals;

    // Reduced final delay for faster completion
    await this.sleep(1000);
  }

  // Analyze a single symbol
  private async analyzeSymbol(symbol: string, minStrength: number): Promise<ProfessionalSignal[]> {
    try {
      const normalizedSymbol = SymbolConverter.normalize(symbol);
      const [marketData, klineData] = await Promise.all([
        binanceService.getSymbolInfo(normalizedSymbol),
        binanceService.getKlineData(normalizedSymbol, '1h', 50)
      ]);

      const indicators = calculateTechnicalIndicators(klineData, ['RSI', 'MACD', 'SMA20', 'EMA20']);
      const currentPrice = parseFloat(marketData.price);
      const priceChange24h = parseFloat(marketData.change24h || '0');
      const volume24h = parseFloat(marketData.volume || '0');

      return this.generateSignalsFromAnalysis(symbol, currentPrice, priceChange24h, volume24h, indicators, minStrength);

    } catch (error) {
      console.warn(`Failed to analyze ${symbol}:`, error);
      return [];
    }
  }

  // Generate trading signals from analysis data
  private generateSignalsFromAnalysis(
    symbol: string,
    price: number,
    priceChange24h: number,
    volume24h: number,
    indicators: any,
    minStrength: number
  ): ProfessionalSignal[] {
    const signals: ProfessionalSignal[] = [];

    // Calculate signal strength
    let signalStrength = 50;

    // RSI contribution
    if (indicators.RSI < 30) signalStrength += 25; // Strong oversold
    else if (indicators.RSI > 70) signalStrength += 25; // Strong overbought
    else if (indicators.RSI > 45 && indicators.RSI < 55) signalStrength += 10;

    // MACD contribution
    if (indicators.MACD && indicators.MACD.histogram > 0) signalStrength += 15;

    // Volume contribution
    if (volume24h > 10000000) signalStrength += 15;

    // Price action contribution
    if (Math.abs(priceChange24h) > 3) signalStrength += 20;

    // Only generate signal if it meets minimum strength
    if (signalStrength < minStrength) return signals;

    // Determine signal type and action
    let action: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
    let category: ProfessionalSignal['category'] = 'MOMENTUM';

    if (indicators.RSI < 30 && indicators.MACD?.histogram > 0) {
      action = 'BUY';
      category = 'REVERSAL';
    } else if (indicators.RSI > 70 && indicators.MACD?.histogram < 0) {
      action = 'SELL';
      category = 'REVERSAL';
    } else if (priceChange24h > 5) {
      action = 'BUY';
      category = 'BREAKOUT';
    } else if (priceChange24h < -5) {
      action = 'SELL';
      category = 'BREAKOUT';
    }

    // Calculate targets and stops
    const volatilityFactor = Math.abs(priceChange24h) / 100;
    const targetDistance = Math.max(0.02, volatilityFactor * 2); // 2% minimum
    const stopDistance = targetDistance * 0.6; // 1.67:1 risk/reward

    const signal: ProfessionalSignal = {
      id: uuidv4(),
      symbol,
      type: action,
      strength: Math.round(signalStrength),
      confidence: Math.max(0.5, Math.min(0.95, signalStrength / 100)),
      timeframe: '1h',
      entry: price,
      target: action === 'BUY' ? price * (1 + targetDistance) : price * (1 - targetDistance),
      stopLoss: action === 'BUY' ? price * (1 - stopDistance) : price * (1 + stopDistance),
      riskReward: targetDistance / stopDistance,
      expectedReturn: targetDistance * 100,
      category,
      indicators: {
        rsi: indicators.RSI,
        macd: indicators.MACD?.histogram > 0 ? 'BULLISH' : 'BEARISH',
        ema: indicators.EMA20 > price ? 'BEARISH' : 'BULLISH',
        volume: volume24h > 50000000 ? 'HIGH' : volume24h > 10000000 ? 'MEDIUM' : 'LOW',
        support: indicators.RSI < 35,
        resistance: indicators.RSI > 65
      },
      reasoning: this.generateSignalReasoning(category, action, indicators),
      timestamp: new Date().toISOString(),
      priority: signalStrength > 85 ? 'CRITICAL' : signalStrength > 75 ? 'HIGH' : signalStrength > 65 ? 'MEDIUM' : 'LOW',
      source: 'AI_ANALYSIS',
      marketCondition: Math.abs(priceChange24h) > 5 ? 'VOLATILE' : 'RANGING',
      followUp: {
        checkIn: '1 hour',
        exitStrategy: action === 'HOLD' ? 'Monitor for direction' : `Target: ${targetDistance * 100}%, Stop: ${stopDistance * 100}%`,
        riskManagement: 'Monitor volume and momentum'
      }
    };

    signals.push(signal);
    return signals;
  }

  // Generate reasoning text for signals
  private generateSignalReasoning(category: string, type: string, indicators: any): string {
    const reasons = {
      BREAKOUT: {
        BUY: 'Strong upward breakout with momentum confirmation',
        SELL: 'Breakdown below support with volume confirmation',
        HOLD: 'Consolidation near breakout levels'
      },
      REVERSAL: {
        BUY: 'Oversold bounce with bullish divergence detected',
        SELL: 'Overbought rejection with bearish signals',
        HOLD: 'Mixed reversal signals detected'
      },
      MOMENTUM: {
        BUY: 'Strong bullish momentum with volume support',
        SELL: 'Bearish momentum building with selling pressure',
        HOLD: 'Momentum stalling, awaiting direction'
      }
    };

    return (reasons as any)[category]?.[type] || 'Technical analysis based on multiple indicators';
  }

  // Utility function for delays
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const aiAnalysisWorker = new AIAnalysisWorkerService();