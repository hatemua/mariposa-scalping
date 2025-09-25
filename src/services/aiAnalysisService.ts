import axios from 'axios';
import { config } from '../config/environment';
import { LLMAnalysis, ConsolidatedAnalysis, MarketData } from '../types';
import { ConsolidatedAnalysis as AnalysisModel } from '../models';
import { redisService } from './redisService';
import { binanceService } from './binanceService';
import { SymbolConverter } from '../utils/symbolConverter';

interface TogetherAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

export class AIAnalysisService {
  private apiKey: string;
  private baseURL = 'https://api.together.xyz/v1/chat/completions';

  private models = [
    'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
    'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    'mistralai/Mixtral-8x7B-Instruct-v0.1',
    'Qwen/Qwen2.5-7B-Instruct-Turbo'
  ];

  constructor() {
    this.apiKey = config.TOGETHER_AI_API_KEY;
  }

  async analyzeMarketData(
    marketData: MarketData,
    klineData: any[],
    orderBook: any
  ): Promise<ConsolidatedAnalysis> {
    const symbol = SymbolConverter.normalize(marketData.symbol);

    try {
      // Check if we have a recent analysis in Redis cache
      const cachedAnalysis = await redisService.getCurrentAnalysis(symbol);
      if (cachedAnalysis && this.isAnalysisRecent(cachedAnalysis, 60)) { // 1 minute threshold
        console.log(`Using cached analysis for ${symbol}`);
        return cachedAnalysis;
      }

      // Check rate limiting to avoid overwhelming AI APIs
      const rateLimitKey = `ai_analysis:${symbol}`;
      const rateCheck = await redisService.checkRateLimit(rateLimitKey, 2, 60); // Max 2 analyses per minute
      if (!rateCheck.allowed) {
        console.log(`Rate limited for ${symbol}, using cached analysis if available`);
        if (cachedAnalysis) {
          return cachedAnalysis;
        }
        throw new Error(`Rate limited for AI analysis of ${symbol}`);
      }

      const prompt = this.generateAnalysisPrompt(marketData, klineData, orderBook);

      // Cache the individual model responses temporarily
      const modelCacheKey = `ai_models:${symbol}:${Date.now()}`;
      const analyses = await Promise.all(
        this.models.map(async (model, index) => {
          const analysis = await this.getModelAnalysis(model, prompt);
          // Cache individual model response
          await redisService.set(`${modelCacheKey}:${index}`, analysis, { ttl: 300 });
          return analysis;
        })
      );

      const consolidatedAnalysis = await this.consolidateAnalyses(
        symbol,
        analyses,
        prompt
      );

      // Cache the consolidated analysis in Redis
      await redisService.cacheAnalysis(symbol, consolidatedAnalysis);

      // Save to MongoDB for historical purposes (async, non-blocking)
      this.saveAnalysis(consolidatedAnalysis).catch(error => {
        console.error('Error saving analysis to MongoDB:', error);
      });

      // Publish real-time update to WebSocket clients
      await redisService.publish(`analysis:${symbol}`, {
        type: 'analysis_update',
        data: consolidatedAnalysis
      });

      return consolidatedAnalysis;
    } catch (error) {
      console.error('Error in AI analysis:', error);

      // Try to return the most recent cached analysis as fallback
      const fallbackAnalysis = await redisService.getCurrentAnalysis(symbol);
      if (fallbackAnalysis) {
        console.log(`Using fallback analysis for ${symbol}`);
        return fallbackAnalysis;
      }

      throw error;
    }
  }

