import { okxService } from './okxService';
import { binanceService } from './binanceService';
import { redisService } from './redisService';
import { coinFilteringService } from './coinFilteringService';
import { profitScoringService } from './profitScoringService';
import { ScalpingAgent } from '../models';
import { SymbolConverter } from '../utils/symbolConverter';

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  adjustedAmount?: number;
  estimatedCost?: number;
  estimatedFees?: number;
  slippageEstimate?: number;
  profitPotential?: number;
}

interface TradeRequest {
  userId: string;
  agentId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface RiskLimits {
  maxPositionSize: number;
  maxDailyVolume: number;
  maxDailyLoss: number;
  minProfitPotential: number;
  maxSlippage: number;
  minLiquidity: number;
}

export class PreTradeValidationService {
  private defaultRiskLimits: RiskLimits = {
    maxPositionSize: 1000, // $1000 max position
    maxDailyVolume: 10000, // $10k daily volume limit
    maxDailyLoss: 500,     // $500 max daily loss
    minProfitPotential: 0.3, // 0.3% minimum profit potential
    maxSlippage: 0.5,      // 0.5% max acceptable slippage
    minLiquidity: 50000    // $50k minimum liquidity
  };

  async validateTrade(tradeRequest: TradeRequest): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: []
    };

    try {
      // Step 1: Basic input validation
      await this.validateBasicInputs(tradeRequest, result);

      if (!result.isValid) return result;

      // Step 2: Symbol and market validation
      await this.validateSymbolAndMarket(tradeRequest, result);

      if (!result.isValid) return result;

      // Step 3: Account and balance validation
      await this.validateAccountBalance(tradeRequest, result);

      // Step 4: Risk limits validation
      await this.validateRiskLimits(tradeRequest, result);

      // Step 5: Market conditions validation
      await this.validateMarketConditions(tradeRequest, result);

      // Step 6: Profit potential analysis
      await this.validateProfitPotential(tradeRequest, result);

      // Step 7: Calculate estimates
      await this.calculateTradeEstimates(tradeRequest, result);

    } catch (error) {
      console.error('Error during trade validation:', error);
      result.isValid = false;
      result.errors.push('Validation service error occurred');
    }

