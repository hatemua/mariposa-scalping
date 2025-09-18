import { redisService } from './redisService';
import { preTradeValidationService } from './preTradeValidationService';
import { okxService } from './okxService';
import { orderTrackingService } from './orderTrackingService';
import { tradingSignalService } from './tradingSignalService';
import { ScalpingAgent } from '../models';
import { SymbolConverter } from '../utils/symbolConverter';

interface OrderPreview {
  id: string;
  userId: string;
  agentId?: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  amount: number;
  price?: number;
  estimatedCost: number;
  estimatedFees: number;
  slippageEstimate?: number;
  profitPotential?: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  validationResult: any;
  expiresAt: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'executed';
  createdAt: number;
}

interface ConfirmationSettings {
  requireConfirmation: boolean;
  confirmationTimeout: number; // in seconds
  autoConfirmBelowAmount: number; // auto-confirm orders below this amount
  manualConfirmationRequired: string[]; // conditions requiring manual confirmation
}

export class OrderConfirmationService {
  private readonly defaultTimeout = 300; // 5 minutes
  private readonly previewKeyPrefix = 'order_preview:';
  private readonly userSettingsPrefix = 'confirmation_settings:';

  async createOrderPreview(orderRequest: {
    userId: string;
    agentId?: string;
    symbol: string;
    side: 'buy' | 'sell';
    type: 'market' | 'limit';
    amount: number;
    price?: number;
    stopLoss?: number;
    takeProfit?: number;
  }): Promise<OrderPreview> {
    try {
      // Validate the trade first
      const validationResult = await preTradeValidationService.validateTrade(orderRequest);

      // Generate unique preview ID
      const previewId = `${orderRequest.userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create order preview
      const preview: OrderPreview = {
        id: previewId,
        userId: orderRequest.userId,
        agentId: orderRequest.agentId,
        symbol: SymbolConverter.normalize(orderRequest.symbol),
        side: orderRequest.side,
        type: orderRequest.type,
        amount: validationResult.adjustedAmount || orderRequest.amount,
        price: orderRequest.price,
        estimatedCost: validationResult.estimatedCost || 0,
        estimatedFees: validationResult.estimatedFees || 0,
        slippageEstimate: validationResult.slippageEstimate,
        profitPotential: validationResult.profitPotential,
        riskLevel: this.determineRiskLevel(validationResult),
        validationResult,
        expiresAt: Date.now() + (this.defaultTimeout * 1000),
        status: validationResult.isValid ? 'pending' : 'cancelled',
        createdAt: Date.now()
      };

      // Store preview in Redis with TTL
      const previewKey = `${this.previewKeyPrefix}${previewId}`;
      await redisService.set(previewKey, JSON.stringify(preview), this.defaultTimeout);

      // Check if auto-confirmation should be applied
      const shouldAutoConfirm = await this.shouldAutoConfirm(preview);
      if (shouldAutoConfirm && validationResult.isValid) {
        // Auto-confirm and execute immediately
        return await this.confirmOrder(previewId, true);
      }

      return preview;
    } catch (error) {
      console.error('Error creating order preview:', error);
      throw error;
    }
  }

  async confirmOrder(previewId: string, autoConfirm = false): Promise<OrderPreview> {
    try {
      const previewKey = `${this.previewKeyPrefix}${previewId}`;
      const previewData = await redisService.get(previewKey);

      if (!previewData) {
        throw new Error('Order preview not found or expired');
      }

      const preview: OrderPreview = JSON.parse(previewData);

      // Check if preview has expired
      if (Date.now() > preview.expiresAt) {
        preview.status = 'expired';
        await redisService.del(previewKey);
        throw new Error('Order preview has expired');
      }

      // Check if already processed
      if (['confirmed', 'cancelled', 'executed'].includes(preview.status)) {
        return preview;
      }

      // Re-validate the trade to ensure conditions haven't changed
      const revalidation = await preTradeValidationService.validateTrade({
        userId: preview.userId,
        agentId: preview.agentId,
        symbol: preview.symbol,
        side: preview.side,
        type: preview.type,
        amount: preview.amount,
        price: preview.price
      });

      if (!revalidation.isValid) {
        preview.status = 'cancelled';
        preview.validationResult = revalidation;
        await redisService.set(previewKey, JSON.stringify(preview), 60); // Keep for 1 minute
        throw new Error(`Order validation failed: ${revalidation.errors.join(', ')}`);
      }

      // Mark as confirmed
      preview.status = 'confirmed';
      await redisService.set(previewKey, JSON.stringify(preview), 3600); // Keep for 1 hour

      // Execute the order
      try {
        const order = await this.executeConfirmedOrder(preview);
        preview.status = 'executed';

        // Update daily stats
        await preTradeValidationService.updateDailyStats(
          preview.userId,
          preview.estimatedCost
        );

        // Clean up preview
        await redisService.del(previewKey);

        return preview;
      } catch (executionError) {
        console.error('Order execution failed:', executionError);
        preview.status = 'cancelled';
        await redisService.set(previewKey, JSON.stringify(preview), 3600);
        throw executionError;
      }

    } catch (error) {
      console.error('Error confirming order:', error);
      throw error;
    }
  }

  async cancelOrderPreview(previewId: string): Promise<OrderPreview> {
    try {
      const previewKey = `${this.previewKeyPrefix}${previewId}`;
      const previewData = await redisService.get(previewKey);

      if (!previewData) {
        throw new Error('Order preview not found');
      }

      const preview: OrderPreview = JSON.parse(previewData);
      preview.status = 'cancelled';

      // Update in Redis with shorter TTL
      await redisService.set(previewKey, JSON.stringify(preview), 300); // Keep for 5 minutes

      return preview;
    } catch (error) {
      console.error('Error cancelling order preview:', error);
      throw error;
    }
  }

  async getOrderPreview(previewId: string): Promise<OrderPreview | null> {
    try {
      const previewKey = `${this.previewKeyPrefix}${previewId}`;
      const previewData = await redisService.get(previewKey);

      if (!previewData) {
        return null;
      }

      const preview: OrderPreview = JSON.parse(previewData);

      // Check if expired
      if (Date.now() > preview.expiresAt && preview.status === 'pending') {
        preview.status = 'expired';
        await redisService.set(previewKey, JSON.stringify(preview), 60);
      }

      return preview;
    } catch (error) {
      console.error('Error getting order preview:', error);
      return null;
    }
  }

  async getUserPendingPreviews(userId: string): Promise<OrderPreview[]> {
    try {
      const pattern = `${this.previewKeyPrefix}${userId}_*`;
      const keys = await redisService.keys(pattern);

      const previews: OrderPreview[] = [];

      for (const key of keys) {
        const data = await redisService.get(key);
        if (data) {
          const preview: OrderPreview = JSON.parse(data);
          if (preview.status === 'pending' && Date.now() <= preview.expiresAt) {
            previews.push(preview);
          }
        }
      }

      return previews.sort((a, b) => b.createdAt - a.createdAt);
    } catch (error) {
      console.error('Error getting user pending previews:', error);
      return [];
    }
  }

  async updateConfirmationSettings(userId: string, settings: Partial<ConfirmationSettings>): Promise<void> {
    try {
      const settingsKey = `${this.userSettingsPrefix}${userId}`;
      const currentSettings = await this.getConfirmationSettings(userId);

      const updatedSettings = { ...currentSettings, ...settings };
      await redisService.set(settingsKey, JSON.stringify(updatedSettings), 86400 * 30); // 30 days
    } catch (error) {
      console.error('Error updating confirmation settings:', error);
      throw error;
    }
  }

  async getConfirmationSettings(userId: string): Promise<ConfirmationSettings> {
    try {
      const settingsKey = `${this.userSettingsPrefix}${userId}`;
      const data = await redisService.get(settingsKey);

      if (data) {
        return JSON.parse(data);
      }

      // Default settings
      return {
        requireConfirmation: true,
        confirmationTimeout: this.defaultTimeout,
        autoConfirmBelowAmount: 50, // Auto-confirm orders below $50
        manualConfirmationRequired: ['HIGH_RISK', 'LARGE_POSITION', 'HIGH_VOLATILITY']
      };
    } catch (error) {
      console.error('Error getting confirmation settings:', error);
      return {
        requireConfirmation: true,
        confirmationTimeout: this.defaultTimeout,
        autoConfirmBelowAmount: 50,
        manualConfirmationRequired: ['HIGH_RISK', 'LARGE_POSITION', 'HIGH_VOLATILITY']
      };
    }
  }

  private async shouldAutoConfirm(preview: OrderPreview): Promise<boolean> {
    try {
      const settings = await this.getConfirmationSettings(preview.userId);

      // If confirmation is disabled, auto-confirm
      if (!settings.requireConfirmation) {
        return true;
      }

      // If below auto-confirm threshold, auto-confirm
      if (preview.estimatedCost <= settings.autoConfirmBelowAmount) {
        return true;
      }

      // Check for conditions requiring manual confirmation
      const requiresManual = settings.manualConfirmationRequired.some(condition => {
        switch (condition) {
          case 'HIGH_RISK':
            return preview.riskLevel === 'HIGH';
          case 'LARGE_POSITION':
            return preview.estimatedCost > 1000; // $1000+
          case 'HIGH_VOLATILITY':
            return preview.validationResult.warnings?.some((w: string) =>
              w.includes('volatility') || w.includes('movement')
            );
          case 'HIGH_SLIPPAGE':
            return (preview.slippageEstimate || 0) > 0.5; // 0.5%+
          default:
            return false;
        }
      });

      return !requiresManual;
    } catch (error) {
      // On error, require manual confirmation for safety
      return false;
    }
  }

  private determineRiskLevel(validationResult: any): 'LOW' | 'MEDIUM' | 'HIGH' {
    if (!validationResult.isValid) {
      return 'HIGH';
    }

    const errorCount = validationResult.errors?.length || 0;
    const warningCount = validationResult.warnings?.length || 0;

    if (errorCount > 0) {
      return 'HIGH';
    }

    if (warningCount >= 3) {
      return 'HIGH';
    } else if (warningCount >= 1) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  private async executeConfirmedOrder(preview: OrderPreview): Promise<any> {
    try {
      // Execute through OKX service
      const order = await okxService.executeScalpingOrder(
        preview.userId,
        preview.symbol,
        preview.side,
        preview.amount,
        preview.type,
        preview.price
      );

      // Start order tracking
      await orderTrackingService.trackOrder(
        order.orderId,
        preview.userId,
        preview.symbol,
        preview.side,
        preview.amount,
        preview.price
      );

      // If this was from an agent, create execution record
      if (preview.agentId) {
        // Log agent trade execution
        console.log(`Agent ${preview.agentId} executed trade: ${preview.side} ${preview.amount} ${preview.symbol}`);
      }

      // Publish order execution event
      await redisService.publish(`order_executed:${preview.userId}`, {
        type: 'order_executed',
        previewId: preview.id,
        orderId: order.orderId,
        symbol: preview.symbol,
        side: preview.side,
        amount: preview.amount,
        estimatedCost: preview.estimatedCost,
        timestamp: Date.now()
      });

      return order;
    } catch (error) {
      console.error('Error executing order:', error);
      throw error;
    }
  }

  // Batch operations for managing multiple previews
  async cancelExpiredPreviews(): Promise<number> {
    try {
      const pattern = `${this.previewKeyPrefix}*`;
      const keys = await redisService.keys(pattern);
      let cancelledCount = 0;

      for (const key of keys) {
        const data = await redisService.get(key);
        if (data) {
          const preview: OrderPreview = JSON.parse(data);
          if (preview.status === 'pending' && Date.now() > preview.expiresAt) {
            preview.status = 'expired';
            await redisService.set(key, JSON.stringify(preview), 300); // Keep for 5 minutes
            cancelledCount++;
          }
        }
      }

      return cancelledCount;
    } catch (error) {
      console.error('Error cancelling expired previews:', error);
      return 0;
    }
  }

  // Get system-wide statistics
  async getSystemStats(): Promise<{
    totalPreviews: number;
    pendingPreviews: number;
    expiredPreviews: number;
    confirmedPreviews: number;
    autoConfirmRate: number;
  }> {
    try {
      const pattern = `${this.previewKeyPrefix}*`;
      const keys = await redisService.keys(pattern);

      let total = 0;
      let pending = 0;
      let expired = 0;
      let confirmed = 0;
      let autoConfirmed = 0;

      for (const key of keys) {
        const data = await redisService.get(key);
        if (data) {
          const preview: OrderPreview = JSON.parse(data);
          total++;

          switch (preview.status) {
            case 'pending':
              pending++;
              break;
            case 'expired':
              expired++;
              break;
            case 'confirmed':
            case 'executed':
              confirmed++;
              break;
          }
        }
      }

      return {
        totalPreviews: total,
        pendingPreviews: pending,
        expiredPreviews: expired,
        confirmedPreviews: confirmed,
        autoConfirmRate: confirmed > 0 ? (autoConfirmed / confirmed) * 100 : 0
      };
    } catch (error) {
      console.error('Error getting system stats:', error);
      return {
        totalPreviews: 0,
        pendingPreviews: 0,
        expiredPreviews: 0,
        confirmedPreviews: 0,
        autoConfirmRate: 0
      };
    }
  }
}

export const orderConfirmationService = new OrderConfirmationService();