  private async getModelAnalysis(model: string, prompt: string): Promise<LLMAnalysis> {
    try {
      const response = await axios.post<TogetherAIResponse>(
        this.baseURL,
        {
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an expert cryptocurrency trading analyst. Provide clear, actionable trading recommendations based on technical analysis.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 500,
          temperature: 0.1
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      return this.parseModelResponse(model, content);
    } catch (error) {
      console.error(`Error getting analysis from ${model}:`, error);

      // Enhanced fallback with more informative response
      return {
        model,
        recommendation: 'HOLD',
        confidence: 0.1,
        reasoning: `${model} analysis unavailable - API error. Recommend HOLD until market conditions are clearer.`,
        timestamp: new Date()
      };
    }
  }

  private parseModelResponse(model: string, content: string): LLMAnalysis {
    try {
      const lines = content.toLowerCase().split('\n');
      let recommendation: 'BUY' | 'SELL' | 'HOLD' = 'HOLD';
      let confidence = 0.5;
      let targetPrice: number | undefined;
      let stopLoss: number | undefined;

      if (content.includes('buy') || content.includes('bullish')) {
        recommendation = 'BUY';
        confidence = 0.7;
      } else if (content.includes('sell') || content.includes('bearish')) {
        recommendation = 'SELL';
        confidence = 0.7;
      }

      const priceRegex = /(?:target|price).*?(\d+(?:\.\d+)?)/i;
      const targetMatch = content.match(priceRegex);
      if (targetMatch) {
        targetPrice = parseFloat(targetMatch[1]);
      }

      const stopRegex = /stop.*?loss.*?(\d+(?:\.\d+)?)/i;
      const stopMatch = content.match(stopRegex);
      if (stopMatch) {
        stopLoss = parseFloat(stopMatch[1]);
      }

      if (content.includes('strong') || content.includes('confident')) {
        confidence = Math.min(confidence + 0.2, 0.9);
      }

      return {
        model,
        recommendation,
        confidence,
        reasoning: content.trim(),
        targetPrice,
        stopLoss,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error parsing model response:', error);
      return {
        model,
        recommendation: 'HOLD',
        confidence: 0.1,
        reasoning: content.trim(),
        timestamp: new Date()
      };
    }
  }

  private async consolidateAnalyses(
    symbol: string,
    analyses: LLMAnalysis[],
    originalPrompt: string
  ): Promise<ConsolidatedAnalysis> {
    try {
      const consolidationPrompt = `
        Based on the following 4 AI model analyses for ${symbol}, provide a final consolidated trading recommendation:

        ${analyses.map((analysis, index) => `
        Model ${index + 1} (${analysis.model}):
        - Recommendation: ${analysis.recommendation}
        - Confidence: ${analysis.confidence}
        - Reasoning: ${analysis.reasoning}
        - Target Price: ${analysis.targetPrice || 'N/A'}
        - Stop Loss: ${analysis.stopLoss || 'N/A'}
        `).join('\n')}

        Provide a final recommendation (BUY/SELL/HOLD), confidence level (0-1), target price if applicable, stop loss if applicable, and reasoning.
        Format your response as JSON: {
          "recommendation": "BUY/SELL/HOLD",
          "confidence": 0.0-1.0,
          "targetPrice": number or null,
          "stopLoss": number or null,
          "reasoning": "your consolidated reasoning"
        }
      `;

      const response = await axios.post<TogetherAIResponse>(
        this.baseURL,
        {
          model: this.models[1], // Use the most capable model for consolidation
          messages: [
            {
              role: 'system',
              content: 'You are a senior trading analyst consolidating multiple AI analyses. Provide a balanced, well-reasoned final recommendation.'
            },
            {
              role: 'user',
              content: consolidationPrompt
            }
          ],
          max_tokens: 300,
          temperature: 0.05
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      const consolidated = this.parseConsolidatedResponse(content);

      return {
        symbol,
        recommendation: consolidated.recommendation,
        confidence: consolidated.confidence,
        targetPrice: consolidated.targetPrice,
        stopLoss: consolidated.stopLoss,
        reasoning: consolidated.reasoning,
        individualAnalyses: analyses,
        timestamp: new Date()
      };
    } catch (error) {
      console.error('Error consolidating analyses:', error);

      const buyCount = analyses.filter(a => a.recommendation === 'BUY').length;
      const sellCount = analyses.filter(a => a.recommendation === 'SELL').length;

      let finalRecommendation: 'BUY' | 'SELL' | 'HOLD';
      if (buyCount > sellCount) {
        finalRecommendation = 'BUY';
      } else if (sellCount > buyCount) {
        finalRecommendation = 'SELL';
      } else {
        finalRecommendation = 'HOLD';
      }

      return {
        symbol,
        recommendation: finalRecommendation,
        confidence: 0.5,
        reasoning: 'Fallback consolidation due to AI error',
        individualAnalyses: analyses,
        timestamp: new Date()
      };
    }
  }

  private parseConsolidatedResponse(content: string): any {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }

      return {
        recommendation: 'HOLD',
        confidence: 0.5,
        targetPrice: null,
        stopLoss: null,
        reasoning: content.trim()
      };
    } catch (error) {
      return {
        recommendation: 'HOLD',
        confidence: 0.5,
        targetPrice: null,
        stopLoss: null,
        reasoning: content.trim()
      };
    }
  }

  private generateAnalysisPrompt(
    marketData: MarketData,
    klineData: any[],
    orderBook: any
  ): string {
    const recentCandles = klineData.slice(-20);

    // Calculate key metrics for profit potential assessment
    const currentPrice = typeof marketData.price === 'number' ? marketData.price : parseFloat(marketData.price);
    const volume24h = typeof marketData.volume === 'number' ? marketData.volume : parseFloat(marketData.volume);
    const change24h = typeof marketData.change24h === 'number' ? marketData.change24h : parseFloat(marketData.change24h);
    const high24h = typeof marketData.high24h === 'number' ? marketData.high24h : parseFloat(marketData.high24h);
    const low24h = typeof marketData.low24h === 'number' ? marketData.low24h : parseFloat(marketData.low24h);

    // Calculate volatility (range as percentage of current price)
    const volatility = ((high24h - low24h) / currentPrice) * 100;

    // Calculate momentum indicators
    const recentPrices = recentCandles.map(candle => parseFloat(candle[4]));
    const priceChange1h = recentPrices.length >= 12 ?
      ((recentPrices[recentPrices.length - 1] - recentPrices[recentPrices.length - 12]) / recentPrices[recentPrices.length - 12]) * 100 : 0;

    return `
      PRIORITY SCALPING ANALYSIS for ${marketData.symbol}:

      PROFIT OPPORTUNITY ASSESSMENT:
      - Current Price: $${marketData.price}
      - 24h Volatility: ${volatility.toFixed(2)}% (HIGH PRIORITY if >3%)
      - 24h Volume: $${(volume24h / 1000000).toFixed(2)}M (HIGH PRIORITY if >$10M)
      - 1h Price Change: ${priceChange1h.toFixed(2)}%
      - 24h Change: ${change24h}%
      - 24h Range: $${low24h} - $${high24h}

      VOLUME & LIQUIDITY ANALYSIS:
      - 24h Volume: ${marketData.volume}
      - Recent Volume Trend: ${recentCandles.slice(-5).map(c => c[5]).join(', ')}
      - Order Book Depth: Bid ${orderBook.bids.slice(0, 5).reduce((sum: number, bid: any) => sum + parseFloat(bid[1]), 0).toFixed(2)} / Ask ${orderBook.asks.slice(0, 5).reduce((sum: number, ask: any) => sum + parseFloat(ask[1]), 0).toFixed(2)}

      RECENT PRICE ACTION (5min intervals):
      ${recentCandles.slice(-10).map((candle, i) =>
        `${i + 1}. O:${parseFloat(candle[1]).toFixed(4)} H:${parseFloat(candle[2]).toFixed(4)} L:${parseFloat(candle[3]).toFixed(4)} C:${parseFloat(candle[4]).toFixed(4)} V:${candle[5]}`
      ).join('\n')}

      ORDER BOOK PRESSURE:
      Top 5 Bids: ${orderBook.bids.slice(0, 5).map((bid: any) => `$${bid[0]}(${bid[1]})`).join(', ')}
      Top 5 Asks: ${orderBook.asks.slice(0, 5).map((ask: any) => `$${ask[0]}(${ask[1]})`).join(', ')}

      CRITICAL REQUIREMENTS FOR RECOMMENDATION:

      ⚠️ ONLY RECOMMEND BUY/SELL IF ALL CONDITIONS MET:
      1. 24h Volume > $5M (current: $${(volume24h / 1000000).toFixed(2)}M)
      2. 24h Volatility > 2% (current: ${volatility.toFixed(2)}%)
      3. Clear technical setup (breakout, support/resistance, momentum)
      4. Sufficient order book liquidity
      5. Profit potential > 0.5% within 15-30 minutes

      ⚠️ RECOMMEND HOLD IF:
      - Low volume (<$5M) or low volatility (<2%)
      - Sideways/choppy price action
      - Poor liquidity or wide spreads
      - Uncertain market direction

      PROVIDE YOUR ANALYSIS:
      1. PROFIT POTENTIAL SCORE (1-10): Rate the scalping opportunity
      2. RECOMMENDATION: BUY/SELL/HOLD with clear justification
      3. CONFIDENCE: 0.1-0.9 (be conservative, require strong setups)
      4. TARGET PRICE: Realistic 0.3-1.0% move within 30 minutes
      5. STOP LOSS: Tight risk management (0.2-0.5% max loss)
      6. KEY REASONING: Focus on why THIS coin has profit potential RIGHT NOW

      Remember: SCALPING REQUIRES HIGH VOLUME, HIGH VOLATILITY, AND CLEAR DIRECTIONAL BIAS
    `;
  }

  private async saveAnalysis(analysis: ConsolidatedAnalysis): Promise<void> {
    try {
      const analysisDoc = new AnalysisModel(analysis);
      await analysisDoc.save();
    } catch (error) {
      console.error('Error saving analysis:', error);
    }
  }

  async getRecentAnalyses(symbol: string, limit = 10): Promise<ConsolidatedAnalysis[]> {
    const normalizedSymbol = SymbolConverter.normalize(symbol);

    try {
      // First try to get from Redis (faster for recent analyses)
      const redisKey = `recent_analyses:${normalizedSymbol}`;
      const cachedAnalyses = await redisService.get(redisKey);

      if (cachedAnalyses && Array.isArray(cachedAnalyses) && cachedAnalyses.length >= limit) {
        return cachedAnalyses.slice(0, limit);
      }

      // Fallback to MongoDB
      const analyses = await AnalysisModel
        .find({ symbol: normalizedSymbol })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();

      const analysesArray = analyses as ConsolidatedAnalysis[];

      // Cache the results in Redis for faster subsequent access
      if (analysesArray.length > 0) {
        await redisService.set(redisKey, analysesArray, { ttl: 300 }); // 5 minutes cache
      }

      return analysesArray;
    } catch (error) {
      console.error('Error fetching recent analyses:', error);
      return [];
    }
  }

  private isAnalysisRecent(analysis: ConsolidatedAnalysis, maxAgeSeconds: number): boolean {
    if (!analysis || !analysis.timestamp) return false;

    const analysisTime = new Date(analysis.timestamp).getTime();
    const now = Date.now();
    const ageSeconds = (now - analysisTime) / 1000;

    return ageSeconds <= maxAgeSeconds;
  }

  // ===============================
  // DEEP ANALYSIS METHODS
  // ===============================

  async generateDeepAnalysis(
    marketData: MarketData,
    multiTimeframeData: { [key: string]: any[] },
    orderBook: any
  ): Promise<any> {
    const symbol = SymbolConverter.normalize(marketData.symbol);

    try {
      // Check if we have a recent deep analysis in Redis cache
      const cacheKey = `deep_analysis:${symbol}`;
      const cachedAnalysis = await redisService.get(cacheKey);
      if (cachedAnalysis && this.isAnalysisRecent(cachedAnalysis, 180)) { // 3 minutes for deep analysis
        console.log(`Using cached deep analysis for ${symbol}`);
        return cachedAnalysis;
      }

      // Generate technical indicators for all timeframes
      const technicalIndicators = this.calculateTechnicalIndicators(multiTimeframeData);

      // Calculate advanced risk metrics
      const riskMetrics = this.calculateAdvancedRiskMetrics(marketData, multiTimeframeData);

      // Analyze market microstructure
      const microstructure = this.analyzeMarketMicrostructure(orderBook, marketData);

      // Generate enhanced prompt for deep analysis
      const deepPrompt = this.generateDeepAnalysisPrompt(
        marketData,
        multiTimeframeData,
        orderBook,
        technicalIndicators,
        riskMetrics,
        microstructure
      );

      // Get analysis from multiple models with enhanced context
      const analyses = await Promise.all(
        this.models.map(async (model) => {
          return await this.getModelAnalysis(model, deepPrompt);
        })
      );

      // Generate comprehensive consolidated analysis
      const consolidatedAnalysis = await this.consolidateDeepAnalyses(
        symbol,
        analyses,
        technicalIndicators,
        riskMetrics,
        microstructure,
        deepPrompt
      );

      // Cache the deep analysis
      await redisService.set(cacheKey, consolidatedAnalysis, { ttl: 180 }); // 3 minutes cache

      // Save to MongoDB for historical purposes
      this.saveAnalysis(consolidatedAnalysis).catch(error => {
        console.error('Error saving deep analysis to MongoDB:', error);
      });

      // Publish real-time update
      await redisService.publish(`deep_analysis:${symbol}`, {
        type: 'deep_analysis_update',
        data: consolidatedAnalysis
      });

      return consolidatedAnalysis;
    } catch (error) {
      console.error('Error in deep analysis:', error);

      // Try to return cached analysis as fallback
      const fallbackAnalysis = await redisService.get(`deep_analysis:${symbol}`);
      if (fallbackAnalysis) {
        console.log(`Using fallback deep analysis for ${symbol}`);
        return fallbackAnalysis;
      }

      throw error;
    }
  }

  private calculateTechnicalIndicators(multiTimeframeData: { [key: string]: any[] }): any {
    const indicators: any = {};

    Object.entries(multiTimeframeData).forEach(([timeframe, klineData]) => {
      const prices = klineData.map(candle => parseFloat(candle[4])); // Close prices
      const highs = klineData.map(candle => parseFloat(candle[2])); // High prices
      const lows = klineData.map(candle => parseFloat(candle[3])); // Low prices
      const volumes = klineData.map(candle => parseFloat(candle[5])); // Volumes

      indicators[timeframe] = {
        // RSI calculation (simplified)
        rsi: this.calculateRSI(prices, 14),

        // Moving averages
        ema20: this.calculateEMA(prices, 20),
        ema50: this.calculateEMA(prices, 50),
        sma20: this.calculateSMA(prices, 20),
        sma50: this.calculateSMA(prices, 50),

        // Bollinger Bands
        bollingerBands: this.calculateBollingerBands(prices, 20),

        // Volume indicators
        volumeMA: this.calculateSMA(volumes, 20),
        volumeRatio: volumes[volumes.length - 1] / this.calculateSMA(volumes, 20),

        // Support and Resistance levels
        supportResistance: this.findSupportResistanceLevels(highs, lows, prices),

        // Price volatility
        volatility: this.calculateVolatility(prices, 20),

        // Momentum indicators
        momentum: this.calculateMomentum(prices, 10),

        // Recent trend
        trend: this.identifyTrend(prices, 20)
      };
    });

    return indicators;
  }

  private calculateAdvancedRiskMetrics(marketData: MarketData, multiTimeframeData: { [key: string]: any[] }): any {
    const prices5m = multiTimeframeData['5m']?.map(candle => parseFloat(candle[4])) || [];
    const currentPrice = typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price));

    return {
      // Value at Risk (simplified 5% VaR)
      var5: this.calculateVaR(prices5m, 0.05),

      // Maximum Drawdown
      maxDrawdown: this.calculateMaxDrawdown(prices5m),

      // Volatility measures
      dailyVolatility: ((marketData.high24h - marketData.low24h) / currentPrice) * 100,
      intraVolatility: this.calculateIntraVolatility(multiTimeframeData),

      // Liquidity risk score
      liquidityScore: this.calculateLiquidityScore(marketData),

      // Risk-adjusted returns
      sharpeRatio: this.calculateSharpeRatio(prices5m),

      // Dynamic stop loss suggestions
      dynamicStopLoss: this.calculateDynamicStopLoss(prices5m, currentPrice),

      // Position sizing recommendations
      positionSizing: this.calculateOptimalPositionSize(prices5m, currentPrice)
    };
  }

  private analyzeMarketMicrostructure(orderBook: any, marketData: MarketData): any {
    const bids = orderBook.bids || [];
    const asks = orderBook.asks || [];

    return {
      // Bid-Ask spread analysis
      spread: asks.length > 0 && bids.length > 0 ?
        ((parseFloat(asks[0][0]) - parseFloat(bids[0][0])) / parseFloat(asks[0][0])) * 100 : 0,

      // Order book depth
      bidDepth: bids.slice(0, 10).reduce((sum: number, bid: any) => sum + parseFloat(bid[1]), 0),
      askDepth: asks.slice(0, 10).reduce((sum: number, ask: any) => sum + parseFloat(ask[1]), 0),

      // Order book imbalance
      imbalance: this.calculateOrderBookImbalance(bids, asks),

      // Price levels concentration
      concentrationLevels: this.findPriceConcentration(bids, asks),

      // Market pressure indicators
      marketPressure: this.calculateMarketPressure(bids, asks, marketData),

      // Liquidity zones
      liquidityZones: this.identifyLiquidityZones(bids, asks)
    };
  }

  // ===============================
  // TECHNICAL INDICATOR CALCULATIONS
  // ===============================

  private calculateRSI(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 50; // Neutral if not enough data

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  private calculateEMA(prices: number[], period: number): number {
    if (prices.length < period) return prices[prices.length - 1] || 0;

    const multiplier = 2 / (period + 1);
    let ema = prices[prices.length - period];

    for (let i = prices.length - period + 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }

    return ema;
  }

  private calculateSMA(values: number[], period: number): number {
    if (values.length < period) return values[values.length - 1] || 0;

    const sum = values.slice(-period).reduce((acc, val) => acc + val, 0);
    return sum / period;
  }

  private calculateBollingerBands(prices: number[], period: number = 20): any {
    const sma = this.calculateSMA(prices, period);
    const stdDev = this.calculateStandardDeviation(prices.slice(-period));

    return {
      upper: sma + (2 * stdDev),
      middle: sma,
      lower: sma - (2 * stdDev),
      position: prices[prices.length - 1] ? ((prices[prices.length - 1] - (sma - 2 * stdDev)) / (4 * stdDev)) : 0.5
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    const mean = values.reduce((acc, val) => acc + val, 0) / values.length;
    const variance = values.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  private findSupportResistanceLevels(highs: number[], lows: number[], closes: number[]): any {
    // Simplified support/resistance calculation
    const recentHighs = highs.slice(-20).sort((a, b) => b - a);
    const recentLows = lows.slice(-20).sort((a, b) => a - b);

    return {
      resistance1: recentHighs[1] || recentHighs[0],
      resistance2: recentHighs[2] || recentHighs[0],
      support1: recentLows[1] || recentLows[0],
      support2: recentLows[2] || recentLows[0],
      currentLevel: closes[closes.length - 1]
    };
  }

  private calculateVolatility(prices: number[], period: number): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < Math.min(prices.length, period + 1); i++) {
      returns.push((prices[prices.length - i] - prices[prices.length - i - 1]) / prices[prices.length - i - 1]);
    }

    return this.calculateStandardDeviation(returns) * 100;
  }

  private calculateMomentum(prices: number[], period: number): number {
    if (prices.length < period + 1) return 0;

    return ((prices[prices.length - 1] - prices[prices.length - period - 1]) / prices[prices.length - period - 1]) * 100;
  }

  private identifyTrend(prices: number[], period: number): string {
    if (prices.length < period) return 'SIDEWAYS';

    const recent = prices.slice(-period);
    const firstHalf = recent.slice(0, Math.floor(period / 2));
    const secondHalf = recent.slice(Math.floor(period / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = ((secondAvg - firstAvg) / firstAvg) * 100;

    if (change > 1) return 'UPTREND';
    if (change < -1) return 'DOWNTREND';
    return 'SIDEWAYS';
  }

  // ===============================
  // RISK METRIC CALCULATIONS
  // ===============================

  private calculateVaR(prices: number[], confidence: number): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    returns.sort((a, b) => a - b);
    const index = Math.floor(returns.length * confidence);
    return Math.abs(returns[index] || 0) * 100;
  }

  private calculateMaxDrawdown(prices: number[]): number {
    if (prices.length < 2) return 0;

    let maxDrawdown = 0;
    let peak = prices[0];

    for (let i = 1; i < prices.length; i++) {
      if (prices[i] > peak) {
        peak = prices[i];
      } else {
        const drawdown = ((peak - prices[i]) / peak) * 100;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return maxDrawdown;
  }

  private calculateIntraVolatility(multiTimeframeData: { [key: string]: any[] }): number {
    // Calculate volatility across different timeframes
    let totalVolatility = 0;
    let count = 0;

    Object.values(multiTimeframeData).forEach(klineData => {
      if (klineData.length > 1) {
        const prices = klineData.map(candle => parseFloat(candle[4]));
        totalVolatility += this.calculateVolatility(prices, Math.min(prices.length - 1, 20));
        count++;
      }
    });

    return count > 0 ? totalVolatility / count : 0;
  }

  private calculateLiquidityScore(marketData: MarketData): number {
    const volume24h = typeof marketData.volume === 'number' ? marketData.volume : parseFloat(String(marketData.volume));
    const price = typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price));

    // Simple liquidity score based on 24h volume and price
    const volumeUSD = volume24h * price;

    if (volumeUSD > 50000000) return 10; // Very high liquidity
    if (volumeUSD > 20000000) return 8;  // High liquidity
    if (volumeUSD > 5000000) return 6;   // Medium liquidity
    if (volumeUSD > 1000000) return 4;   // Low liquidity
    return 2; // Very low liquidity
  }

  private calculateSharpeRatio(prices: number[]): number {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = this.calculateStandardDeviation(returns);

    return stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(365) : 0; // Annualized
  }

  private calculateDynamicStopLoss(prices: number[], currentPrice: number): any {
    const volatility = this.calculateVolatility(prices, 20);
    const atr = this.calculateATR(prices);

    return {
      conservative: currentPrice * (1 - Math.max(0.005, volatility / 100 * 0.5)), // 0.5% min or half volatility
      moderate: currentPrice * (1 - Math.max(0.01, volatility / 100 * 0.75)),     // 1% min or 75% volatility
      aggressive: currentPrice * (1 - Math.max(0.02, volatility / 100)),          // 2% min or full volatility
      atrBased: currentPrice - (atr * 2) // 2x ATR based stop loss
    };
  }

  private calculateATR(prices: number[], period: number = 14): number {
    if (prices.length < period + 1) return 0;

    const trueRanges = [];
    for (let i = 1; i < Math.min(prices.length, period + 1); i++) {
      const high = prices[prices.length - i];
      const low = prices[prices.length - i];
      const prevClose = prices[prices.length - i - 1];

      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }

    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  private calculateOptimalPositionSize(prices: number[], currentPrice: number): any {
    const volatility = this.calculateVolatility(prices, 20);
    const kelly = this.calculateKellyCriterion(prices);

    return {
      conservative: Math.min(0.02, 1 / (volatility + 1)), // Max 2% position
      moderate: Math.min(0.05, 2 / (volatility + 1)),     // Max 5% position
      aggressive: Math.min(0.10, kelly),                  // Max 10% or Kelly criterion
      recommended: Math.min(0.03, 1.5 / (volatility + 1)) // Recommended size
    };
  }

  private calculateKellyCriterion(prices: number[]): number {
    if (prices.length < 10) return 0.01; // Conservative default

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const winRate = returns.filter(r => r > 0).length / returns.length;
    const avgWin = returns.filter(r => r > 0).reduce((a, b) => a + b, 0) / returns.filter(r => r > 0).length || 0;
    const avgLoss = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0) / returns.filter(r => r < 0).length || 0);

    if (avgLoss === 0) return 0.01;

    const kelly = winRate - ((1 - winRate) / (avgWin / avgLoss));
    return Math.max(0.01, Math.min(0.10, kelly)); // Between 1% and 10%
  }

  // ===============================
  // MARKET MICROSTRUCTURE CALCULATIONS
  // ===============================

  private calculateOrderBookImbalance(bids: any[], asks: any[]): number {
    if (!bids.length || !asks.length) return 0;

    const bidVolume = bids.slice(0, 10).reduce((sum, bid) => sum + parseFloat(bid[1]), 0);
    const askVolume = asks.slice(0, 10).reduce((sum, ask) => sum + parseFloat(ask[1]), 0);

    return (bidVolume - askVolume) / (bidVolume + askVolume);
  }

  private findPriceConcentration(bids: any[], asks: any[]): any {
    // Find price levels with high volume concentration
    const allOrders = [
      ...bids.map(bid => ({ price: parseFloat(bid[0]), volume: parseFloat(bid[1]), side: 'bid' })),
      ...asks.map(ask => ({ price: parseFloat(ask[0]), volume: parseFloat(ask[1]), side: 'ask' }))
    ];

    // Group by similar price levels (within 0.1% range)
    const priceGroups: any = {};
    allOrders.forEach(order => {
      const priceKey = Math.round(order.price * 1000); // Group by price to 3 decimal places
      if (!priceGroups[priceKey]) {
        priceGroups[priceKey] = { price: order.price, volume: 0, orders: 0 };
      }
      priceGroups[priceKey].volume += order.volume;
      priceGroups[priceKey].orders += 1;
    });

    // Find top concentration levels
    const concentrations = Object.values(priceGroups)
      .sort((a: any, b: any) => b.volume - a.volume)
      .slice(0, 5);

    return concentrations;
  }

  private calculateMarketPressure(bids: any[], asks: any[], marketData: MarketData): any {
    const currentPrice = typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price));

    // Calculate pressure within 1% of current price
    const priceRange = currentPrice * 0.01;
    const nearBids = bids.filter(bid => parseFloat(bid[0]) >= currentPrice - priceRange);
    const nearAsks = asks.filter(ask => parseFloat(ask[0]) <= currentPrice + priceRange);

    const buyPressure = nearBids.reduce((sum, bid) => sum + parseFloat(bid[1]), 0);
    const sellPressure = nearAsks.reduce((sum, ask) => sum + parseFloat(ask[1]), 0);

    return {
      buyPressure,
      sellPressure,
      ratio: sellPressure > 0 ? buyPressure / sellPressure : 1,
      dominance: buyPressure > sellPressure ? 'BUY' : 'SELL'
    };
  }

