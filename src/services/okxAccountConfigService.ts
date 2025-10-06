import { okxService } from './okxService';
import { redisService } from './redisService';
import { User } from '../models';

interface OKXAccountConfig {
  userId: string;
  accountLevel: string;
  accountMode: 'cash' | 'spot_isolated' | 'spot_cross' | 'multi_currency' | 'portfolio_margin';
  spotTradingEnabled: boolean;
  marginTradingEnabled: boolean;
  futuresTradingEnabled: boolean;
  optionsTradingEnabled: boolean;

  // Order type permissions
  marketOrdersEnabled: boolean;
  limitOrdersEnabled: boolean;
  stopLimitOrdersEnabled: boolean;
  postOnlyOrdersEnabled: boolean;

  // Risk management
  maxLeverage: number;

  // Account status
  isVerified: boolean;
  canTrade: boolean;

  lastChecked: Date;
}

interface AccountValidationResult {
  isValid: boolean;
  canPlaceMarketOrders: boolean;
  canPlaceLimitOrders: boolean;
  canSetStopLoss: boolean;
  canSetTakeProfit: boolean;
  warnings: string[];
  errors: string[];
  accountConfig: OKXAccountConfig | null;
}

export class OKXAccountConfigService {
  private readonly CONFIG_CACHE_TTL = 3600; // 1 hour cache
  private readonly CONFIG_CACHE_PREFIX = 'okx_account_config:';

  /**
   * Get and validate OKX account configuration
   */
  async getAccountConfig(userId: string): Promise<OKXAccountConfig | null> {
    try {
      // Check cache first
      const cacheKey = `${this.CONFIG_CACHE_PREFIX}${userId}`;
      const cachedConfig = await redisService.get(cacheKey);
      if (cachedConfig) {
        return cachedConfig;
      }

      // Fetch from OKX API
      const accountInfo = await okxService.getAccountInfo(userId);

      if (!accountInfo || accountInfo.length === 0) {
        console.error('No account info returned from OKX');
        return null;
      }

      const accountData = accountInfo[0];

      const config: OKXAccountConfig = {
        userId,
        accountLevel: accountData.acctLv || 'unknown',
        accountMode: this.mapAccountMode(accountData.acctLv),
        spotTradingEnabled: true, // OKX spot trading is generally available
        marginTradingEnabled: accountData.acctLv === '2' || accountData.acctLv === '3',
        futuresTradingEnabled: accountData.acctLv === '3' || accountData.acctLv === '4',
        optionsTradingEnabled: accountData.acctLv === '4',

        // Order types - OKX supports these by default
        marketOrdersEnabled: true,
        limitOrdersEnabled: true,
        stopLimitOrdersEnabled: true,
        postOnlyOrdersEnabled: true,

        // Risk management
        maxLeverage: parseInt(accountData.maxLeverage || '1'),

        // Account status
        isVerified: true, // If they can call API, they're verified
        canTrade: accountData.canTrade !== false,

        lastChecked: new Date()
      };

      // Cache the config
      await redisService.set(cacheKey, config, { ttl: this.CONFIG_CACHE_TTL });

      return config;
    } catch (error) {
      console.error(`Error getting OKX account config for user ${userId}:`, error);
      return null;
    }
  }

  /**
   * Map OKX account level to account mode
   */
  private mapAccountMode(acctLv: string): OKXAccountConfig['accountMode'] {
    switch (acctLv) {
      case '1':
        return 'cash'; // Simple mode
      case '2':
        return 'spot_isolated'; // Single-currency margin mode
      case '3':
        return 'spot_cross'; // Multi-currency margin mode
      case '4':
        return 'portfolio_margin'; // Portfolio margin mode
      default:
        return 'cash';
    }
  }

  /**
   * Validate if account can be used for trading
   */
  async validateAccountForTrading(userId: string): Promise<AccountValidationResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      // Get account config
      const config = await this.getAccountConfig(userId);

      if (!config) {
        return {
          isValid: false,
          canPlaceMarketOrders: false,
          canPlaceLimitOrders: false,
          canSetStopLoss: false,
          canSetTakeProfit: false,
          warnings: [],
          errors: ['Failed to fetch OKX account configuration. Please check your API credentials.'],
          accountConfig: null
        };
      }

      // Check if trading is enabled
      if (!config.canTrade) {
        errors.push('Trading is disabled on your OKX account');
      }

      // Check if spot trading is available
      if (!config.spotTradingEnabled) {
        errors.push('Spot trading is not enabled on your OKX account');
      }

      // Warnings for account limitations
      if (config.accountMode === 'cash' && config.maxLeverage === 1) {
        warnings.push('Account is in cash mode - no leverage available');
      }

      // Check balance
      try {
        const balance = await okxService.getBalance(userId);
        const usdtBalance = balance[0]?.details?.find((d: any) => d.ccy === 'USDT');
        const availableBalance = parseFloat(usdtBalance?.availBal || '0');

        if (availableBalance < 10) {
          warnings.push(`Low USDT balance: $${availableBalance.toFixed(2)}. Minimum $10 recommended for trading.`);
        }
      } catch (error) {
        warnings.push('Could not verify account balance');
      }

      const isValid = errors.length === 0;

