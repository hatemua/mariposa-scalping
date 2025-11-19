/**
 * MT4 Controller
 *
 * Handles MT4 broker configuration and trading operations.
 * Provides endpoints for:
 * - MT4 credential management
 * - Connection testing
 * - Account information
 * - Trading operations
 * - Symbol availability
 */

import { Response } from 'express';
import { User } from '../models';
import { encrypt } from '../utils/encryption';
import { ApiResponse } from '../types';
import { AuthRequest } from '../middleware/auth';
import { mt4Service } from '../services/mt4Service';
import { symbolMappingService } from '../services/symbolMappingService';
import { brokerFilterService } from '../services/brokerFilterService';

/**
 * Configure MT4 credentials for user
 */
export const configureMT4Credentials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const { serverUrl, accountNumber, password, brokerName } = req.body;

    // Validate required fields
    if (!serverUrl || !accountNumber || !password) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: serverUrl, accountNumber, password'
      } as ApiResponse);
      return;
    }

    // Validate serverUrl format
    if (!serverUrl.startsWith('http://') && !serverUrl.startsWith('https://')) {
      res.status(400).json({
        success: false,
        error: 'Invalid serverUrl format. Must start with http:// or https://'
      } as ApiResponse);
      return;
    }

    // Encrypt credentials
    const encryptedServerUrl = JSON.stringify(encrypt(serverUrl));
    const encryptedAccountNumber = JSON.stringify(encrypt(accountNumber));
    const encryptedPassword = JSON.stringify(encrypt(password));

    // Update user with encrypted credentials
    await User.findByIdAndUpdate(userId, {
      mt4ServerUrl: encryptedServerUrl,
      mt4AccountNumber: encryptedAccountNumber,
      mt4Password: encryptedPassword,
      mt4BrokerName: brokerName || null
    });

    // Clear user client cache to force re-authentication
    mt4Service.clearUserClient(userId);

    res.json({
      success: true,
      data: {
        message: 'MT4 credentials configured successfully',
        brokerName: brokerName || 'MT4 Broker'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error configuring MT4 credentials:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to configure MT4 credentials'
    } as ApiResponse);
  }
};

/**
 * Test MT4 bridge connection
 * This endpoint checks if the MT4 bridge is reachable using shared credentials
 * No user-specific credentials required
 */
export const testMT4Connection = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    // Ping the bridge directly using shared credentials
    const bridgeStatus = await mt4Service.pingBridge();

    if (!bridgeStatus.connected) {
      res.status(503).json({
        success: false,
        error: bridgeStatus.error || 'MT4 bridge not responding. Please check if MT4 is running and bridge service is active.',
        data: {
          connected: false,
          error: bridgeStatus.error
        }
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        connected: true,
        bridgeUrl: bridgeStatus.bridgeUrl,
        message: 'MT4 bridge is connected and ready'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error testing MT4 connection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'MT4 connection test failed',
      data: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    } as ApiResponse);
  }
};

/**
 * Get MT4 account information
 */
export const getMT4Account = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const accountInfo = await mt4Service.getBalance(userId);

    res.json({
      success: true,
      data: accountInfo
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting MT4 account info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get MT4 account information'
    } as ApiResponse);
  }
};

/**
 * Get available symbols at MT4 broker
 */
export const getMT4Symbols = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const symbols = await mt4Service.getAvailableSymbols(userId);

    res.json({
      success: true,
      data: {
        count: symbols.length,
        symbols: symbols
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting MT4 symbols:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get MT4 symbols'
    } as ApiResponse);
  }
};

/**
 * Get open positions
 */
export const getMT4OpenPositions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const { symbol } = req.query;

    const positions = await mt4Service.getOpenPositions(
      userId,
      symbol as string | undefined
    );

    res.json({
      success: true,
      data: {
        count: positions.length,
        positions: positions
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting MT4 open positions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get open positions'
    } as ApiResponse);
  }
};

/**
 * Create market order
 */
export const createMT4Order = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const { symbol, side, volume, stopLoss, takeProfit } = req.body;

    // Validate required fields
    if (!symbol || !side || !volume) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, side, volume'
      } as ApiResponse);
      return;
    }

    // Validate side
    if (side !== 'buy' && side !== 'sell') {
      res.status(400).json({
        success: false,
        error: 'Invalid side. Must be "buy" or "sell"'
      } as ApiResponse);
      return;
    }

    // Validate volume
    if (volume < 0.01) {
      res.status(400).json({
        success: false,
        error: 'Volume too small. Minimum is 0.01 lots'
      } as ApiResponse);
      return;
    }

    // Create order
    const order = await mt4Service.createMarketOrder(
      userId,
      symbol,
      side,
      volume,
      stopLoss,
      takeProfit
    );

    res.json({
      success: true,
      data: order
    } as ApiResponse);

  } catch (error) {
    console.error('Error creating MT4 order:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create order'
    } as ApiResponse);
  }
};

/**
 * Close position
 */
export const closeMT4Position = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const { ticket, volume } = req.body;

    if (!ticket) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: ticket'
      } as ApiResponse);
      return;
    }

    const closedOrder = await mt4Service.closePosition(userId, parseInt(ticket), volume);

    res.json({
      success: true,
      data: closedOrder
    } as ApiResponse);

  } catch (error) {
    console.error('Error closing MT4 position:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close position'
    } as ApiResponse);
  }
};