  private identifyLiquidityZones(bids: any[], asks: any[]): any {
    const currentPrice = bids.length && asks.length ?
      (parseFloat(bids[0][0]) + parseFloat(asks[0][0])) / 2 : 0;

    return {
      highLiquiditySupport: this.findHighestVolumeLevel(bids.slice(0, 20)),
      highLiquidityResistance: this.findHighestVolumeLevel(asks.slice(0, 20)),
      thinLiquidityZones: this.findThinLiquidityZones(bids, asks, currentPrice)
    };
  }

  private findHighestVolumeLevel(orders: any[]): any {
    if (!orders.length) return null;

    return orders.reduce((max, order) =>
      parseFloat(order[1]) > parseFloat(max[1]) ? order : max
    );
  }

  private findThinLiquidityZones(bids: any[], asks: any[], currentPrice: number): any[] {
    // Find price ranges with unusually low liquidity
    const zones = [];
    const priceRange = currentPrice * 0.05; // Within 5% of current price

    // Check for gaps in order book
    for (let i = 0; i < Math.min(bids.length - 1, 10); i++) {
      const priceDiff = parseFloat(bids[i][0]) - parseFloat(bids[i + 1][0]);
      const volumeSum = parseFloat(bids[i][1]) + parseFloat(bids[i + 1][1]);

      if (priceDiff > currentPrice * 0.001 && volumeSum < currentPrice * 0.1) { // Arbitrary thresholds
        zones.push({
          type: 'support_gap',
          priceLevel: parseFloat(bids[i + 1][0]),
          gapSize: priceDiff,
          volume: volumeSum
        });
      }
    }

    return zones.slice(0, 3); // Return top 3 thin zones
  }