      return {
        isValid,
        canPlaceMarketOrders: config.marketOrdersEnabled,
        canPlaceLimitOrders: config.limitOrdersEnabled,
        canSetStopLoss: config.stopLimitOrdersEnabled, // Stop-limit orders for stop loss
        canSetTakeProfit: config.limitOrdersEnabled, // Limit orders for take profit
        warnings,
        errors,
        accountConfig: config
      };
    } catch (error) {
      console.error('Error validating OKX account:', error);

      return {
        isValid: false,
        canPlaceMarketOrders: false,
        canPlaceLimitOrders: false,
        canSetStopLoss: false,
        canSetTakeProfit: false,
        warnings: [],
        errors: ['Failed to validate OKX account. Please check your API credentials and permissions.'],
        accountConfig: null
      };
    }
  }

  /**
   * Check if user's OKX account supports a specific feature
   */
  async supportsFeature(
    userId: string,
    feature: 'market_orders' | 'limit_orders' | 'stop_loss' | 'take_profit' | 'margin_trading'
  ): Promise<boolean> {
    try {
      const validation = await this.validateAccountForTrading(userId);

      switch (feature) {
        case 'market_orders':
          return validation.canPlaceMarketOrders;
        case 'limit_orders':
          return validation.canPlaceLimitOrders;
        case 'stop_loss':
          return validation.canSetStopLoss;
        case 'take_profit':
          return validation.canSetTakeProfit;
        case 'margin_trading':
          return validation.accountConfig?.marginTradingEnabled || false;
        default:
          return false;
      }
    } catch (error) {
      console.error(`Error checking feature support for ${feature}:`, error);
      return false;
    }
  }

  /**
   * Get recommended order type based on account config
   */
  async getRecommendedOrderType(userId: string): Promise<'market' | 'limit'> {
    try {
      const validation = await this.validateAccountForTrading(userId);

      // Prefer market orders for better execution
      if (validation.canPlaceMarketOrders) {
        return 'market';
      }

      // Fallback to limit orders
      if (validation.canPlaceLimitOrders) {
        return 'limit';
      }

      // Default to market
      return 'market';
    } catch (error) {
      console.error('Error getting recommended order type:', error);
      return 'market';
    }
  }

  /**
   * Check if stop-loss/take-profit can be set on new orders
   */
  async canUseAdvancedOrders(userId: string): Promise<{
    canUseStopLoss: boolean;
    canUseTakeProfit: boolean;
    supportedOrderTypes: string[];
  }> {
    const validation = await this.validateAccountForTrading(userId);

    const supportedOrderTypes: string[] = [];
    if (validation.canPlaceMarketOrders) supportedOrderTypes.push('market');
    if (validation.canPlaceLimitOrders) supportedOrderTypes.push('limit');
    if (validation.canSetStopLoss) supportedOrderTypes.push('stop_limit');
    if (validation.accountConfig?.postOnlyOrdersEnabled) supportedOrderTypes.push('post_only');

    return {
      canUseStopLoss: validation.canSetStopLoss,
      canUseTakeProfit: validation.canSetTakeProfit,
      supportedOrderTypes
    };
  }

  /**
   * Refresh cached account config
   */
  async refreshAccountConfig(userId: string): Promise<OKXAccountConfig | null> {
    const cacheKey = `${this.CONFIG_CACHE_PREFIX}${userId}`;
    await redisService.delete(cacheKey);
    return this.getAccountConfig(userId);
  }

  /**
   * Get account config summary for display
   */
  async getAccountSummary(userId: string): Promise<{
    accountMode: string;
    tradingEnabled: boolean;
    availableFeatures: string[];
    limitations: string[];
  }> {
    const validation = await this.validateAccountForTrading(userId);
    const config = validation.accountConfig;

    if (!config) {
      return {
        accountMode: 'Unknown',
        tradingEnabled: false,
        availableFeatures: [],
        limitations: ['Account configuration unavailable']
      };
    }

    const availableFeatures: string[] = [];
    if (validation.canPlaceMarketOrders) availableFeatures.push('Market Orders');
    if (validation.canPlaceLimitOrders) availableFeatures.push('Limit Orders');
    if (validation.canSetStopLoss) availableFeatures.push('Stop Loss');
    if (validation.canSetTakeProfit) availableFeatures.push('Take Profit');
    if (config.marginTradingEnabled) availableFeatures.push('Margin Trading');

    return {
      accountMode: this.getAccountModeDisplay(config.accountMode),
      tradingEnabled: config.canTrade,
      availableFeatures,
      limitations: validation.warnings
    };
  }

  /**
   * Get human-readable account mode
   */
  private getAccountModeDisplay(mode: OKXAccountConfig['accountMode']): string {
    const modeMap: Record<OKXAccountConfig['accountMode'], string> = {
      'cash': 'Cash Trading',
      'spot_isolated': 'Spot Isolated Margin',
      'spot_cross': 'Spot Cross Margin',
      'multi_currency': 'Multi-Currency Margin',
      'portfolio_margin': 'Portfolio Margin'
    };

    return modeMap[mode] || 'Unknown';
  }

  /**
   * Validate account before agent creation/start
   */
  async validateForAgentTrading(userId: string): Promise<{
    canCreateAgent: boolean;
    message: string;
    suggestions: string[];
  }> {
    const validation = await this.validateAccountForTrading(userId);

    if (!validation.isValid) {
      return {
        canCreateAgent: false,
        message: `Cannot create agent: ${validation.errors.join(', ')}`,
        suggestions: [
          'Verify your OKX API credentials are correct',
          'Ensure your OKX account has trading permissions enabled',
          'Check that your API key has spot trading permissions'
        ]
      };
    }

    if (validation.warnings.length > 0) {
      return {
        canCreateAgent: true,
        message: 'Agent can be created with some limitations',
        suggestions: validation.warnings
      };
    }

    return {
      canCreateAgent: true,
      message: 'Account is fully configured for agent trading',
      suggestions: []
    };
  }
}

export const okxAccountConfigService = new OKXAccountConfigService();
