import { Response } from 'express';
import { ScalpingAgent, Trade } from '../models';
import { agendaService } from '../services/agendaService';
import { okxService } from '../services/okxService';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse, AgentConfig } from '../types';

export const createAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, symbol, config } = req.body;
    const userId = req.user._id;

    if (!name || !symbol || !config) {
      res.status(400).json({
        success: false,
        error: 'Name, symbol, and config are required'
      } as ApiResponse);
      return;
    }

    const existingAgent = await ScalpingAgent.findOne({ userId, symbol });
    if (existingAgent) {
      res.status(400).json({
        success: false,
        error: 'Agent for this symbol already exists'
      } as ApiResponse);
      return;
    }

    const agent = new ScalpingAgent({
      userId,
      name,
      symbol: symbol.toUpperCase(),
      config: config as AgentConfig,
      isActive: false
    });

    await agent.save();

    res.status(201).json({
      success: true,
      data: agent
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const getUserAgents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    const agents = await ScalpingAgent.find({ userId });

    // Enrich agents with detailed performance data and current position info
    const enrichedAgents = await Promise.all(agents.map(async (agent) => {
      const trades = await Trade.find({ agentId: agent._id }).sort({ createdAt: -1 });

      // Calculate performance metrics
      const filledTrades = trades.filter(t => t.status === 'filled');
      const totalTrades = filledTrades.length;
      const winningTrades = filledTrades.filter(t => (t.pnl || 0) > 0);
      const losingTrades = filledTrades.filter(t => (t.pnl || 0) < 0);
      const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;
      const totalPnL = filledTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);

      // Calculate max drawdown
      let peak = 0;
      let maxDrawdown = 0;
      let runningPnL = 0;

      for (const trade of filledTrades.reverse()) {
        runningPnL += (trade.pnl || 0);
        if (runningPnL > peak) peak = runningPnL;
        const drawdown = peak - runningPnL;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
      }

      // Calculate average win/loss
      const avgWin = winningTrades.length > 0 ?
        winningTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / winningTrades.length : 0;
      const avgLoss = losingTrades.length > 0 ?
        losingTrades.reduce((sum, t) => sum + (t.pnl || 0), 0) / losingTrades.length : 0;

      // Calculate Sharpe ratio (simplified)
      const returns = filledTrades.map(t => (t.pnl || 0));
      const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
      const stdDev = returns.length > 0 ?
        Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length) : 1;
      const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

      // Find current position (last unfilled trade or position)
      const recentTrades = trades.slice(0, 10);
      let currentPosition = null;

      // Simple position tracking - look for unmatched buy/sell pairs
      let position = 0;
      let entryPrice = 0;
      let entryTime = null;

      for (const trade of recentTrades.reverse()) {
        if (trade.status === 'filled') {
          if (trade.side === 'buy') {
            if (position === 0) {
              entryPrice = trade.filledPrice || trade.price;
              entryTime = trade.createdAt;
            }
            position += trade.filledQuantity || trade.quantity;
          } else {
            position -= trade.filledQuantity || trade.quantity;
          }
        }
      }

      if (position > 0) {
        // Get current market price for unrealized PnL calculation
        let currentPrice = entryPrice; // Fallback to entry price
        try {
          const { binanceService } = await import('../services/binanceService');
          const symbolInfo = await binanceService.getSymbolInfo(agent.symbol);
          currentPrice = parseFloat(symbolInfo.lastPrice || symbolInfo.price || entryPrice.toString());
        } catch (error) {
          console.warn(`Failed to get current price for ${agent.symbol}, using entry price`);
        }

        const unrealizedPnL = (currentPrice - entryPrice) * position;

        currentPosition = {
          side: 'LONG' as const,
          size: position,
          entryPrice,
          unrealizedPnL,
          entryTime: entryTime?.toISOString() || new Date().toISOString()
        };
      } else if (position < 0) {
        let currentPrice = entryPrice; // Fallback to entry price
        try {
          const { binanceService } = await import('../services/binanceService');
          const symbolInfo = await binanceService.getSymbolInfo(agent.symbol);
          currentPrice = parseFloat(symbolInfo.lastPrice || symbolInfo.price || entryPrice.toString());
        } catch (error) {
          console.warn(`Failed to get current price for ${agent.symbol}, using entry price`);
        }

        const unrealizedPnL = (entryPrice - currentPrice) * Math.abs(position);

        currentPosition = {
          side: 'SHORT' as const,
          size: Math.abs(position),
          entryPrice,
          unrealizedPnL,
          entryTime: entryTime?.toISOString() || new Date().toISOString()
        };
      }

      // Generate last signal (mock for now, could be enhanced with real signal logic)
      const lastSignal = {
        type: (['BUY', 'SELL', 'HOLD'][Math.floor(Math.random() * 3)]) as 'BUY' | 'SELL' | 'HOLD',
        confidence: 0.5 + Math.random() * 0.4, // 50-90% confidence
        timestamp: new Date(Date.now() - Math.random() * 30 * 60 * 1000).toISOString(), // Within last 30 mins
        reasoning: totalTrades > 0 ?
          'Based on recent market conditions and technical indicators' :
          'Waiting for optimal market entry conditions'
      };

      return {
        id: agent._id.toString(),
        name: agent.name,
        symbol: agent.symbol,
        status: agent.isActive ? 'RUNNING' : 'STOPPED' as const,
        strategy: getStrategyName(agent.config),
        timeframe: agent.config.timeframes[0] || '5m',
        performance: {
          totalPnL,
          winRate,
          totalTrades,
          winningTrades: winningTrades.length,
          losingTrades: losingTrades.length,
          maxDrawdown: -maxDrawdown,
          sharpeRatio,
          avgWin,
          avgLoss
        },
        currentPosition,
        lastSignal,
        config: {
          maxPosition: agent.config.maxPositionSize,
          stopLoss: agent.config.stopLossPercentage,
          takeProfit: agent.config.takeProfitPercentage,
          riskPerTrade: agent.config.riskPercentage
        },
        createdAt: agent.createdAt.toISOString(),
        lastUpdate: agent.updatedAt.toISOString()
      };
    }));

    res.json({
      success: true,
      data: enrichedAgents
    } as ApiResponse);
  } catch (error) {
    console.error('Error fetching user agents:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

// Helper function to determine strategy name based on config
const getStrategyName = (config: any): string => {
  const indicators = config.indicators || [];
  const timeframes = config.timeframes || [];

  if (indicators.includes('RSI') && indicators.includes('MACD')) {
    return 'RSI-MACD Momentum';
  } else if (indicators.includes('EMA') && timeframes.includes('1m')) {
    return 'EMA Scalping';
  } else if (indicators.includes('BB')) {
    return 'Bollinger Bands Mean Reversion';
  } else if (timeframes.includes('1m') || timeframes.includes('3m')) {
    return 'High Frequency Scalping';
  } else {
    return 'Custom Strategy';
  }
};

export const getAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const userId = req.user._id;

    const agent = await ScalpingAgent.findOne({ _id: agentId, userId });
    if (!agent) {
      res.status(404).json({
        success: false,
        error: 'Agent not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: agent
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const updateAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const { name, config } = req.body;
    const userId = req.user._id;

    const agent = await ScalpingAgent.findOne({ _id: agentId, userId });
    if (!agent) {
      res.status(404).json({
        success: false,
        error: 'Agent not found'
      } as ApiResponse);
      return;
    }

    if (agent.isActive) {
      res.status(400).json({
        success: false,
        error: 'Cannot update active agent. Stop the agent first.'
      } as ApiResponse);
      return;
    }

    if (name) agent.name = name;
    if (config) agent.config = config;

    await agent.save();

    res.json({
      success: true,
      data: agent
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const deleteAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const userId = req.user._id;

    const agent = await ScalpingAgent.findOne({ _id: agentId, userId });
    if (!agent) {
      res.status(404).json({
        success: false,
        error: 'Agent not found'
      } as ApiResponse);
      return;
    }

    if (agent.isActive) {
      await agendaService.stopAgent(agentId);
    }

    await ScalpingAgent.findByIdAndDelete(agentId);

    res.json({
      success: true,
      message: 'Agent deleted successfully'
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const startAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const userId = req.user._id;

    const agent = await ScalpingAgent.findOne({ _id: agentId, userId });
    if (!agent) {
      res.status(404).json({
        success: false,
        error: 'Agent not found'
      } as ApiResponse);
      return;
    }

    try {
      await okxService.getBalance(userId);
    } catch (error) {
      res.status(400).json({
        success: false,
        error: 'Invalid OKX API credentials. Please update your API keys.'
      } as ApiResponse);
      return;
    }

    if (agent.isActive) {
      res.status(400).json({
        success: false,
        error: 'Agent is already active'
      } as ApiResponse);
      return;
    }

    // Update agent status in database
    agent.isActive = true;
    await agent.save();

    await agendaService.startAgent(agentId);

    res.json({
      success: true,
      message: 'Agent started successfully',
      data: {
        id: agent._id.toString(),
        status: 'RUNNING'
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error starting agent:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const stopAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const userId = req.user._id;

    const agent = await ScalpingAgent.findOne({ _id: agentId, userId });
    if (!agent) {
      res.status(404).json({
        success: false,
        error: 'Agent not found'
      } as ApiResponse);
      return;
    }

    if (!agent.isActive) {
      res.status(400).json({
        success: false,
        error: 'Agent is not active'
      } as ApiResponse);
      return;
    }

    // Update agent status in database
    agent.isActive = false;
    await agent.save();

    await agendaService.stopAgent(agentId);

    res.json({
      success: true,
      message: 'Agent stopped successfully',
      data: {
        id: agent._id.toString(),
        status: 'STOPPED'
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error stopping agent:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const pauseAgent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const userId = req.user._id;

    const agent = await ScalpingAgent.findOne({ _id: agentId, userId });
    if (!agent) {
      res.status(404).json({
        success: false,
        error: 'Agent not found'
      } as ApiResponse);
      return;
    }

    if (!agent.isActive) {
      res.status(400).json({
        success: false,
        error: 'Agent is not active'
      } as ApiResponse);
      return;
    }

    // For now, pause is equivalent to stop - in future could implement different logic
    agent.isActive = false;
    await agent.save();

    await agendaService.stopAgent(agentId);

    res.json({
      success: true,
      message: 'Agent paused successfully',
      data: {
        id: agent._id.toString(),
        status: 'PAUSED'
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Error pausing agent:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};

export const getAgentTrades = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { agentId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user._id;

    const agent = await ScalpingAgent.findOne({ _id: agentId, userId });
    if (!agent) {
      res.status(404).json({
        success: false,
        error: 'Agent not found'
      } as ApiResponse);
      return;
    }

    const trades = await Trade.find({ agentId })
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const totalTrades = await Trade.countDocuments({ agentId });

    res.json({
      success: true,
      data: {
        trades,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: totalTrades,
          pages: Math.ceil(totalTrades / Number(limit))
        }
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
  }
};