  // ===============================
  // DEEP ANALYSIS PROMPT GENERATION
  // ===============================

  private generateDeepAnalysisPrompt(
    marketData: MarketData,
    multiTimeframeData: { [key: string]: any[] },
    orderBook: any,
    technicalIndicators: any,
    riskMetrics: any,
    microstructure: any
  ): string {
    const currentPrice = typeof marketData.price === 'number' ? marketData.price : parseFloat(String(marketData.price));

    return `
      COMPREHENSIVE DEEP ANALYSIS for ${marketData.symbol}:

      === MARKET OVERVIEW ===
      Current Price: $${currentPrice}
      24h Change: ${marketData.change24h}%
      24h Volume: $${(parseFloat(String(marketData.volume)) / 1000000).toFixed(2)}M
      24h Range: $${marketData.low24h} - $${marketData.high24h}
      Liquidity Score: ${riskMetrics.liquidityScore}/10

      === MULTI-TIMEFRAME TECHNICAL ANALYSIS ===
      ${Object.entries(technicalIndicators).map(([timeframe, indicators]: [string, any]) => `
      ${timeframe.toUpperCase()} Analysis:
      - RSI: ${indicators.rsi.toFixed(2)} (${indicators.rsi > 70 ? 'OVERBOUGHT' : indicators.rsi < 30 ? 'OVERSOLD' : 'NEUTRAL'})
      - EMA20: $${indicators.ema20.toFixed(6)} | EMA50: $${indicators.ema50.toFixed(6)}
      - Trend: ${indicators.trend}
      - Momentum: ${indicators.momentum.toFixed(2)}%
      - Volatility: ${indicators.volatility.toFixed(2)}%
      - Volume Ratio: ${indicators.volumeRatio.toFixed(2)}x
      - Bollinger Position: ${(indicators.bollingerBands.position * 100).toFixed(1)}%
      - Support: $${indicators.supportResistance.support1.toFixed(6)} | Resistance: $${indicators.supportResistance.resistance1.toFixed(6)}
      `).join('\n')}

      === ADVANCED RISK ASSESSMENT ===
      Value at Risk (5%): ${riskMetrics.var5.toFixed(2)}%
      Maximum Drawdown: ${riskMetrics.maxDrawdown.toFixed(2)}%
      Daily Volatility: ${riskMetrics.dailyVolatility.toFixed(2)}%
      Sharpe Ratio: ${riskMetrics.sharpeRatio.toFixed(3)}

      Dynamic Stop Loss Levels:
      - Conservative: $${riskMetrics.dynamicStopLoss.conservative.toFixed(6)}
      - Moderate: $${riskMetrics.dynamicStopLoss.moderate.toFixed(6)}
      - Aggressive: $${riskMetrics.dynamicStopLoss.aggressive.toFixed(6)}
      - ATR-Based: $${riskMetrics.dynamicStopLoss.atrBased.toFixed(6)}

      === MARKET MICROSTRUCTURE ===
      Bid-Ask Spread: ${microstructure.spread.toFixed(4)}%
      Order Book Imbalance: ${(microstructure.imbalance * 100).toFixed(2)}% (${microstructure.imbalance > 0 ? 'BUY' : 'SELL'} biased)
      Market Pressure: ${microstructure.marketPressure.dominance} (${microstructure.marketPressure.ratio.toFixed(2)}:1 ratio)

      Top Liquidity Zones:
      ${microstructure.concentrationLevels.slice(0, 3).map((level: any, i: number) =>
        `${i + 1}. $${level.price.toFixed(6)} (Volume: ${level.volume.toFixed(2)})`
      ).join('\n')}

      === PROFIT OPPORTUNITY MATRIX ===
      Position Sizing Recommendations:
      - Conservative: ${(riskMetrics.positionSizing.conservative * 100).toFixed(1)}% of portfolio
      - Moderate: ${(riskMetrics.positionSizing.moderate * 100).toFixed(1)}% of portfolio
      - Aggressive: ${(riskMetrics.positionSizing.aggressive * 100).toFixed(1)}% of portfolio
      - Recommended: ${(riskMetrics.positionSizing.recommended * 100).toFixed(1)}% of portfolio

      === CRITICAL ANALYSIS REQUIREMENTS ===

      🎯 PROFIT POTENTIAL SCORING:
      1. Multi-timeframe alignment (weight: 30%)
      2. Volume and liquidity adequacy (weight: 25%)
      3. Technical setup strength (weight: 20%)
      4. Risk-reward ratio (weight: 15%)
      5. Market microstructure favorability (weight: 10%)

      🚨 MANDATORY CHECKS:
      ✓ Volume > $5M (current: $${(parseFloat(String(marketData.volume)) / 1000000).toFixed(2)}M)
      ✓ Liquidity Score > 5 (current: ${riskMetrics.liquidityScore})
      ✓ Multi-timeframe confluence
      ✓ Clear risk management levels
      ✓ Positive risk-reward ratio (min 1:1.5)

      === DEEP ANALYSIS DELIVERABLES ===

      Provide comprehensive analysis including:
      1. OVERALL PROFIT SCORE (1-10): Considering all factors
      2. RECOMMENDATION: BUY/SELL/HOLD with confidence level
      3. ENTRY STRATEGY: Optimal entry points and timing
      4. EXIT STRATEGY: Target levels and stop-loss recommendations
      5. RISK ASSESSMENT: Maximum position size and risk level
      6. TIMEFRAME ANALYSIS: Best timeframes for this trade
      7. KEY CATALYSTS: What could drive price movement
      8. MARKET CONTEXT: How broader market affects this trade
      9. EXECUTION NOTES: Practical trading considerations

      Focus on actionable insights that justify the recommendation with specific price levels, timing, and risk management parameters.
    `;
  }

