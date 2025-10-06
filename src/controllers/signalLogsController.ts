import { Request, Response } from 'express';
import { signalDatabaseLoggingService } from '../services/signalDatabaseLoggingService';

export class SignalLogsController {
  /**
   * Get all broadcasted signals
   * GET /api/signal-logs/broadcasts?symbol=BTC&dateFrom=2025-01-01&dateTo=2025-01-10&limit=50
   */
  async getAllSignals(req: Request, res: Response): Promise<void> {
    try {
      const { symbol, dateFrom, dateTo, recommendation } = req.query;

      const signals = await signalDatabaseLoggingService.getBroadcastedSignals({
        symbol: symbol as string,
        recommendation: recommendation as any,
        dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo: dateTo ? new Date(dateTo as string) : undefined
      });

      res.json({
        success: true,
        data: signals
      });
    } catch (error) {
      console.error('Error getting all signals:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve signals'
      });
    }
  }

  /**
   * Get signal details with all agent logs
   * GET /api/signal-logs/broadcast/:signalId
   */
  async getSignalDetails(req: Request, res: Response): Promise<void> {
    try {
      const { signalId } = req.params;

      if (!signalId) {
        res.status(400).json({
          success: false,
          error: 'Signal ID is required'
        });
        return;
      }

      const result = await signalDatabaseLoggingService.getSignalWithAgentLogs(signalId);

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error(`Error getting signal details for ${req.params.signalId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve signal details'
      });
    }
  }

  /**
   * Get agent signal history
   * GET /api/signal-logs/agent/:agentId/signals?status=EXCLUDED&symbol=BTC&dateFrom=...
   */
  async getAgentHistory(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;
      const { status, symbol, dateFrom, dateTo } = req.query;

      if (!agentId) {
        res.status(400).json({
          success: false,
          error: 'Agent ID is required'
        });
        return;
      }

      const history = await signalDatabaseLoggingService.getAgentSignalHistory(
        agentId,
        {
          status: status as any,
          symbol: symbol as string,
          dateFrom: dateFrom ? new Date(dateFrom as string) : undefined,
          dateTo: dateTo ? new Date(dateTo as string) : undefined
        }
      );

      res.json({
        success: true,
        data: history
      });
    } catch (error) {
      console.error(`Error getting agent history for ${req.params.agentId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve agent history'
      });
    }
  }

  /**
   * Get agent exclusion statistics
   * GET /api/signal-logs/agent/:agentId/exclusions
   */
  async getAgentExclusions(req: Request, res: Response): Promise<void> {
    try {
      const { agentId } = req.params;

      if (!agentId) {
        res.status(400).json({
          success: false,
          error: 'Agent ID is required'
        });
        return;
      }

      const stats = await signalDatabaseLoggingService.getExclusionStatistics(agentId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error(`Error getting exclusion stats for ${req.params.agentId}:`, error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve exclusion statistics'
      });
    }
  }

  /**
   * Get overall statistics
   * GET /api/signal-logs/statistics?dateFrom=...&dateTo=...
   */
  async getOverallStatistics(req: Request, res: Response): Promise<void> {
    try {
      const { dateFrom, dateTo } = req.query;

      const stats = await signalDatabaseLoggingService.getOverallStatistics(
        dateFrom ? new Date(dateFrom as string) : undefined,
        dateTo ? new Date(dateTo as string) : undefined
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting overall statistics:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve statistics'
      });
    }
  }
}

export const signalLogsController = new SignalLogsController();