    return result;
  }

  private async validateBasicInputs(request: TradeRequest, result: ValidationResult): Promise<void> {
    // Validate required fields
    if (!request.userId) {
      result.errors.push('User ID is required');
      result.isValid = false;
    }

    if (!request.symbol) {
      result.errors.push('Symbol is required');
      result.isValid = false;
    }

    if (!['buy', 'sell'].includes(request.side)) {
      result.errors.push('Side must be "buy" or "sell"');
      result.isValid = false;
    }

    if (!['market', 'limit'].includes(request.type)) {
      result.errors.push('Type must be "market" or "limit"');
      result.isValid = false;
    }

    if (!request.amount || request.amount <= 0) {
      result.errors.push('Amount must be greater than 0');
      result.isValid = false;
    }

    if (request.type === 'limit' && (!request.price || request.price <= 0)) {
      result.errors.push('Price is required for limit orders');
      result.isValid = false;
    }

    // Validate symbol format
    if (request.symbol && !SymbolConverter.isValidTradingPair(request.symbol)) {
      result.errors.push('Invalid trading symbol format');
      result.isValid = false;
    }
  }

  private async validateSymbolAndMarket(request: TradeRequest, result: ValidationResult): Promise<void> {
    try {
      const normalizedSymbol = SymbolConverter.normalize(request.symbol);

      // Check if symbol exists and is tradeable
      const [binanceSymbol, okxSymbols] = await Promise.all([
        binanceService.getSymbolInfo(normalizedSymbol).catch(() => null),
        okxService.getSymbols().catch(() => [])
      ]);

      if (!binanceSymbol) {
        result.errors.push(`Symbol ${normalizedSymbol} not found on Binance`);
        result.isValid = false;
      }

      const okxSymbol = SymbolConverter.toOKXFormat(normalizedSymbol);
      if (!(okxSymbols as string[]).includes(okxSymbol)) {
        result.errors.push(`Symbol ${okxSymbol} not available on OKX`);
        result.isValid = false;
      }

      // Check if market is currently active
      if (binanceSymbol) {
        const changePercent = Math.abs(parseFloat(binanceSymbol.priceChangePercent));
        if (changePercent > 20) {
          result.warnings.push(`High volatility detected: ${changePercent.toFixed(2)}% in 24h`);
        }

        const volume = parseFloat(binanceSymbol.quoteVolume);
        if (volume < 1000000) { // Less than $1M volume
          result.warnings.push(`Low trading volume: $${(volume / 1000000).toFixed(2)}M`);
        }
      }
    } catch (error) {
      result.errors.push('Unable to validate symbol and market data');
      result.isValid = false;
    }
  }

  private async validateAccountBalance(request: TradeRequest, result: ValidationResult): Promise<void> {
    try {
      const balance = await okxService.getBalance(request.userId);

      if (!balance || !balance.length) {
        result.errors.push('Unable to retrieve account balance');
        result.isValid = false;
        return;
      }

      // Find USDT balance (assuming USDT trading)
      const usdtBalance = balance.find((asset: any) =>
        asset.ccy === 'USDT' || asset.currency === 'USDT'
      );

      if (!usdtBalance) {
        result.errors.push('No USDT balance found');
        result.isValid = false;
        return;
      }

      const availableBalance = parseFloat(usdtBalance.availBal || usdtBalance.available || '0');

      if (request.side === 'buy') {
        // For buy orders, check if we have enough USDT
        const estimatedCost = request.amount * (request.price || 0);

        if (estimatedCost > availableBalance) {
          result.errors.push(`Insufficient balance. Required: $${estimatedCost.toFixed(2)}, Available: $${availableBalance.toFixed(2)}`);
          result.isValid = false;
        } else if (estimatedCost > availableBalance * 0.9) {
          result.warnings.push('Using more than 90% of available balance');
        }
      }

      // Add available balance info
      result.warnings.push(`Available USDT balance: $${availableBalance.toFixed(2)}`);

    } catch (error) {
      result.errors.push('Unable to validate account balance');
      result.isValid = false;
    }
  }

  private async validateRiskLimits(request: TradeRequest, result: ValidationResult): Promise<void> {
    try {
      let riskLimits = this.defaultRiskLimits;

      // Get agent-specific risk limits if agent is provided
      if (request.agentId) {
        const agent = await ScalpingAgent.findById(request.agentId);
        if (agent && (agent as any).riskManagement) {
          const riskMgmt = (agent as any).riskManagement;
          riskLimits = {
            ...this.defaultRiskLimits,
            maxPositionSize: riskMgmt.maxPositionSize || this.defaultRiskLimits.maxPositionSize,
            maxDailyVolume: riskMgmt.maxDailyVolume || this.defaultRiskLimits.maxDailyVolume,
            maxDailyLoss: riskMgmt.maxDailyLoss || this.defaultRiskLimits.maxDailyLoss
          };
        }
      }

      // Check position size
      const estimatedValue = request.amount * (request.price || 50000); // Rough estimate
      if (estimatedValue > riskLimits.maxPositionSize) {
        result.errors.push(`Position size $${estimatedValue.toFixed(2)} exceeds limit of $${riskLimits.maxPositionSize}`);
        result.isValid = false;
      }

      // Check daily volume limit
      const todayKey = `daily_volume:${request.userId}:${new Date().toISOString().split('T')[0]}`;
      const dailyVolume = parseFloat(await redisService.get(todayKey) || '0');

      if (dailyVolume + estimatedValue > riskLimits.maxDailyVolume) {
        result.errors.push(`Daily volume limit exceeded. Current: $${dailyVolume.toFixed(2)}, Limit: $${riskLimits.maxDailyVolume}`);
        result.isValid = false;
      }

      // Check daily loss limit
      const todayLossKey = `daily_loss:${request.userId}:${new Date().toISOString().split('T')[0]}`;
      const dailyLoss = parseFloat(await redisService.get(todayLossKey) || '0');

      if (dailyLoss > riskLimits.maxDailyLoss) {
        result.errors.push(`Daily loss limit exceeded: $${dailyLoss.toFixed(2)}`);
        result.isValid = false;
      } else if (dailyLoss > riskLimits.maxDailyLoss * 0.8) {
        result.warnings.push(`Approaching daily loss limit: $${dailyLoss.toFixed(2)} / $${riskLimits.maxDailyLoss}`);
      }

    } catch (error) {
      result.warnings.push('Unable to validate all risk limits');
    }
  }

  private async validateMarketConditions(request: TradeRequest, result: ValidationResult): Promise<void> {
    try {
      const normalizedSymbol = SymbolConverter.normalize(request.symbol);

      // Get current market data
      const [orderBook, ticker] = await Promise.all([
        binanceService.getOrderBook(normalizedSymbol, 20),
        binanceService.getSymbolInfo(normalizedSymbol)
      ]);

      if (!orderBook || !ticker) {
        result.warnings.push('Unable to retrieve complete market data');
        return;
      }

      // Check spread
      const bestBid = parseFloat(orderBook.bids[0][0]);
      const bestAsk = parseFloat(orderBook.asks[0][0]);
      const spread = ((bestAsk - bestBid) / bestBid) * 100;

      if (spread > 0.1) { // 0.1% spread
        result.warnings.push(`Wide spread detected: ${spread.toFixed(3)}%`);
      }

      // Check liquidity depth
      const bidDepth = orderBook.bids.slice(0, 10).reduce((sum: number, bid: any) =>
        sum + parseFloat(bid[1]) * parseFloat(bid[0]), 0);
      const askDepth = orderBook.asks.slice(0, 10).reduce((sum: number, ask: any) =>
        sum + parseFloat(ask[1]) * parseFloat(ask[0]), 0);

      const totalLiquidity = bidDepth + askDepth;

      if (totalLiquidity < this.defaultRiskLimits.minLiquidity) {
        result.warnings.push(`Low liquidity: $${totalLiquidity.toFixed(0)}`);
      }

      // Check if market is moving too fast
      const priceChange = Math.abs(parseFloat(ticker.priceChangePercent));
      if (priceChange > 10) {
        result.warnings.push(`Rapid price movement: ${priceChange.toFixed(2)}% in 24h`);
      }

    } catch (error) {
      result.warnings.push('Unable to validate market conditions');
    }
  }

  private async validateProfitPotential(request: TradeRequest, result: ValidationResult): Promise<void> {
    try {
      const normalizedSymbol = SymbolConverter.normalize(request.symbol);

      // Get profit scoring for the symbol
      const opportunities = await profitScoringService.scoreProfitOpportunities([normalizedSymbol]);

      if (opportunities.length > 0) {
        const opportunity = opportunities[0];
        result.profitPotential = opportunity.expectedReturn;

        if (opportunity.expectedReturn < this.defaultRiskLimits.minProfitPotential) {
          result.warnings.push(`Low profit potential: ${opportunity.expectedReturn.toFixed(2)}%`);
        }

        if (opportunity.confidence < 0.6) {
          result.warnings.push(`Low confidence in analysis: ${(opportunity.confidence * 100).toFixed(0)}%`);
        }

        if (opportunity.riskLevel === 'HIGH') {
          result.warnings.push('High risk opportunity detected');
        }
      } else {
        result.warnings.push('Unable to assess profit potential');
      }

    } catch (error) {
      result.warnings.push('Unable to validate profit potential');
    }
  }

  private async calculateTradeEstimates(request: TradeRequest, result: ValidationResult): Promise<void> {
    try {
      const normalizedSymbol = SymbolConverter.normalize(request.symbol);

      // Get current market price
      const ticker = await binanceService.getSymbolInfo(normalizedSymbol);
      if (!ticker) return;

      const currentPrice = parseFloat(ticker.lastPrice);
      const executionPrice = request.price || currentPrice;

      // Calculate estimated costs
      result.estimatedCost = request.amount * executionPrice;

      // Estimate fees (assuming 0.1% trading fee)
      result.estimatedFees = result.estimatedCost * 0.001;

      // Estimate slippage for market orders
      if (request.type === 'market') {
        const orderBook = await binanceService.getOrderBook(normalizedSymbol, 10);
        if (orderBook) {
          // Simple slippage estimation based on order book depth
          const side = request.side === 'buy' ? orderBook.asks : orderBook.bids;
          let remainingAmount = request.amount;
          let totalCost = 0;

          for (const level of side) {
            const levelPrice = parseFloat(level[0]);
            const levelQuantity = parseFloat(level[1]);

            if (remainingAmount <= levelQuantity) {
              totalCost += remainingAmount * levelPrice;
              break;
            } else {
              totalCost += levelQuantity * levelPrice;
              remainingAmount -= levelQuantity;
            }
          }

          const avgPrice = totalCost / request.amount;
          const slippage = Math.abs((avgPrice - currentPrice) / currentPrice) * 100;
          result.slippageEstimate = slippage;

          if (slippage > this.defaultRiskLimits.maxSlippage) {
            result.warnings.push(`High slippage estimate: ${slippage.toFixed(3)}%`);
          }
        }
      }

      // Adjust amount if needed based on minimum trade size
      const minTradeValue = 10; // $10 minimum
      if (result.estimatedCost < minTradeValue) {
        result.warnings.push(`Trade value $${result.estimatedCost.toFixed(2)} below minimum $${minTradeValue}`);
        result.adjustedAmount = minTradeValue / executionPrice;
      }

    } catch (error) {
      result.warnings.push('Unable to calculate trade estimates');
    }
  }

  // Get user's current trading limits
  async getUserTradingLimits(userId: string): Promise<RiskLimits> {
    try {
      // This could be expanded to get user-specific limits from database
      const userLimitsKey = `user_limits:${userId}`;
      const cachedLimits = await redisService.get(userLimitsKey);

      if (cachedLimits) {
        return { ...this.defaultRiskLimits, ...JSON.parse(cachedLimits) };
      }

      return this.defaultRiskLimits;
    } catch (error) {
      return this.defaultRiskLimits;
    }
  }

  // Update user's daily trading statistics
  async updateDailyStats(userId: string, tradeValue: number, pnl: number = 0): Promise<void> {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Update daily volume
      const volumeKey = `daily_volume:${userId}:${today}`;
      const currentVolume = parseFloat(await redisService.get(volumeKey) || '0');
      await redisService.set(volumeKey, (currentVolume + tradeValue).toString(), 86400); // 24 hour TTL

      // Update daily P&L
      if (pnl !== 0) {
        const pnlKey = `daily_pnl:${userId}:${today}`;
        const currentPnl = parseFloat(await redisService.get(pnlKey) || '0');
        await redisService.set(pnlKey, (currentPnl + pnl).toString(), 86400);

        // Update daily loss if it's a loss
        if (pnl < 0) {
          const lossKey = `daily_loss:${userId}:${today}`;
          const currentLoss = parseFloat(await redisService.get(lossKey) || '0');
          await redisService.set(lossKey, (currentLoss + Math.abs(pnl)).toString(), 86400);
        }
      }

    } catch (error) {
      console.error('Error updating daily stats:', error);
    }
  }

  // Get user's daily trading summary
  async getDailyTradingSummary(userId: string): Promise<{
    volume: number;
    pnl: number;
    loss: number;
    tradesCount: number;
  }> {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [volume, pnl, loss] = await Promise.all([
        redisService.get(`daily_volume:${userId}:${today}`),
        redisService.get(`daily_pnl:${userId}:${today}`),
        redisService.get(`daily_loss:${userId}:${today}`)
      ]);

      return {
        volume: parseFloat(volume || '0'),
        pnl: parseFloat(pnl || '0'),
        loss: parseFloat(loss || '0'),
        tradesCount: 0 // Could be tracked separately
      };
    } catch (error) {
      return { volume: 0, pnl: 0, loss: 0, tradesCount: 0 };
    }
  }
}

export const preTradeValidationService = new PreTradeValidationService();