  private async consolidateDeepAnalyses(
    symbol: string,
    analyses: LLMAnalysis[],
    technicalIndicators: any,
    riskMetrics: any,
    microstructure: any,
    originalPrompt: string
  ): Promise<any> {
    try {
      // Enhanced consolidation with technical data
      const consolidationPrompt = `
        DEEP ANALYSIS CONSOLIDATION for ${symbol}:

        Individual AI Model Analyses:
        ${analyses.map((analysis, index) => `
        Model ${index + 1} (${analysis.model}):
        - Recommendation: ${analysis.recommendation}
        - Confidence: ${(analysis.confidence * 100).toFixed(1)}%
        - Reasoning: ${analysis.reasoning}
        - Target: ${analysis.targetPrice || 'N/A'}
        - Stop Loss: ${analysis.stopLoss || 'N/A'}
        `).join('\n')}

        Technical Indicators Summary:
        - Multi-timeframe trend alignment: ${this.assessTrendAlignment(technicalIndicators)}
        - Overall RSI signal: ${this.assessRSISignal(technicalIndicators)}
        - Volume confirmation: ${this.assessVolumeConfirmation(technicalIndicators)}
        - Risk level: ${this.assessRiskLevel(riskMetrics)}
        - Market microstructure: ${microstructure.marketPressure.dominance} bias

        Provide final consolidated recommendation as JSON:
        {
          "recommendation": "BUY/SELL/HOLD",
          "confidence": 0.0-1.0,
          "targetPrice": number or null,
          "stopLoss": number or null,
          "reasoning": "comprehensive reasoning with technical justification",
          "profitScore": 1-10,
          "riskLevel": "LOW/MEDIUM/HIGH",
          "timeframe": "optimal trading timeframe",
          "positionSize": "recommended position size percentage",
          "entryStrategy": "specific entry approach",
          "exitStrategy": "specific exit approach",
          "keyCatalysts": ["list", "of", "potential", "catalysts"],
          "technicalSetup": "description of technical setup",
          "riskManagement": "specific risk management approach"
        }
      `;

      const response = await axios.post<TogetherAIResponse>(
        this.baseURL,
        {
          model: this.models[1], // Use most capable model
          messages: [
            {
              role: 'system',
              content: 'You are a senior quantitative analyst consolidating deep market analysis. Provide institutional-grade recommendations with specific actionable insights.'
            },
            {
              role: 'user',
              content: consolidationPrompt
            }
          ],
          max_tokens: 800,
          temperature: 0.05
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      const consolidated = this.parseConsolidatedResponse(content);

      // Enhanced analysis result with all technical data
      return {
        symbol,
        recommendation: consolidated.recommendation,
        confidence: consolidated.confidence,
        targetPrice: consolidated.targetPrice,
        stopLoss: consolidated.stopLoss,
        reasoning: consolidated.reasoning,

        // Enhanced fields for deep analysis
        profitScore: consolidated.profitScore || 5,
        riskLevel: consolidated.riskLevel || 'MEDIUM',
        timeframe: consolidated.timeframe || '5m-15m',
        positionSize: consolidated.positionSize || '2-3%',
        entryStrategy: consolidated.entryStrategy || 'Market entry with confirmation',
        exitStrategy: consolidated.exitStrategy || 'Target-based with trailing stop',
        keyCatalysts: consolidated.keyCatalysts || [],
        technicalSetup: consolidated.technicalSetup || 'Mixed signals',
        riskManagement: consolidated.riskManagement || 'Standard risk management',

        // Technical data
        technicalIndicators,
        riskMetrics,
        microstructure,

        // Individual analyses
        individualAnalyses: analyses,
        timestamp: new Date(),

        // Analysis metadata
        analysisType: 'DEEP_ANALYSIS',
        dataQuality: this.assessDataQuality(technicalIndicators, riskMetrics)
      };
    } catch (error) {
      console.error('Error consolidating deep analyses:', error);

      // Enhanced fallback with technical indicators
      return this.generateFallbackDeepAnalysis(symbol, analyses, technicalIndicators, riskMetrics, microstructure);
    }
  }

  // ===============================
  // HELPER METHODS FOR ASSESSMENT
  // ===============================

  private assessTrendAlignment(technicalIndicators: any): string {
    const timeframes = Object.keys(technicalIndicators);
    const trends = timeframes.map(tf => technicalIndicators[tf]?.trend);

    const uptrends = trends.filter(t => t === 'UPTREND').length;
    const downtrends = trends.filter(t => t === 'DOWNTREND').length;

    if (uptrends > downtrends) return 'BULLISH_ALIGNED';
    if (downtrends > uptrends) return 'BEARISH_ALIGNED';
    return 'MIXED_SIGNALS';
  }

  private assessRSISignal(technicalIndicators: any): string {
    const rsiValues = Object.values(technicalIndicators).map((indicators: any) => indicators.rsi);
    const avgRSI = rsiValues.reduce((a: number, b: number) => a + b, 0) / rsiValues.length;

    if (avgRSI > 70) return 'OVERBOUGHT';
    if (avgRSI < 30) return 'OVERSOLD';
    return 'NEUTRAL';
  }

  private assessVolumeConfirmation(technicalIndicators: any): string {
    const volumeRatios = Object.values(technicalIndicators).map((indicators: any) => indicators.volumeRatio);
    const avgVolumeRatio = volumeRatios.reduce((a: number, b: number) => a + b, 0) / volumeRatios.length;

    if (avgVolumeRatio > 1.5) return 'HIGH_VOLUME';
    if (avgVolumeRatio > 1.2) return 'ABOVE_AVERAGE';
    return 'NORMAL';
  }

  private assessRiskLevel(riskMetrics: any): string {
    const volatility = riskMetrics.dailyVolatility || 0;
    const liquidityScore = riskMetrics.liquidityScore || 5;

    if (volatility > 10 || liquidityScore < 3) return 'HIGH';
    if (volatility > 5 || liquidityScore < 6) return 'MEDIUM';
    return 'LOW';
  }

  private assessDataQuality(technicalIndicators: any, riskMetrics: any): string {
    // Assess the quality and completeness of the analysis data
    const hasAllTimeframes = Object.keys(technicalIndicators).length >= 4;
    const hasRiskMetrics = riskMetrics && Object.keys(riskMetrics).length > 5;

    if (hasAllTimeframes && hasRiskMetrics) return 'HIGH';
    if (hasAllTimeframes || hasRiskMetrics) return 'MEDIUM';
    return 'LOW';
  }

  private generateFallbackDeepAnalysis(
    symbol: string,
    analyses: LLMAnalysis[],
    technicalIndicators: any,
    riskMetrics: any,
    microstructure: any
  ): any {
    // Enhanced fallback analysis
    const buyCount = analyses.filter(a => a.recommendation === 'BUY').length;
    const sellCount = analyses.filter(a => a.recommendation === 'SELL').length;
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;

    let finalRecommendation: 'BUY' | 'SELL' | 'HOLD';
    if (buyCount > sellCount) {
      finalRecommendation = 'BUY';
    } else if (sellCount > buyCount) {
      finalRecommendation = 'SELL';
    } else {
      finalRecommendation = 'HOLD';
    }

    return {
      symbol,
      recommendation: finalRecommendation,
      confidence: avgConfidence,
      reasoning: 'Fallback analysis based on model consensus and technical indicators',
      profitScore: 5,
      riskLevel: this.assessRiskLevel(riskMetrics),
      timeframe: '5m-15m',
      positionSize: '2%',
      entryStrategy: 'Conservative entry with confirmation',
      exitStrategy: 'Technical level based exits',
      keyCatalysts: ['Technical breakout', 'Volume confirmation'],
      technicalSetup: this.assessTrendAlignment(technicalIndicators),
      riskManagement: 'Standard 2% risk per trade',
      technicalIndicators,
      riskMetrics,
      microstructure,
      individualAnalyses: analyses,
      timestamp: new Date(),
      analysisType: 'DEEP_ANALYSIS_FALLBACK',
      dataQuality: this.assessDataQuality(technicalIndicators, riskMetrics)
    };
  }

  // ===============================
  // TRADING SIGNAL METHODS
  // ===============================

  async generateTradingSignal(symbol: string, agentId: string): Promise<any> {
    const normalizedSymbol = SymbolConverter.normalize(symbol);

    try {
      // Get the most recent analysis
      const currentAnalysis = await redisService.getCurrentAnalysis(normalizedSymbol);

      if (!currentAnalysis) {
        throw new Error(`No analysis available for ${normalizedSymbol}`);
      }

      // Generate trading signal based on analysis
      const signal = {
        agentId,
        symbol: normalizedSymbol,
        recommendation: currentAnalysis.recommendation,
        confidence: currentAnalysis.confidence,
        targetPrice: currentAnalysis.targetPrice,
        stopLoss: currentAnalysis.stopLoss,
        reasoning: currentAnalysis.reasoning,
        timestamp: new Date(),
        analysisId: `${normalizedSymbol}:${Date.now()}`
      };

      // Cache the trading signal
      await redisService.cacheTradeSignal(agentId, signal);

      // Publish signal to interested parties
      await redisService.publish(`signal:${agentId}`, {
        type: 'trading_signal',
        data: signal
      });

      return signal;
    } catch (error) {
      console.error(`Error generating trading signal for ${normalizedSymbol}:`, error);
      throw error;
    }
  }

  async getCurrentTradingSignal(agentId: string): Promise<any> {
    try {
      return await redisService.getTradeSignal(agentId);
    } catch (error) {
      console.error(`Error getting trading signal for agent ${agentId}:`, error);
      return null;
    }
  }

  // ===============================
  // BATCH ANALYSIS METHODS
  // ===============================

  async triggerBatchAnalysisForSymbols(symbols: string[]): Promise<void> {
    const normalizedSymbols = symbols.map(s => SymbolConverter.normalize(s));
    console.log(`🔄 Starting batch analysis for ${normalizedSymbols.length} symbols`);

    // Process symbols in smaller batches to avoid overwhelming the API
    const batchSize = 2; // Process 2 symbols simultaneously to respect rate limits
    const delayBetweenBatches = 3000; // 3 seconds between batches

    for (let i = 0; i < normalizedSymbols.length; i += batchSize) {
      const batch = normalizedSymbols.slice(i, i + batchSize);
      console.log(`📊 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(normalizedSymbols.length / batchSize)}:`, batch);

      // Process batch symbols in parallel
      const batchPromises = batch.map(async (symbol) => {
        try {
          // Check if we have recent analysis (within 5 minutes for batch processing)
          const cachedAnalysis = await redisService.getCurrentAnalysis(symbol);
          if (cachedAnalysis && this.isAnalysisRecent(cachedAnalysis, 300)) {
            console.log(`✅ Using cached analysis for ${symbol}`);
            return;
          }

          // Use symbol-specific rate limiting
          const rateLimitKey = `batch_analysis:${symbol}`;
          const rateCheck = await redisService.checkRateLimit(rateLimitKey, 1, 120); // 1 analysis per 2 minutes per symbol
          if (!rateCheck.allowed) {
            console.log(`⏳ Rate limited for ${symbol}, skipping for now`);
            return;
          }

          console.log(`🚀 Generating fresh analysis for ${symbol}`);

          // Get market data first
          const [symbolInfo, klineData1m, klineData5m, klineData15m, klineData1h, orderBook] = await Promise.all([
            binanceService.getSymbolInfo(symbol),
            binanceService.getKlineData(symbol, '1m', 100),
            binanceService.getKlineData(symbol, '5m', 100),
            binanceService.getKlineData(symbol, '15m', 100),
            binanceService.getKlineData(symbol, '1h', 100),
            binanceService.getOrderBook(symbol, 50)
          ]);

          const marketData = {
            symbol,
            price: parseFloat(symbolInfo.lastPrice),
            volume: parseFloat(symbolInfo.volume),
            change24h: parseFloat(symbolInfo.priceChangePercent),
            high24h: parseFloat(symbolInfo.highPrice),
            low24h: parseFloat(symbolInfo.lowPrice),
            timestamp: new Date()
          };

          // Generate comprehensive analysis
          const analysis = await this.analyzeMarketData(marketData, klineData5m, orderBook);
          console.log(`✅ Analysis completed for ${symbol}: ${analysis.recommendation} (${(analysis.confidence * 100).toFixed(1)}%)`);

          // Publish real-time update for immediate UI refresh
          await redisService.publish(`analysis:${symbol}`, {
            type: 'analysis_update',
            data: analysis
          });

        } catch (error) {
          console.error(`❌ Error analyzing ${symbol}:`, error);

          // Create a basic fallback analysis to ensure symbol appears
          const fallbackAnalysis = {
            symbol,
            recommendation: 'HOLD' as const,
            confidence: 0.3,
            reasoning: 'Analysis temporarily unavailable - market data accessible',
            timestamp: new Date(),
            individualAnalyses: [],
            analysisType: 'FALLBACK'
          };

          await redisService.cacheAnalysis(symbol, fallbackAnalysis);
          console.log(`🔄 Created fallback analysis for ${symbol}`);
        }
      });

      await Promise.all(batchPromises);

      // Delay between batches to respect API limits
      if (i + batchSize < normalizedSymbols.length) {
        console.log(`⏸️ Waiting ${delayBetweenBatches / 1000}s before next batch...`);
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }

    console.log(`🎉 Batch analysis completed for ${normalizedSymbols.length} symbols`);
  }

  async batchAnalyzeSymbols(symbols: string[]): Promise<Record<string, ConsolidatedAnalysis>> {
    const normalizedSymbols = symbols.map(s => s.toUpperCase());
    const results: Record<string, ConsolidatedAnalysis> = {};

    // Process in smaller batches to respect API rate limits
    const batchSize = 3; // Analyze 3 symbols at a time
    for (let i = 0; i < normalizedSymbols.length; i += batchSize) {
      const batch = normalizedSymbols.slice(i, i + batchSize);

      const batchPromises = batch.map(async (symbol) => {
        try {
          // Check cache first
          const cachedAnalysis = await redisService.getCurrentAnalysis(symbol);
          if (cachedAnalysis && this.isAnalysisRecent(cachedAnalysis, 120)) { // 2 minutes for batch
            results[symbol] = cachedAnalysis;
            return;
          }

          // For batch analysis, we'll use a simplified approach
          // In a real implementation, you'd want to optimize this further
          console.log(`Batch analysis for ${symbol} would require fresh market data`);

        } catch (error) {
          console.error(`Error in batch analysis for ${symbol}:`, error);
        }
      });

      await Promise.all(batchPromises);

      // Rate limiting delay between batches
      if (i + batchSize < normalizedSymbols.length) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
      }
    }

    return results;
  }

  // ===============================
  // CACHE MANAGEMENT
  // ===============================

  async clearAnalysisCache(symbol?: string): Promise<void> {
    try {
      if (symbol) {
        const normalizedSymbol = SymbolConverter.normalize(symbol);
        await redisService.flushByPattern(`*analysis*${normalizedSymbol}*`);
        await redisService.flushByPattern(`*signal*${normalizedSymbol}*`);
        console.log(`Analysis cache cleared for ${normalizedSymbol}`);
      } else {
        await redisService.flushByPattern('*analysis*');
        await redisService.flushByPattern('*signal*');
        console.log('All analysis cache cleared');
      }
    } catch (error) {
      console.error('Error clearing analysis cache:', error);
    }
  }

  async getAnalysisCacheStats(): Promise<any> {
    try {
      const analysisKeys = await redisService.getKeysByPattern('analysis:*');
      const signalKeys = await redisService.getKeysByPattern('signal:*');
      const modelKeys = await redisService.getKeysByPattern('ai_models:*');

      return {
        totalAnalyses: analysisKeys.length,
        totalSignals: signalKeys.length,
        cachedModelResponses: modelKeys.length,
        lastUpdated: new Date()
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return null;
    }
  }

  // ===============================
  // NEW ENHANCED ANALYSIS METHODS
  // ===============================

  async generateTimeframeSpecificAnalysis(
    marketData: MarketData,
    timeframeData: { [key: string]: any[] },
    orderBook: any,
    timeframe: string
  ): Promise<any> {
    const symbol = SymbolConverter.normalize(marketData.symbol);

    try {
      // Create timeframe-specific analysis prompt
      const prompt = this.generateTimeframeSpecificPrompt(marketData, timeframeData, orderBook, timeframe);

      // Get analysis from all models with timeframe focus
      const analyses = await Promise.all(
        this.models.map(async (model) => {
          return await this.getModelAnalysis(model, prompt);
        })
      );

      // Generate timeframe-specific consolidated analysis
      const consolidatedAnalysis = await this.consolidateTimeframeAnalysis(
        symbol,
        analyses,
        timeframe,
        timeframeData
      );

      return {
        ...consolidatedAnalysis,
        timeframe,
        timeframeType: this.getTimeframeType(timeframe),
        chartPatterns: this.identifyChartPatterns(timeframeData[timeframe] || []),
        keyLevels: this.calculateKeyLevels(timeframeData[timeframe] || []),
        volumeAnalysis: this.analyzeVolumeSignals(timeframeData[timeframe] || []),
        momentum: this.calculateTimeframeMomentum(timeframeData[timeframe] || [])
      };
    } catch (error) {
      console.error(`Error in timeframe-specific analysis for ${symbol} on ${timeframe}:`, error);
      throw error;
    }
  }

  async generateConsolidatedMultiTimeframeAnalysis(
    symbol: string,
    multiTimeframeData: any[]
  ): Promise<any> {
    try {
      // Create comprehensive multi-timeframe prompt
      const prompt = this.generateMultiTimeframeConsolidationPrompt(symbol, multiTimeframeData);

      // Get consolidated analysis from the most capable model
      const response = await axios.post<TogetherAIResponse>(
        this.baseURL,
        {
          model: this.models[1], // Use most capable model
          messages: [
            {
              role: 'system',
              content: 'You are a senior quantitative analyst specializing in multi-timeframe analysis. Provide institutional-grade trading recommendations with specific entry/exit strategies.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.05
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const content = response.data.choices[0].message.content;
      const consolidatedAnalysis = this.parseConsolidatedResponse(content);

      return {
        symbol,
        ...consolidatedAnalysis,
        multiTimeframeAlignment: this.assessMultiTimeframeAlignment(multiTimeframeData),
        confluentSignals: this.findConfluentSignals(multiTimeframeData),
        riskProfile: this.calculateMultiTimeframeRiskProfile(multiTimeframeData),
        optimalTimeframes: this.identifyOptimalTimeframes(multiTimeframeData),
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error in consolidated multi-timeframe analysis for ${symbol}:`, error);
      throw error;
    }
  }

  async generateRealTimeAnalysis(
    marketData: MarketData,
    shortTermData: { [key: string]: any[] },
    orderBook: any
  ): Promise<any> {
    const symbol = SymbolConverter.normalize(marketData.symbol);

    try {
      // Create real-time focused prompt
      const prompt = this.generateRealTimeAnalysisPrompt(marketData, shortTermData, orderBook);

      // Get rapid analysis from all models
      const analyses = await Promise.all(
        this.models.map(async (model) => {
          const analysis = await this.getModelAnalysis(model, prompt);
          return {
            ...analysis,
            model,
            urgency: this.calculateUrgencyScore(analysis),
            timeToAction: this.estimateTimeToAction(analysis)
          };
        })
      );

      // Create real-time consensus
      const realTimeConsensus = this.createRealTimeConsensus(analyses);

      return {
        symbol,
        consensus: realTimeConsensus,
        individualModels: analyses,
        marketConditions: this.assessCurrentMarketConditions(marketData, shortTermData, orderBook),
        immediateSignals: this.extractImmediateSignals(analyses),
        riskWarnings: this.generateRiskWarnings(marketData, analyses),
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error in real-time analysis for ${symbol}:`, error);
      throw error;
    }
  }

  async generateImmediateTradingSignals(
    symbol: string,
    marketData: MarketData,
    realTimeAnalysis: any
  ): Promise<any> {
    try {
      const signals = [];

      // Extract immediate action signals
      if (realTimeAnalysis.consensus.recommendation === 'BUY' &&
          realTimeAnalysis.consensus.confidence > 0.7) {
        signals.push({
          type: 'IMMEDIATE_BUY',
          confidence: realTimeAnalysis.consensus.confidence,
          targetPrice: realTimeAnalysis.consensus.targetPrice,
          stopLoss: realTimeAnalysis.consensus.stopLoss,
          timeWindow: '5-15 minutes',
          reasoning: realTimeAnalysis.consensus.reasoning
        });
      }

      if (realTimeAnalysis.consensus.recommendation === 'SELL' &&
          realTimeAnalysis.consensus.confidence > 0.7) {
        signals.push({
          type: 'IMMEDIATE_SELL',
          confidence: realTimeAnalysis.consensus.confidence,
          targetPrice: realTimeAnalysis.consensus.targetPrice,
          stopLoss: realTimeAnalysis.consensus.stopLoss,
          timeWindow: '5-15 minutes',
          reasoning: realTimeAnalysis.consensus.reasoning
        });
      }

      // Add risk management signals
      if (realTimeAnalysis.riskWarnings.length > 0) {
        signals.push({
          type: 'RISK_WARNING',
          level: 'HIGH',
          warnings: realTimeAnalysis.riskWarnings,
          action: 'REDUCE_POSITION_OR_WAIT'
        });
      }

      return {
        symbol,
        signals,
        signalCount: signals.length,
        hasImmediateAction: signals.some(s => s.type.includes('IMMEDIATE')),
        nextUpdate: new Date(Date.now() + 60000), // Next update in 1 minute
        timestamp: new Date()
      };
    } catch (error) {
      console.error(`Error generating immediate trading signals for ${symbol}:`, error);
      throw error;
    }
  }

  async getQuickAnalysis(symbol: string): Promise<any> {
    const normalizedSymbol = SymbolConverter.normalize(symbol);

    try {
      // Check for recent cached analysis first
      const cachedAnalysis = await redisService.getCurrentAnalysis(normalizedSymbol);
      if (cachedAnalysis && this.isAnalysisRecent(cachedAnalysis, 300)) { // 5 minutes for quick analysis
        return cachedAnalysis;
      }

      // Generate quick analysis if no recent cache
      const [symbolInfo, klineData5m] = await Promise.all([
        binanceService.getSymbolInfo(normalizedSymbol),
        binanceService.getKlineData(normalizedSymbol, '5m', 50)
      ]);

      const marketData = {
        symbol: normalizedSymbol,
        price: parseFloat(symbolInfo.lastPrice),
        volume: parseFloat(symbolInfo.volume),
        change24h: parseFloat(symbolInfo.priceChangePercent),
        high24h: parseFloat(symbolInfo.highPrice),
        low24h: parseFloat(symbolInfo.lowPrice),
        timestamp: new Date()
      };

      // Quick analysis using the fastest model
      const quickPrompt = this.generateQuickAnalysisPrompt(marketData, klineData5m);
      const quickAnalysis = await this.getModelAnalysis(this.models[0], quickPrompt);

      // Cache the quick analysis - convert LLMAnalysis to ConsolidatedAnalysis
      const consolidatedQuickAnalysis: ConsolidatedAnalysis = {
        symbol: normalizedSymbol,
        recommendation: quickAnalysis.recommendation,
        confidence: quickAnalysis.confidence,
        targetPrice: quickAnalysis.targetPrice,
        stopLoss: quickAnalysis.stopLoss,
        reasoning: quickAnalysis.reasoning,
        individualAnalyses: [quickAnalysis],
        timestamp: quickAnalysis.timestamp
      };
      await redisService.cacheAnalysis(normalizedSymbol, consolidatedQuickAnalysis);

      return quickAnalysis;
    } catch (error) {
      console.error(`Error in quick analysis for ${normalizedSymbol}:`, error);
      return {
        symbol: normalizedSymbol,
        recommendation: 'HOLD',
        confidence: 0.3,
        reasoning: 'Quick analysis unavailable',
        timestamp: new Date()
      };
    }
  }

  async getAnalysisOverlays(symbol: string, timeframe: string): Promise<any[]> {
    const normalizedSymbol = SymbolConverter.normalize(symbol);

    try {
      // Get recent analyses for this symbol and timeframe
      const analyses = await this.getRecentAnalyses(normalizedSymbol, 5);

      // Convert to chart overlay format
      return analyses.map(analysis => ({
        timestamp: new Date(analysis.timestamp).getTime(),
        price: analysis.targetPrice || 0,
        type: analysis.recommendation?.toLowerCase() || 'neutral',
        confidence: analysis.confidence || 0.5,
        reasoning: analysis.reasoning || '',
        model: 'Consolidated',
        active: this.isAnalysisRecent(analysis, 3600), // Active for 1 hour
        timeframe
      }));
    } catch (error) {
      console.error(`Error getting analysis overlays for ${normalizedSymbol}:`, error);
      return [];
    }
  }

  // ===============================
  // PRIVATE HELPER METHODS
  // ===============================

  private generateTimeframeSpecificPrompt(
    marketData: MarketData,
    timeframeData: { [key: string]: any[] },
    orderBook: any,
    timeframe: string
  ): string {
    const timeframeType = this.getTimeframeType(timeframe);
    const klineData = timeframeData[timeframe] || [];

    return `
      TIMEFRAME-SPECIFIC ANALYSIS for ${marketData.symbol} on ${timeframe} (${timeframeType}):

      === TIMEFRAME CONTEXT ===
      Analysis Focus: ${timeframeType}
      Candle Period: ${timeframe}
      Analysis Horizon: ${this.getAnalysisHorizon(timeframe)}

      === MARKET DATA ===
      Current Price: $${marketData.price}
      24h Change: ${marketData.change24h}%
      24h Volume: $${(parseFloat(String(marketData.volume)) / 1000000).toFixed(2)}M

      === ${timeframe.toUpperCase()} PRICE ACTION ===
      Recent Candles (${Math.min(klineData.length, 20)} periods):
      ${klineData.slice(-20).map((candle: any, i: number) =>
        `${i + 1}. O:${parseFloat(candle[1]).toFixed(4)} H:${parseFloat(candle[2]).toFixed(4)} L:${parseFloat(candle[3]).toFixed(4)} C:${parseFloat(candle[4]).toFixed(4)} V:${candle[5]}`
      ).join('\n')}

      === TIMEFRAME-SPECIFIC REQUIREMENTS ===
      ${this.getTimeframeSpecificRequirements(timeframe)}

      === ANALYSIS DELIVERABLES ===
      1. TIMEFRAME TREND: Overall direction on this timeframe
      2. KEY LEVELS: Support/resistance relevant to this timeframe
      3. PATTERN RECOGNITION: Chart patterns visible on this timeframe
      4. ENTRY/EXIT TIMING: Optimal timing for this timeframe
      5. RISK ASSESSMENT: Risk factors specific to this timeframe
      6. CONFLUENCE: How this timeframe aligns with others

      Provide specific, actionable insights for ${timeframe} trading.
    `;
  }

  private generateMultiTimeframeConsolidationPrompt(symbol: string, multiTimeframeData: any[]): string {
    return `
      MULTI-TIMEFRAME CONSOLIDATION ANALYSIS for ${symbol}:

      === TIMEFRAME BREAKDOWN ===
      ${multiTimeframeData.map(data => `
      ${data.timeframe.toUpperCase()}:
      - Trend: ${data.analysis?.technicalSetup || 'Unknown'}
      - Recommendation: ${data.analysis?.recommendation || 'Unknown'}
      - Confidence: ${data.analysis?.confidence ? (data.analysis.confidence * 100).toFixed(1) + '%' : 'Unknown'}
      - Key Insight: ${data.analysis?.reasoning?.substring(0, 100) || 'No insight available'}...
      `).join('\n')}

      === CONSOLIDATION REQUIREMENTS ===
      1. TREND ALIGNMENT: Assess agreement across timeframes
      2. OPTIMAL ENTRY TIMEFRAME: Which timeframe offers best entry
      3. RISK CONFLUENCE: Where multiple timeframes agree on risk
      4. TIMING STRATEGY: When to enter based on timeframe confluence
      5. POSITION SIZING: Recommended size based on timeframe agreement
      6. EXIT STRATEGY: Multi-timeframe exit approach

      Provide a consolidated recommendation that maximizes timeframe confluence and minimizes conflicting signals.
    `;
  }

  private generateRealTimeAnalysisPrompt(
    marketData: MarketData,
    shortTermData: { [key: string]: any[] },
    orderBook: any
  ): string {
    const current1m = shortTermData['1m'] || [];
    const current5m = shortTermData['5m'] || [];

    return `
      REAL-TIME SCALPING ANALYSIS for ${marketData.symbol}:

      === IMMEDIATE MARKET CONDITIONS ===
      Current Price: $${marketData.price}
      Last 1m Candles: ${current1m.slice(-5).map((c: any) => `${parseFloat(c[4]).toFixed(4)}`).join(' → ')}
      Last 5m Candles: ${current5m.slice(-3).map((c: any) => `${parseFloat(c[4]).toFixed(4)}`).join(' → ')}

      === ORDER BOOK PRESSURE ===
      Best Bid: $${orderBook.bids?.[0]?.[0] || 'N/A'} (${orderBook.bids?.[0]?.[1] || 'N/A'})
      Best Ask: $${orderBook.asks?.[0]?.[0] || 'N/A'} (${orderBook.asks?.[0]?.[1] || 'N/A'})

      === IMMEDIATE ACTION REQUIREMENTS ===
      Time Horizon: NEXT 5-15 MINUTES
      Focus: SCALPING OPPORTUNITIES
      Risk Tolerance: VERY LOW (tight stops required)

      === CRITICAL QUESTIONS ===
      1. Is there an IMMEDIATE trading opportunity RIGHT NOW?
      2. What is the exact entry price and timing?
      3. Where should stop-loss be placed (max 0.5% risk)?
      4. What is the realistic profit target (0.3-1.0% gain)?
      5. How urgent is this signal (1-10 scale)?

      ONLY recommend BUY/SELL if you see a clear, high-probability setup forming NOW.
      If uncertain, recommend WAIT with specific conditions to watch for.
    `;
  }

  private generateQuickAnalysisPrompt(marketData: MarketData, klineData: any[]): string {
    return `
      QUICK MARKET SCAN for ${marketData.symbol}:

      Price: $${marketData.price} (${marketData.change24h}% 24h)
      Volume: $${(parseFloat(String(marketData.volume)) / 1000000).toFixed(1)}M
      Recent 5m action: ${klineData.slice(-3).map((c: any) => parseFloat(c[4]).toFixed(4)).join(' → ')}

      Quick assessment (30 words max):
      - Direction: UP/DOWN/SIDEWAYS
      - Strength: STRONG/WEAK/NEUTRAL
      - Action: BUY/SELL/HOLD
      - Risk: HIGH/MEDIUM/LOW
    `;
  }

  private getTimeframeType(timeframe: string): string {
    const types: any = {
      '1m': 'ULTRA_SHORT_TERM',
      '5m': 'SHORT_TERM',
      '15m': 'SHORT_TERM',
      '1h': 'MEDIUM_TERM',
      '4h': 'MEDIUM_TERM',
      '1d': 'LONG_TERM',
      '1w': 'LONG_TERM',
      '1M': 'VERY_LONG_TERM'
    };
    return types[timeframe] || 'UNKNOWN';
  }

  private getAnalysisHorizon(timeframe: string): string {
    const horizons: any = {
      '1m': '5-15 minutes',
      '5m': '30-60 minutes',
      '15m': '2-4 hours',
      '1h': '6-12 hours',
      '4h': '1-3 days',
      '1d': '1-2 weeks',
      '1w': '1-2 months',
      '1M': '3-6 months'
    };
    return horizons[timeframe] || 'Variable';
  }

  private getTimeframeSpecificRequirements(timeframe: string): string {
    const requirements: any = {
      '1m': 'Focus on immediate price action, scalping opportunities, tight risk management',
      '5m': 'Short-term momentum, quick reversals, entry/exit precision',
      '15m': 'Swing trading setups, pattern completion, trend continuation',
      '1h': 'Medium-term trend analysis, significant support/resistance levels',
      '4h': 'Daily trend direction, major pattern formation, position trading',
      '1d': 'Weekly trend analysis, long-term support/resistance, investment decisions',
      '1w': 'Monthly trend direction, major market cycles, portfolio allocation',
      '1M': 'Long-term investment outlook, macro trend analysis, strategic positioning'
    };
    return requirements[timeframe] || 'General market analysis';
  }

  private consolidateTimeframeAnalysis(
    symbol: string,
    analyses: LLMAnalysis[],
    timeframe: string,
    timeframeData: { [key: string]: any[] }
  ): any {
    // Simple consolidation for timeframe-specific analysis
    const buyCount = analyses.filter(a => a.recommendation === 'BUY').length;
    const sellCount = analyses.filter(a => a.recommendation === 'SELL').length;
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;

    let finalRecommendation: 'BUY' | 'SELL' | 'HOLD';
    if (buyCount > sellCount) {
      finalRecommendation = 'BUY';
    } else if (sellCount > buyCount) {
      finalRecommendation = 'SELL';
    } else {
      finalRecommendation = 'HOLD';
    }

    return {
      symbol,
      timeframe,
      recommendation: finalRecommendation,
      confidence: avgConfidence,
      reasoning: `Timeframe-specific analysis for ${timeframe}: ${buyCount} BUY, ${sellCount} SELL signals`,
      technicalSetup: this.determineTechnicalSetup(analyses),
      individualAnalyses: analyses,
      timestamp: new Date()
    };
  }

  private assessMultiTimeframeAlignment(multiTimeframeData: any[]): any {
    const recommendations = multiTimeframeData
      .filter(data => !data.error && data.analysis)
      .map(data => data.analysis.recommendation);

    const buyCount = recommendations.filter(r => r === 'BUY').length;
    const sellCount = recommendations.filter(r => r === 'SELL').length;
    const totalCount = recommendations.length;

    return {
      alignment: buyCount > sellCount ? 'BULLISH' : sellCount > buyCount ? 'BEARISH' : 'NEUTRAL',
      strength: Math.abs(buyCount - sellCount) / totalCount,
      consensus: Math.max(buyCount, sellCount) / totalCount,
      conflictingSignals: totalCount - Math.max(buyCount, sellCount),
      recommendation: totalCount > 0 ? (buyCount > sellCount ? 'BUY' : sellCount > buyCount ? 'SELL' : 'HOLD') : 'HOLD'
    };
  }

  private findConfluentSignals(multiTimeframeData: any[]): any[] {
    // Find signals that appear across multiple timeframes
    const signals: any[] = [];

    // Check for trend alignment
    const trends = multiTimeframeData
      .filter(data => !data.error && data.analysis)
      .map(data => ({
        timeframe: data.timeframe,
        trend: data.analysis.technicalSetup
      }));

    if (trends.filter(t => t.trend?.includes('BULLISH')).length >= 3) {
      signals.push({
        type: 'BULLISH_CONFLUENCE',
        strength: 'HIGH',
        timeframes: trends.filter(t => t.trend?.includes('BULLISH')).map(t => t.timeframe)
      });
    }

    if (trends.filter(t => t.trend?.includes('BEARISH')).length >= 3) {
      signals.push({
        type: 'BEARISH_CONFLUENCE',
        strength: 'HIGH',
        timeframes: trends.filter(t => t.trend?.includes('BEARISH')).map(t => t.timeframe)
      });
    }

    return signals;
  }

  private calculateMultiTimeframeRiskProfile(multiTimeframeData: any[]): any {
    const confidences = multiTimeframeData
      .filter(data => !data.error && data.analysis)
      .map(data => data.analysis.confidence || 0.5);

    const avgConfidence = confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
    const confidenceVariance = this.calculateStandardDeviation(confidences);

    return {
      averageConfidence: avgConfidence,
      confidenceVariance: confidenceVariance,
      riskLevel: avgConfidence > 0.7 && confidenceVariance < 0.2 ? 'LOW' :
                 avgConfidence > 0.5 && confidenceVariance < 0.3 ? 'MEDIUM' : 'HIGH',
      recommendation: avgConfidence > 0.7 ? 'PROCEED' : avgConfidence > 0.5 ? 'CAUTION' : 'AVOID'
    };
  }

  private identifyOptimalTimeframes(multiTimeframeData: any[]): string[] {
    return multiTimeframeData
      .filter(data => !data.error && data.analysis && data.analysis.confidence > 0.6)
      .sort((a, b) => (b.analysis.confidence || 0) - (a.analysis.confidence || 0))
      .slice(0, 3)
      .map(data => data.timeframe);
  }

  private calculateUrgencyScore(analysis: LLMAnalysis): number {
    let urgency = 0;

    // Debug logging for undefined reasoning
    if (analysis.reasoning === undefined || analysis.reasoning === null) {
      console.warn(`[DEBUG] calculateUrgencyScore: reasoning is ${analysis.reasoning} for model ${analysis.model}. Full analysis:`, JSON.stringify(analysis));
    }

    // High confidence adds urgency
    if (analysis.confidence > 0.8) urgency += 3;
    else if (analysis.confidence > 0.6) urgency += 2;
    else if (analysis.confidence > 0.4) urgency += 1;

    // Strong recommendations add urgency
    if (analysis.recommendation === 'BUY' || analysis.recommendation === 'SELL') {
      urgency += 2;
    }

    // Certain keywords in reasoning add urgency
    const urgentKeywords = ['immediate', 'breakout', 'urgent', 'now', 'quickly'];
    const reasoning = analysis.reasoning?.toLowerCase() || '';
    urgentKeywords.forEach(keyword => {
      if (reasoning.includes(keyword)) urgency += 1;
    });

    return Math.min(urgency, 10);
  }

  private estimateTimeToAction(analysis: LLMAnalysis): string {
    const urgency = this.calculateUrgencyScore(analysis);

    if (urgency >= 7) return 'IMMEDIATE (1-5 min)';
    if (urgency >= 5) return 'SOON (5-15 min)';
    if (urgency >= 3) return 'SHORT TERM (15-60 min)';
    return 'MEDIUM TERM (1-4 hours)';
  }

  private createRealTimeConsensus(analyses: LLMAnalysis[]): any {
    const buyCount = analyses.filter(a => a.recommendation === 'BUY').length;
    const sellCount = analyses.filter(a => a.recommendation === 'SELL').length;
    const avgConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length;
    const avgUrgency = analyses.reduce((sum, a) => this.calculateUrgencyScore(a), 0) / analyses.length;

    let consensus: 'BUY' | 'SELL' | 'HOLD';
    if (buyCount > sellCount) {
      consensus = 'BUY';
    } else if (sellCount > buyCount) {
      consensus = 'SELL';
    } else {
      consensus = 'HOLD';
    }

    return {
      recommendation: consensus,
      confidence: avgConfidence,
      urgency: avgUrgency,
      modelAgreement: Math.max(buyCount, sellCount) / analyses.length,
      timeToAction: this.estimateTimeToAction({ confidence: avgConfidence } as LLMAnalysis),
      reasoning: `Real-time consensus: ${buyCount} BUY, ${sellCount} SELL signals with ${(avgConfidence * 100).toFixed(1)}% confidence`
    };
  }

  private assessCurrentMarketConditions(marketData: MarketData, shortTermData: any, orderBook: any): any {
    const spread = orderBook.asks?.[0] && orderBook.bids?.[0] ?
      ((parseFloat(orderBook.asks[0][0]) - parseFloat(orderBook.bids[0][0])) / parseFloat(orderBook.asks[0][0])) * 100 : 0;

    return {
      volatility: ((marketData.high24h - marketData.low24h) / marketData.price) * 100,
      spread: spread,
      liquidity: orderBook.bids?.length + orderBook.asks?.length || 0,
      volume24h: marketData.volume,
      priceAction: marketData.change24h > 0 ? 'BULLISH' : 'BEARISH',
      tradingCondition: spread < 0.1 && marketData.volume > 1000000 ? 'EXCELLENT' : 'FAIR'
    };
  }

  private extractImmediateSignals(analyses: LLMAnalysis[]): any[] {
    return analyses
      .filter(analysis => this.calculateUrgencyScore(analysis) >= 6)
      .map(analysis => {
        // Debug logging for undefined reasoning
        if (analysis.reasoning === undefined || analysis.reasoning === null) {
          console.warn(`[DEBUG] extractImmediateSignals: reasoning is ${analysis.reasoning} for model ${analysis.model}. Full analysis:`, JSON.stringify(analysis));
        }

        return {
          model: analysis.model,
          signal: analysis.recommendation,
          urgency: this.calculateUrgencyScore(analysis),
          confidence: analysis.confidence,
          reasoning: (analysis.reasoning || 'No reasoning provided').substring(0, 100) + '...'
        };
      });
  }

  private generateRiskWarnings(marketData: MarketData, analyses: LLMAnalysis[]): string[] {
    const warnings: string[] = [];

    // High volatility warning
    const volatility = ((marketData.high24h - marketData.low24h) / marketData.price) * 100;
    if (volatility > 15) {
      warnings.push(`High volatility detected: ${volatility.toFixed(1)}% daily range`);
    }

    // Low volume warning
    if (marketData.volume * marketData.price < 1000000) {
      warnings.push('Low liquidity warning: Volume below $1M may cause slippage');
    }

    // Conflicting signals warning
    const buyCount = analyses.filter(a => a.recommendation === 'BUY').length;
    const sellCount = analyses.filter(a => a.recommendation === 'SELL').length;
    if (Math.abs(buyCount - sellCount) <= 1 && analyses.length >= 4) {
      warnings.push('Mixed signals: Models show conflicting recommendations');
    }

    return warnings;
  }

  private identifyChartPatterns(klineData: any[]): any[] {
    if (klineData.length < 20) return [];

    const patterns: any[] = [];
    const closes = klineData.map(c => parseFloat(c[4]));
    const highs = klineData.map(c => parseFloat(c[2]));
    const lows = klineData.map(c => parseFloat(c[3]));

    // Simple pattern recognition
    const recentCloses = closes.slice(-10);
    const isUptrend = recentCloses[recentCloses.length - 1] > recentCloses[0];
    const isDowntrend = recentCloses[recentCloses.length - 1] < recentCloses[0];

    if (isUptrend) {
      patterns.push({
        type: 'UPTREND',
        strength: 'MEDIUM',
        timeframe: 'SHORT_TERM'
      });
    }

    if (isDowntrend) {
      patterns.push({
        type: 'DOWNTREND',
        strength: 'MEDIUM',
        timeframe: 'SHORT_TERM'
      });
    }

    return patterns;
  }

  private calculateKeyLevels(klineData: any[]): any {
    if (klineData.length < 10) return { support: [], resistance: [] };

    const highs = klineData.map(c => parseFloat(c[2]));
    const lows = klineData.map(c => parseFloat(c[3]));

    const recentHighs = highs.slice(-20);
    const recentLows = lows.slice(-20);

    return {
      support: [Math.min(...recentLows)],
      resistance: [Math.max(...recentHighs)],
      current: klineData[klineData.length - 1] ? parseFloat(klineData[klineData.length - 1][4]) : 0
    };
  }

  private analyzeVolumeSignals(klineData: any[]): any {
    if (klineData.length < 10) return { trend: 'NEUTRAL', strength: 0 };

    const volumes = klineData.map(c => parseFloat(c[5]));
    const recentVolumes = volumes.slice(-5);
    const avgVolume = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    const currentVolume = recentVolumes[recentVolumes.length - 1];

    return {
      trend: currentVolume > avgVolume ? 'INCREASING' : 'DECREASING',
      strength: Math.abs(currentVolume - avgVolume) / avgVolume,
      ratio: currentVolume / avgVolume
    };
  }

  private calculateTimeframeMomentum(klineData: any[]): any {
    if (klineData.length < 10) return { value: 0, direction: 'NEUTRAL' };

    const prices = klineData.map(c => parseFloat(c[4]));
    const momentum = this.calculateMomentum(prices, Math.min(10, prices.length - 1));

    return {
      value: momentum,
      direction: momentum > 1 ? 'BULLISH' : momentum < -1 ? 'BEARISH' : 'NEUTRAL',
      strength: Math.abs(momentum)
    };
  }

  private determineTechnicalSetup(analyses: LLMAnalysis[]): string {
    const buyCount = analyses.filter(a => a.recommendation === 'BUY').length;
    const sellCount = analyses.filter(a => a.recommendation === 'SELL').length;

    if (buyCount > sellCount) return 'BULLISH_SETUP';
    if (sellCount > buyCount) return 'BEARISH_SETUP';
    return 'NEUTRAL_SETUP';
  }

  // ===============================
  // DATA VALIDATION AND SANITIZATION
  // ===============================

  private validateLLMAnalysis(analysis: any): LLMAnalysis {
    // Validate and sanitize LLMAnalysis object to ensure all required properties exist
    const validatedAnalysis: LLMAnalysis = {
      model: analysis?.model || 'unknown',
      recommendation: this.validateRecommendation(analysis?.recommendation),
      confidence: this.validateConfidence(analysis?.confidence),
      reasoning: analysis?.reasoning || 'No reasoning provided',
      targetPrice: analysis?.targetPrice && typeof analysis.targetPrice === 'number' ? analysis.targetPrice : undefined,
      stopLoss: analysis?.stopLoss && typeof analysis.stopLoss === 'number' ? analysis.stopLoss : undefined,
      timestamp: analysis?.timestamp ? new Date(analysis.timestamp) : new Date()
    };

    // Log if we had to apply fallbacks
    if (analysis?.reasoning === undefined || analysis?.reasoning === null) {
      console.warn(`LLMAnalysis missing reasoning for model ${validatedAnalysis.model}, using fallback`);
    }

    return validatedAnalysis;
  }

  private validateRecommendation(recommendation: any): 'BUY' | 'SELL' | 'HOLD' {
    const validRecommendations = ['BUY', 'SELL', 'HOLD'];
    if (typeof recommendation === 'string' && validRecommendations.includes(recommendation.toUpperCase())) {
      return recommendation.toUpperCase() as 'BUY' | 'SELL' | 'HOLD';
    }
    return 'HOLD';
  }

  private validateConfidence(confidence: any): number {
    if (typeof confidence === 'number' && confidence >= 0 && confidence <= 1) {
      return confidence;
    }
    return 0.5; // Default to neutral confidence
  }

  validateLLMAnalysisArray(analyses: any[]): LLMAnalysis[] {
    if (!Array.isArray(analyses)) {
      console.warn('Expected array of LLMAnalysis objects, got:', typeof analyses);
      return [];
    }

    return analyses.map(analysis => this.validateLLMAnalysis(analysis));
  }
}

export const aiAnalysisService = new AIAnalysisService();