/**
 * Close all positions
 */
export const closeMT4AllPositions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const { symbol } = req.body;

    const result = await mt4Service.closeAllPositions(userId, symbol);

    res.json({
      success: true,
      data: result
    } as ApiResponse);

  } catch (error) {
    console.error('Error closing all MT4 positions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close all positions'
    } as ApiResponse);
  }
};

/**
 * Get symbol price
 */
export const getMT4Price = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const { symbol } = req.params;

    if (!symbol) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameter: symbol'
      } as ApiResponse);
      return;
    }

    const price = await mt4Service.getPrice(userId, symbol);

    res.json({
      success: true,
      data: {
        symbol: symbol,
        ...price
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting MT4 price:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get price'
    } as ApiResponse);
  }
};

/**
 * Calculate lot size for USDT amount
 */
export const calculateMT4LotSize = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    const { symbol, usdtAmount } = req.body;

    if (!symbol || !usdtAmount) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: symbol, usdtAmount'
      } as ApiResponse);
      return;
    }

    const lotSize = await mt4Service.calculateLotSize(userId, symbol, usdtAmount);

    res.json({
      success: true,
      data: {
        symbol: symbol,
        usdtAmount: usdtAmount,
        lotSize: lotSize
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error calculating lot size:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate lot size'
    } as ApiResponse);
  }
};

/**
 * Get broker capabilities (available symbols, asset classes)
 */
export const getMT4Capabilities = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const capabilities = await brokerFilterService.getBrokerCapabilities('MT4');

    res.json({
      success: true,
      data: capabilities
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting MT4 capabilities:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get broker capabilities'
    } as ApiResponse);
  }
};

/**
 * Get recommended symbols for agent category
 */
export const getMT4RecommendedSymbols = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { category } = req.query;

    if (!category) {
      res.status(400).json({
        success: false,
        error: 'Missing required parameter: category'
      } as ApiResponse);
      return;
    }

    const validCategories = ['SCALPING', 'SWING', 'DAY_TRADING', 'LONG_TERM', 'ARBITRAGE'];

    if (!validCategories.includes(category as string)) {
      res.status(400).json({
        success: false,
        error: 'Invalid category'
      } as ApiResponse);
      return;
    }

    const symbols = await brokerFilterService.getRecommendedSymbols(
      'MT4',
      category as any
    );

    res.json({
      success: true,
      data: {
        category: category,
        symbols: symbols
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting recommended symbols:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recommended symbols'
    } as ApiResponse);
  }
};

/**
 * Get MT4 connection status
 */
export const getMT4Status = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    // Check if user has MT4 credentials configured
    const user = await User.findById(userId);

    // Debug logging
    console.log(`[MT4 Status] Checking credentials for user: ${userId} (${user?.email || 'unknown'})`);
    console.log(`[MT4 Status] Credential fields:`, {
      hasServerUrl: !!user?.mt4ServerUrl,
      hasAccountNumber: !!user?.mt4AccountNumber,
      hasPassword: !!user?.mt4Password,
      serverUrlLength: user?.mt4ServerUrl?.length || 0,
      accountNumberLength: user?.mt4AccountNumber?.length || 0,
      passwordLength: user?.mt4Password?.length || 0,
      brokerName: user?.mt4BrokerName || '(not set)'
    });

    const hasCredentials = !!(user?.mt4ServerUrl && user?.mt4AccountNumber && user?.mt4Password);

    if (!hasCredentials) {
      console.log(`[MT4 Status] User ${userId} has incomplete credentials - returning not_configured`);
      res.json({
        success: true,
        data: {
          connected: false,
          status: 'not_configured',
          message: 'MT4 credentials not configured',
          debug: {
            userId: userId.toString(),
            email: user?.email,
            hasServerUrl: !!user?.mt4ServerUrl,
            hasAccountNumber: !!user?.mt4AccountNumber,
            hasPassword: !!user?.mt4Password
          },
          timestamp: new Date().toISOString()
        }
      } as ApiResponse);
      return;
    }

    // Test connection to MT4 bridge
    const pingSuccess = await mt4Service.ping(userId);

    if (!pingSuccess) {
      res.json({
        success: true,
        data: {
          connected: false,
          status: 'bridge_offline',
          message: 'MT4 bridge is not responding',
          timestamp: new Date().toISOString()
        }
      } as ApiResponse);
      return;
    }

    // Bridge is online and responsive
    res.json({
      success: true,
      data: {
        connected: true,
        status: 'connected',
        message: 'MT4 bridge is online and ready',
        timestamp: new Date().toISOString()
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error getting MT4 status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get MT4 status'
    } as ApiResponse);
  }
};

/**
 * Delete MT4 credentials
 */
export const deleteMT4Credentials = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized'
      } as ApiResponse);
      return;
    }

    // Remove MT4 credentials
    await User.findByIdAndUpdate(userId, {
      mt4ServerUrl: null,
      mt4AccountNumber: null,
      mt4Password: null,
      mt4BrokerName: null
    });

    // Clear user client cache
    mt4Service.clearUserClient(userId);

    res.json({
      success: true,
      data: {
        message: 'MT4 credentials deleted successfully'
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Error deleting MT4 credentials:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete MT4 credentials'
    } as ApiResponse);
  }
};
