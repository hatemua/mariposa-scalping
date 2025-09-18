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

    res.json({
      success: true,
      data: agents
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    } as ApiResponse);
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

    await agendaService.startAgent(agentId);

    res.json({
      success: true,
      message: 'Agent started successfully'
    } as ApiResponse);
  } catch (error) {
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

    await agendaService.stopAgent(agentId);

    res.json({
      success: true,
      message: 'Agent stopped successfully'
    } as ApiResponse);
  } catch (error) {
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