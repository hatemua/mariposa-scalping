import axios from 'axios';
import { config } from '../config/environment';
import { LLMAnalysis, ConsolidatedAnalysis, MarketData } from '../types';
import { ConsolidatedAnalysis as AnalysisModel } from '../models';
import { redisService } from './redisService';
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
}

export const aiAnalysisService = new AIAnalysisService();