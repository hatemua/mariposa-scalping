import Agenda from 'agenda';
import { config } from '../config/environment';
import { binanceService } from './binanceService';
import { aiAnalysisService } from './aiAnalysisService';
import { okxService } from './okxService';
import { redisService } from './redisService';
import { redis } from '../config/redis';
import { tradingSignalService } from './tradingSignalService';
import { performanceMetricsService } from './performanceMetricsService';
import { marketDataCacheService } from './marketDataCacheService';
import { orderTrackingService } from './orderTrackingService';
import { SymbolConverter } from '../utils/symbolConverter';
import { ScalpingAgent, Trade } from '../models';
import OpportunityModel from '../models/Opportunity';
import WhaleActivityModel from '../models/WhaleActivity';
import { ConsolidatedAnalysis, JobData } from '../types';

export class AgendaService {
  private agenda: Agenda;

  constructor() {
    this.agenda = new Agenda({
      db: { address: config.MONGODB_URI, collection: 'agenda_jobs' },
      processEvery: '5 seconds',
      maxConcurrency: 10
    });

    this.defineJobs();
    // Note: Redis integration will be set up in start() method
    // to ensure Redis is ready before attempting subscriptions
  }

  private defineJobs(): void {
    // Market Analysis Job - Enhanced with Redis caching
    this.agenda.define('analyze-market', async (job: any) => {
      const { agentId, symbol } = job.attrs.data as JobData['payload'];

      try {
        console.log(`Running market analysis for agent ${agentId}, symbol ${symbol}`);

        // Check if we should skip this analysis due to rate limiting
        const jobKey = `job:analysis:${agentId}:${symbol}`;
        const lastRun = await redisService.get(jobKey);
        if (lastRun && (Date.now() - lastRun) < 60000) { // 1 minute rate limit
          console.log(`Skipping analysis for ${agentId}:${symbol} due to rate limiting`);
          return;
        }

        // Use cached market data service for better performance
        const [marketData, klineData, orderBook] = await Promise.all([
          marketDataCacheService.getMarketData(symbol, { useCache: true, maxAge: 30 }),
          marketDataCacheService.getKlineData(symbol, '5m', 100, { useCache: true }),
          marketDataCacheService.getOrderBook(symbol, 100, { useCache: true })
        ]);

        if (!marketData || !klineData || !orderBook) {
          console.error(`Failed to get market data for ${symbol}`);
          return;
        }

        const analysis = await aiAnalysisService.analyzeMarketData(
          marketData,
          klineData,
          orderBook
        );

        // Cache job execution time for rate limiting
        await redisService.set(jobKey, Date.now(), { ttl: 300 });

        await this.processAnalysisResult(agentId, analysis);

        // Update job success counter
        await this.updateJobMetrics('analyze-market', 'success');

      } catch (error) {
        console.error(`Error in market analysis job for agent ${agentId}:`, error);
        await this.updateJobMetrics('analyze-market', 'error');

        // Cache failed attempt to prevent immediate retry
        const jobKey = `job:analysis:${agentId}:${symbol}`;
        await redisService.set(jobKey, Date.now(), { ttl: 60 });
      }
    });

    // Trade Execution Job
    this.agenda.define('execute-trade', async (job: any) => {
      const {
        userId,
        agentId,
        symbol,
        side,
        type,
        amount,
        price
      } = job.attrs.data as JobData['payload'];

      try {
        console.log(`Executing trade for agent ${agentId}: ${side} ${amount} ${symbol}`);

        const order = await okxService.executeScalpingOrder(
          userId,
          symbol,
          side,
          amount,
          type,
          price
        );

        const trade = new Trade({
          userId,
          agentId,
          symbol,
          side,
          type,
          quantity: amount,
          price: price || order.price,
          filledPrice: (order as any).average || order.avgFillPrice,
          filledQuantity: (order as any).filled || (order as any).fillQty,
          status: order.status === 'closed' ? 'filled' : 'pending',
          okxOrderId: (order as any).id || order.orderId,
          fees: order.fee?.cost
        });

        await trade.save();

        if (order.status === 'closed') {
          await this.updateAgentPerformance(agentId, trade);
        }

        console.log(`Trade executed successfully: ${(order as any).id || order.orderId}`);
      } catch (error) {
        console.error(`Error executing trade for agent ${agentId}:`, error);

        const failedTrade = new Trade({
          userId,
          agentId,
          symbol,
          side,
          type,
          quantity: amount,
          price: price || 0,
          status: 'rejected'
        });

        await failedTrade.save();
      }
    });

    // Monitor Open Positions Job
    this.agenda.define('monitor-positions', async (job: any) => {
      const { userId, agentId } = job.attrs.data as JobData['payload'];

      try {
        const openTrades = await Trade.find({
          userId,
          agentId,
          status: 'pending'
        });

        for (const trade of openTrades) {
          if (trade.okxOrderId) {
            const orderStatus = await okxService.getOrderStatus(
              userId,
              trade.okxOrderId,
              trade.symbol
            );

            if (orderStatus && orderStatus.status === 'closed') {
              trade.status = 'filled';
              trade.filledPrice = (orderStatus as any).average || orderStatus.avgFillPrice;
              trade.filledQuantity = (orderStatus as any).filled || (orderStatus as any).fillQty;
              trade.fees = orderStatus.fee?.cost;

              await trade.save();
              await this.updateAgentPerformance(agentId, trade);
            } else if (orderStatus && orderStatus.status === 'canceled') {
              trade.status = 'cancelled';
              await trade.save();
            }
          }
        }
      } catch (error) {
        console.error(`Error monitoring positions for agent ${agentId}:`, error);
      }
    });

    // Agent Performance Update Job
    this.agenda.define('update-performance', async (job: any) => {
      const { agentId } = job.attrs.data as JobData['payload'];

      try {
        const agent = await ScalpingAgent.findById(agentId);
        if (!agent) return;

        const trades = await Trade.find({
          agentId,
          status: 'filled'
        });

        const totalTrades = trades.length;
        const winningTrades = trades.filter(t => (t.pnl || 0) > 0).length;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        const totalPnL = trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);

        const returns = trades.map(t => (t.pnl || 0) / (t.price * t.quantity));
        const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
        const stdReturn = returns.length > 1 ? Math.sqrt(
          returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1)
        ) : 0;
        const sharpeRatio = stdReturn > 0 ? avgReturn / stdReturn : 0;

        let maxDrawdown = 0;
        let peak = 0;
        let runningPnL = 0;

        for (const trade of trades.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
          runningPnL += trade.pnl || 0;
          if (runningPnL > peak) {
            peak = runningPnL;
          }
          const drawdown = (peak - runningPnL) / Math.max(peak, 1);
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }

        agent.performance = {
          totalTrades,
          winRate,
          totalPnL,
          maxDrawdown: maxDrawdown * 100,
          sharpeRatio,
          lastUpdated: new Date()
        };

        await agent.save();
      } catch (error) {
        console.error(`Error updating performance for agent ${agentId}:`, error);
      }
    });
  }

  private async processAnalysisResult(
    agentId: string,
    analysis: ConsolidatedAnalysis
  ): Promise<void> {
    try {
      const agent = await ScalpingAgent.findById(agentId).populate('userId');
      if (!agent || !agent.isActive) return;

      const { recommendation, confidence, targetPrice, stopLoss } = analysis;

      if (confidence < 0.6) {
        console.log(`Low confidence analysis (${confidence}) for agent ${agentId}, skipping trade`);
        return;
      }

      if (recommendation === 'HOLD') {
        console.log(`HOLD recommendation for agent ${agentId}, no action taken`);
        return;
      }

      const balance = await okxService.getBalance(agent.userId.toString());
      const availableBalance = balance.free.USDT || 0;

      if (availableBalance < 10) {
        console.log(`Insufficient balance for agent ${agentId}: $${availableBalance}`);
        return;
      }

      const currentPrice = analysis.targetPrice || 0;
      const positionSize = okxService.calculatePositionSize(
        availableBalance,
        currentPrice,
        agent.config.riskPercentage,
        agent.config.stopLossPercentage
      );

      const maxPositionValue = agent.config.maxPositionSize;
      const finalAmount = Math.min(positionSize, maxPositionValue / currentPrice);

      if (finalAmount < 0.01) {
        console.log(`Position size too small for agent ${agentId}: ${finalAmount}`);
        return;
      }

      await this.scheduleTradeExecution({
        userId: agent.userId.toString(),
        agentId: agentId,
        symbol: SymbolConverter.normalize(analysis.symbol),
        side: recommendation === 'BUY' ? 'buy' : 'sell',
        type: 'market',
        amount: finalAmount
      });

    } catch (error) {
      console.error(`Error processing analysis result for agent ${agentId}:`, error);
    }
  }

  private async updateAgentPerformance(agentId: string, trade: any): Promise<void> {
    try {
      if (trade.side === 'sell' && trade.status === 'filled') {
        const buyTrade = await Trade.findOne({
          agentId,
          symbol: SymbolConverter.normalize(trade.symbol),
          side: 'buy',
          status: 'filled',
          createdAt: { $lt: trade.createdAt }
        }).sort({ createdAt: -1 });

        if (buyTrade) {
          const pnl = ((trade.filledPrice || 0) - (buyTrade.filledPrice || 0)) * (trade.filledQuantity || 0);
          trade.pnl = pnl;
          await trade.save();
        }
      }

      await this.agenda.now('update-performance', { agentId });
    } catch (error) {
      console.error(`Error updating agent performance for ${agentId}:`, error);
    }
  }

  async startAgent(agentId: string): Promise<void> {
    try {
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) throw new Error('Agent not found');

      agent.isActive = true;
      await agent.save();

      await this.agenda.every('1 minute', 'analyze-market', {
        agentId,
        symbol: SymbolConverter.normalize(agent.symbol)
      }, { timezone: 'UTC' });

      await this.agenda.every('30 seconds', 'monitor-positions', {
        userId: agent.userId.toString(),
        agentId
      }, { timezone: 'UTC' });

      console.log(`Started scalping agent ${agentId} for ${agent.symbol}`);
    } catch (error) {
      console.error(`Error starting agent ${agentId}:`, error);
      throw error;
    }
  }

  async stopAgent(agentId: string): Promise<void> {
    try {
      const agent = await ScalpingAgent.findById(agentId);
      if (!agent) throw new Error('Agent not found');

      agent.isActive = false;
      await agent.save();

      await this.agenda.cancel({
        'data.agentId': agentId
      });

      console.log(`Stopped scalping agent ${agentId}`);
    } catch (error) {
      console.error(`Error stopping agent ${agentId}:`, error);
      throw error;
    }
  }

  async scheduleTradeExecution(tradeData: any): Promise<void> {
    await this.agenda.now('execute-trade', tradeData);
  }

  async start(): Promise<void> {
    try {
      // Wait for Redis to be ready before setting up subscriptions
      await this.waitForRedisReady();

      // Set up Redis integration after Redis is confirmed ready
      await this.setupRedisIntegration();

      await this.agenda.start();
      console.log('✅ Agenda service started with Redis integration');
    } catch (error) {
      console.error('❌ Failed to start Agenda service:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    await this.agenda.stop();
    console.log('Agenda service stopped');
  }

  async getJobStats(): Promise<any> {
    try {
      const [dbStats, redisStats] = await Promise.all([
        {
          running: await this.agenda.jobs({ name: { $exists: true } }, { type: 1 }),
          failed: await this.agenda.jobs({ failCount: { $gt: 0 } }),
          completed: await this.agenda.jobs({ lastFinishedAt: { $exists: true } })
        },
        this.getRedisJobStats()
      ]);

      return { ...dbStats, redis: redisStats };
    } catch (error) {
      console.error('Error getting job stats:', error);
      return { error: 'Failed to get job stats' };
    }
  }

  // ===============================
  // REDIS INTEGRATION METHODS
  // ===============================

  private async waitForRedisReady(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();

    while (!redis.areAllClientsReady()) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Redis clients not ready within ${timeoutMs}ms timeout. ` +
          `Status: Client=${redis.isClientReady()}, Publisher=${redis.isPublisherReady()}, Subscriber=${redis.isSubscriberReady()}`);
      }

      console.log('⏳ Waiting for Redis clients to be ready...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('✅ All Redis clients are ready for AgendaService');
  }

  private async setupRedisIntegration(): Promise<void> {
    try {
      // Define Redis-integrated jobs
      this.defineRedisJobs();

      // Set up Redis pub/sub for job coordination with error handling
      try {
        await redisService.subscribe('jobs:priority', async (message) => {
          if (message.type === 'high_priority_analysis') {
            await this.scheduleHighPriorityAnalysis(message.data);
          }
        });

        await redisService.subscribe('jobs:signal', async (message) => {
          if (message.type === 'process_signal_queue') {
            await this.agenda.now('process-signal-queue', {});
          }
        });

        console.log('✅ Redis pub/sub subscriptions established for AgendaService');
      } catch (error) {
        console.error('❌ Failed to set up Redis subscriptions:', error);
        throw error;
      }
    } catch (error) {
      console.error('❌ Error setting up Redis integration:', error);
      throw error;
    }
  }

  private defineRedisJobs(): void {
    // Process Trading Signal Queue Job
    this.agenda.define('process-signal-queue', async (job: any) => {
      try {
        await tradingSignalService.processSignalQueue();
        await this.updateJobMetrics('process-signal-queue', 'success');
      } catch (error) {
        console.error('Error processing signal queue:', error);
        await this.updateJobMetrics('process-signal-queue', 'error');
      }
    });

    // Process Trade Execution Queue Job
    this.agenda.define('process-execution-queue', async (job: any) => {
      try {
        await tradingSignalService.processExecutionQueue();
        await this.updateJobMetrics('process-execution-queue', 'success');
      } catch (error) {
        console.error('Error processing execution queue:', error);
        await this.updateJobMetrics('process-execution-queue', 'error');
      }
    });

    // Update Performance Metrics Job
    this.agenda.define('update-performance-metrics', async (job: any) => {
      try {
        await performanceMetricsService.cacheSystemMetrics();
        await performanceMetricsService.updateLeaderboard();
        await this.updateJobMetrics('update-performance-metrics', 'success');
      } catch (error) {
        console.error('Error updating performance metrics:', error);
        await this.updateJobMetrics('update-performance-metrics', 'error');
      }
    });

    // Cache Warm-up Job
    this.agenda.define('warm-cache', async (job: any) => {
      try {
        const { symbols } = job.attrs.data as { symbols: string[] };
        await marketDataCacheService.warmCache(symbols || ['BTCUSDT', 'ETHUSDT', 'BNBUSDT']);
        await this.updateJobMetrics('warm-cache', 'success');
      } catch (error) {
        console.error('Error warming cache:', error);
        await this.updateJobMetrics('warm-cache', 'error');
      }
    });

    // Order Status Tracking Job
    this.agenda.define('track-order-status', async (job: any) => {
      try {
        const { orderId } = job.attrs.data as { orderId: string };
        await orderTrackingService.checkOrderStatus(orderId);
        await this.updateJobMetrics('track-order-status', 'success');
      } catch (error) {
        console.error(`Error tracking order status for ${job.attrs.data?.orderId}:`, error);
        await this.updateJobMetrics('track-order-status', 'error');
      }
    });

    // Cleanup Jobs
    this.agenda.define('cleanup-old-data', async (job: any) => {
      try {
        await Promise.all([
          tradingSignalService.cleanupOldSignals(),
          performanceMetricsService.cleanupOldMetrics(),
          aiAnalysisService.clearAnalysisCache(), // Clear old cached analyses
          orderTrackingService.cleanupOldData() // Cleanup old order tracking data
        ]);
        await this.updateJobMetrics('cleanup-old-data', 'success');
      } catch (error) {
        console.error('Error cleaning up old data:', error);
        await this.updateJobMetrics('cleanup-old-data', 'error');
      }
    });

    // System Health Check Job
    this.agenda.define('system-health-check', async (job: any) => {
      try {
        await this.performSystemHealthCheck();
        await this.updateJobMetrics('system-health-check', 'success');
      } catch (error) {
        console.error('Error in system health check:', error);
        await this.updateJobMetrics('system-health-check', 'error');
      }
    });

    // Real-time Analysis Cache Refresh Job
    this.agenda.define('refresh-realtime-analysis', async (job: any) => {
      const { symbols } = job.attrs.data || { symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'] };

      try {
        console.log(`🔄 Refreshing real-time analysis cache for ${symbols.length} symbols`);

        for (const symbol of symbols) {
          try {
            const normalizedSymbol = SymbolConverter.normalize(symbol);
            console.log(`📊 Refreshing analysis for ${normalizedSymbol}`);

            // Get fresh market data
            const [marketData, klineData1m, klineData5m, orderBook] = await Promise.all([
              binanceService.getSymbolInfo(normalizedSymbol),
              binanceService.getKlineData(normalizedSymbol, '1m', 100),
              binanceService.getKlineData(normalizedSymbol, '5m', 100),
              binanceService.getOrderBook(normalizedSymbol, 50)
            ]);

            const formattedMarketData = {
              symbol: normalizedSymbol,
              price: parseFloat(marketData.lastPrice),
              volume: parseFloat(marketData.volume || '1000000'), // Use realistic fallback instead of 0
              change24h: parseFloat(marketData.priceChangePercent || '0'),
              high24h: parseFloat(marketData.highPrice || marketData.lastPrice),
              low24h: parseFloat(marketData.lowPrice || marketData.lastPrice),
              timestamp: new Date()
            };

            // Generate and cache analysis
            const analysis = await aiAnalysisService.generateRealTimeAnalysis(
              formattedMarketData,
              {
                '1m': klineData1m,
                '5m': klineData5m
              },
              orderBook
            );

            await aiAnalysisService.cacheRealTimeAnalysis(normalizedSymbol, analysis);

            // Also update stale cache
            const staleCacheKey = `rt_analysis:${normalizedSymbol}:stale`;
            await redisService.set(staleCacheKey, JSON.stringify(analysis), 900);

            console.log(`✅ Analysis refreshed for ${normalizedSymbol}`);

            // Small delay between symbols to avoid overwhelming APIs
            await new Promise(resolve => setTimeout(resolve, 2000));

          } catch (symbolError) {
            console.error(`❌ Failed to refresh analysis for ${symbol}:`, symbolError);
          }
        }

        console.log(`🎉 Completed real-time analysis refresh for all symbols`);
        await this.updateJobMetrics('refresh-realtime-analysis', 'success');

      } catch (error) {
        console.error('❌ Error refreshing real-time analysis cache:', error);
        await this.updateJobMetrics('refresh-realtime-analysis', 'error');
        throw error;
      }
    });

    // Multi-timeframe Analysis Cache Refresh Job
    this.agenda.define('refresh-multiframe-analysis', async (job: any) => {
      const { symbols } = job.attrs.data || { symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT'] };

      try {
        console.log(`🔄 Refreshing multi-timeframe analysis cache for ${symbols.length} symbols`);

        for (const symbol of symbols) {
          try {
            const normalizedSymbol = SymbolConverter.normalize(symbol);
            console.log(`📊 Refreshing multi-timeframe analysis for ${normalizedSymbol}`);

            // Get market data
            const [symbolInfo, klineData1m, klineData5m, klineData15m, orderBook] = await Promise.all([
              binanceService.getSymbolInfo(normalizedSymbol),
              binanceService.getKlineData(normalizedSymbol, '1m', 100),
              binanceService.getKlineData(normalizedSymbol, '5m', 100),
              binanceService.getKlineData(normalizedSymbol, '15m', 100),
              binanceService.getOrderBook(normalizedSymbol, 100)
            ]);

            const marketData = {
              symbol: normalizedSymbol,
              price: parseFloat(symbolInfo.lastPrice),
              volume: parseFloat(symbolInfo.volume || '1000000'), // Use realistic fallback instead of 0
              change24h: parseFloat(symbolInfo.priceChangePercent || '0'),
              high24h: parseFloat(symbolInfo.highPrice || symbolInfo.lastPrice),
              low24h: parseFloat(symbolInfo.lowPrice || symbolInfo.lastPrice),
              timestamp: new Date()
            };

            // Generate and cache analysis for multiple timeframes
            const timeframes = ['5m', '15m'];
            for (const timeframe of timeframes) {
              await aiAnalysisService.getCachedOrGenerateTimeframeAnalysis(
                marketData,
                {
                  '1m': klineData1m,
                  '5m': klineData5m,
                  '15m': klineData15m
                },
                orderBook,
                timeframe
              );
            }

            console.log(`✅ Multi-timeframe analysis refreshed for ${normalizedSymbol}`);

            // Small delay between symbols to avoid overwhelming APIs
            await new Promise(resolve => setTimeout(resolve, 3000));

          } catch (symbolError) {
            console.error(`❌ Failed to refresh multi-timeframe analysis for ${symbol}:`, symbolError);
          }
        }

        console.log(`🎉 Completed multi-timeframe analysis refresh for all symbols`);
        await this.updateJobMetrics('refresh-multiframe-analysis', 'success');

      } catch (error) {
        console.error('❌ Error refreshing multi-timeframe analysis cache:', error);
        await this.updateJobMetrics('refresh-multiframe-analysis', 'error');
        throw error;
      }
    });

    // Deep Analysis Cache Refresh Job
    this.agenda.define('refresh-deep-analysis', async (job: any) => {
      const { symbols } = job.attrs.data || { symbols: ['BTCUSDT', 'ETHUSDT'] }; // Fewer symbols for expensive deep analysis

      try {
        console.log(`🔄 Refreshing deep analysis cache for ${symbols.length} symbols`);

        for (const symbol of symbols) {
          try {
            const normalizedSymbol = SymbolConverter.normalize(symbol);
            console.log(`📊 Refreshing deep analysis for ${normalizedSymbol}`);

            // Get comprehensive market data for deep analysis
            const [symbolInfo, klineData1m, klineData5m, klineData15m, klineData1h, orderBook] = await Promise.all([
              binanceService.getSymbolInfo(normalizedSymbol),
              binanceService.getKlineData(normalizedSymbol, '1m', 100),
              binanceService.getKlineData(normalizedSymbol, '5m', 100),
              binanceService.getKlineData(normalizedSymbol, '15m', 100),
              binanceService.getKlineData(normalizedSymbol, '1h', 100),
              binanceService.getOrderBook(normalizedSymbol, 100)
            ]);

            const marketData = {
              symbol: normalizedSymbol,
              price: parseFloat(symbolInfo.lastPrice),
              volume: parseFloat(symbolInfo.volume || '1000000'), // Use realistic fallback instead of 0
              change24h: parseFloat(symbolInfo.priceChangePercent || '0'),
              high24h: parseFloat(symbolInfo.highPrice || symbolInfo.lastPrice),
              low24h: parseFloat(symbolInfo.lowPrice || symbolInfo.lastPrice),
              orderBook: {
                bids: orderBook.bids.slice(0, 20),
                asks: orderBook.asks.slice(0, 20)
              },
              timestamp: new Date()
            };

            // Generate and cache deep analysis
            const analysis = await aiAnalysisService.getCachedOrGenerateDeepAnalysis(
              marketData,
              {
                '1m': klineData1m,
                '5m': klineData5m,
                '15m': klineData15m,
                '1h': klineData1h
              },
              marketData.orderBook
            );

            console.log(`✅ Deep analysis refreshed for ${normalizedSymbol}`);

            // Longer delay between symbols for expensive deep analysis
            await new Promise(resolve => setTimeout(resolve, 5000));

          } catch (symbolError) {
            console.error(`❌ Failed to refresh deep analysis for ${symbol}:`, symbolError);
          }
        }

        console.log(`🎉 Completed deep analysis refresh for all symbols`);
        await this.updateJobMetrics('refresh-deep-analysis', 'success');

      } catch (error) {
        console.error('❌ Error refreshing deep analysis cache:', error);
        await this.updateJobMetrics('refresh-deep-analysis', 'error');
        throw error;
      }
    });

    // Bulk Analysis Cache Refresh Job
    this.agenda.define('refresh-bulk-analysis', async (job: any) => {
      const prioritySymbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'PUMPUSDT', 'TRXUSDT', 'ADAUSDT',
        'MATICUSDT', 'LINKUSDT', 'UNIUSDT', 'AVAXUSDT', 'DOTUSDT', 'LTCUSDT',
        'BNBUSDT', 'XRPUSDT', 'SHIBUSDT', 'ATOMUSDT', 'NEARUSDT', 'FTMUSDT'
      ];

      try {
        console.log(`🔄 Refreshing bulk analysis cache for ${prioritySymbols.length} symbols`);

        // Refresh cached analysis for priority symbols
        await aiAnalysisService.getCachedBulkAnalysis(prioritySymbols);

        console.log(`🎉 Completed bulk analysis cache refresh`);
        await this.updateJobMetrics('refresh-bulk-analysis', 'success');

      } catch (error) {
        console.error('❌ Error refreshing bulk analysis cache:', error);
        await this.updateJobMetrics('refresh-bulk-analysis', 'error');
        throw error;
      }
    });

    // Expire Old Opportunities Job
    this.agenda.define('expire-opportunities', async (job: any) => {
      try {
        const result = await OpportunityModel.updateMany(
          {
            expiresAt: { $lt: new Date() },
            isActive: true
          },
          {
            isActive: false,
            status: 'EXPIRED'
          }
        );

        console.log(`✅ Expired ${result.modifiedCount} old opportunities`);
        await this.updateJobMetrics('expire-opportunities', 'success');

      } catch (error) {
        console.error('❌ Error expiring opportunities:', error);
        await this.updateJobMetrics('expire-opportunities', 'error');
      }
    });

    // Expire Old Whale Activities Job
    this.agenda.define('expire-whale-activities', async (job: any) => {
      try {
        const result = await WhaleActivityModel.updateMany(
          {
            expiresAt: { $lt: new Date() },
            isActive: true
          },
          {
            isActive: false,
            status: 'EXPIRED'
          }
        );

        console.log(`✅ Expired ${result.modifiedCount} old whale activities`);
        await this.updateJobMetrics('expire-whale-activities', 'success');

      } catch (error) {
        console.error('❌ Error expiring whale activities:', error);
        await this.updateJobMetrics('expire-whale-activities', 'error');
      }
    });
  }

  private async performSystemHealthCheck(): Promise<void> {
    const healthData = {
      timestamp: new Date(),
      redis: await redisService.checkRateLimit('health-check', 1, 60),
      database: await this.checkDatabaseHealth(),
      binance: (binanceService as any).connected || false,
      queues: await tradingSignalService.getQueueStats()
    };

    // Cache health status
    await redisService.set('system:health', healthData, { ttl: 300 });

    // Alert if any critical issues
    if (!healthData.redis.allowed || !healthData.binance) {
      await redisService.publish('system:alert', {
        type: 'health_warning',
        data: healthData
      });
    }
  }

  private async checkDatabaseHealth(): Promise<boolean> {
    try {
      await ScalpingAgent.findOne().limit(1);
      return true;
    } catch (error) {
      return false;
    }
  }

  private async updateJobMetrics(jobName: string, status: 'success' | 'error'): Promise<void> {
    try {
      const key = `job:metrics:${jobName}:${status}`;
      const current = await redisService.get(key) || 0;
      await redisService.set(key, current + 1, { ttl: 86400 }); // 24 hours
    } catch (error) {
      console.error(`Error updating job metrics for ${jobName}:`, error);
    }
  }

  private async getRedisJobStats(): Promise<any> {
    try {
      const jobNames = [
        'analyze-market',
        'process-signal-queue',
        'process-execution-queue',
        'update-performance-metrics',
        'warm-cache',
        'track-order-status',
        'cleanup-old-data',
        'system-health-check'
      ];

      const stats: Record<string, any> = {};

      for (const jobName of jobNames) {
        const [successCount, errorCount] = await Promise.all([
          redisService.get(`job:metrics:${jobName}:success`) || 0,
          redisService.get(`job:metrics:${jobName}:error`) || 0
        ]);

        stats[jobName] = {
          success: successCount,
          error: errorCount,
          total: successCount + errorCount
        };
      }

      return stats;
    } catch (error) {
      console.error('Error getting Redis job stats:', error);
      return {};
    }
  }

  // ===============================
  // ENHANCED JOB SCHEDULING
  // ===============================

  async scheduleHighPriorityAnalysis(data: { agentId: string; symbol: string }): Promise<void> {
    await this.agenda.now('analyze-market', data);
  }

  async scheduleRecurringJobs(): Promise<void> {
    try {
      // Process trading queues every 30 seconds
      await this.agenda.every('30 seconds', 'process-signal-queue');
      await this.agenda.every('15 seconds', 'process-execution-queue');

      // Update performance metrics every 5 minutes
      await this.agenda.every('5 minutes', 'update-performance-metrics');

      // Refresh real-time analysis cache every 5 minutes
      await this.agenda.every('5 minutes', 'refresh-realtime-analysis', {
        symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOTUSDT', 'LINKUSDT']
      });

      // Refresh multi-timeframe analysis cache every 10 minutes (offset by 2 minutes)
      await this.agenda.every('10 minutes', 'refresh-multiframe-analysis', {
        symbols: ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'SOLUSDT']
      });

      // Refresh deep analysis cache every 15 minutes (offset by 5 minutes) - only for most popular symbols
      await this.agenda.every('15 minutes', 'refresh-deep-analysis', {
        symbols: ['BTCUSDT', 'ETHUSDT']
      });

      // Refresh bulk analysis cache every 30 minutes
      await this.agenda.every('30 minutes', 'refresh-bulk-analysis');

      // Warm cache every hour
      await this.agenda.every('1 hour', 'warm-cache', {
        symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'ADAUSDT', 'DOTUSDT']
      });

      // Cleanup old data every 6 hours
      await this.agenda.every('6 hours', 'cleanup-old-data');

      // System health check every minute
      await this.agenda.every('1 minute', 'system-health-check');

      // Expire old opportunities every 5 minutes
      await this.agenda.every('5 minutes', 'expire-opportunities');

      // Expire old whale activities every 5 minutes
      await this.agenda.every('5 minutes', 'expire-whale-activities');

      console.log('Recurring jobs scheduled successfully');
    } catch (error) {
      console.error('Error scheduling recurring jobs:', error);
    }
  }

  async cancelAllJobsForAgent(agentId: string): Promise<void> {
    try {
      await this.agenda.cancel({
        'data.agentId': agentId
      });

      // Also clear Redis cache for this agent
      await redisService.flushByPattern(`*${agentId}*`);

      console.log(`All jobs cancelled for agent ${agentId}`);
    } catch (error) {
      console.error(`Error cancelling jobs for agent ${agentId}:`, error);
    }
  }

  async getSystemHealthStatus(): Promise<any> {
    try {
      return await redisService.get('system:health') || { status: 'unknown' };
    } catch (error) {
      console.error('Error getting system health status:', error);
      return { status: 'error', error: (error as Error).message };
    }
  }
}

export const agendaService = new AgendaService();