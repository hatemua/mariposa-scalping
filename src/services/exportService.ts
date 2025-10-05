import { Trade } from '../models';
import { tradeQueryService, TradeFilters } from './tradeQueryService';

export class ExportService {
  /**
   * Export trades to CSV format
   */
  async exportToCSV(userId: string, filters: TradeFilters): Promise<string> {
    try {
      const result = await tradeQueryService.queryTrades(userId, {
        ...filters,
        limit: 10000, // Export limit
        page: 1,
      });

      const trades = result.trades;

      // CSV headers
      const headers = [
        'Date',
        'Time',
        'Agent Name',
        'Symbol',
        'Side',
        'Type',
        'Quantity',
        'Entry Price',
        'Exit Price',
        'PnL',
        'Fees',
        'Status',
        'LLM Score',
        'Win Probability',
        'Actual Outcome',
        'Order ID',
      ];

      // CSV rows
      const rows = trades.map(trade => {
        const date = new Date(trade.createdAt);
        const agentName = trade.agentId?.name || 'Unknown';

        return [
          date.toISOString().split('T')[0], // Date
          date.toTimeString().split(' ')[0], // Time
          agentName,
          trade.symbol,
          trade.side,
          trade.type,
          trade.quantity,
          trade.price,
          trade.filledPrice || '',
          trade.pnl || 0,
          trade.fees || 0,
          trade.status,
          trade.llmValidationScore || '',
          trade.expectedWinProbability || '',
          trade.actualOutcome || '',
          trade.okxOrderId || '',
        ];
      });

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')),
      ].join('\n');

      return csvContent;
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      throw error;
    }
  }

  /**
   * Export trades to JSON format
   */
  async exportToJSON(userId: string, filters: TradeFilters): Promise<string> {
    try {
      const result = await tradeQueryService.queryTrades(userId, {
        ...filters,
        limit: 10000,
        page: 1,
      });

      const exportData = {
        exportedAt: new Date().toISOString(),
        filters: filters,
        summary: result.summary,
        trades: result.trades.map(trade => ({
          date: trade.createdAt,
          agentName: trade.agentId?.name || 'Unknown',
          symbol: trade.symbol,
          side: trade.side,
          type: trade.type,
          quantity: trade.quantity,
          entryPrice: trade.price,
          exitPrice: trade.filledPrice,
          pnl: trade.pnl || 0,
          fees: trade.fees || 0,
          status: trade.status,
          llmValidationScore: trade.llmValidationScore,
          expectedWinProbability: trade.expectedWinProbability,
          actualOutcome: trade.actualOutcome,
          orderId: trade.okxOrderId,
        })),
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting to JSON:', error);
      throw error;
    }
  }

  /**
   * Export agent performance summary
   */
  async exportAgentSummary(userId: string): Promise<string> {
    try {
      const { dashboardAnalyticsService } = await import('./dashboardAnalyticsService');
      const summary = await dashboardAnalyticsService.getUserDashboardSummary(userId);
      const agentMetrics = await dashboardAnalyticsService.getAllAgentMetrics(userId);

      const headers = [
        'Agent Name',
        'Symbol',
        'Strategy',
        'Status',
        'Total PnL',
        'Today PnL',
        'Total Trades',
        'Win Rate %',
        'Avg Profit',
        'Avg Loss',
        'Max Drawdown',
        'Sharpe Ratio',
        'Profit Factor',
        'Last Trade',
      ];

      const rows = agentMetrics.map(agent => [
        agent.agentName,
        agent.symbol,
        agent.strategyType,
        agent.status,
        agent.pnl.toFixed(2),
        agent.todayPnL.toFixed(2),
        agent.trades,
        agent.winRate.toFixed(2),
        agent.avgProfit.toFixed(2),
        agent.avgLoss.toFixed(2),
        agent.maxDrawdown.toFixed(2),
        agent.sharpeRatio.toFixed(2),
        agent.profitFactor.toFixed(2),
        agent.lastTradeAt ? new Date(agent.lastTradeAt).toISOString() : 'Never',
      ]);

      // Add summary row
      rows.unshift([
        'PORTFOLIO TOTAL',
        'ALL',
        'ALL',
        `${summary.activeAgents}/${summary.totalAgents} Active`,
        summary.totalPnL.toFixed(2),
        summary.todayPnL.toFixed(2),
        summary.totalTrades.toString(),
        summary.totalWinRate.toFixed(2),
        '-',
        '-',
        '-',
        '-',
        '-',
        '-',
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => this.escapeCSV(cell)).join(',')),
      ].join('\n');

      return csvContent;
    } catch (error) {
      console.error('Error exporting agent summary:', error);
      throw error;
    }
  }

  /**
   * Get export statistics
   */
  async getExportStats(userId: string, filters: TradeFilters): Promise<{
    totalRecords: number;
    estimatedSizeKB: number;
    dateRange: { from: Date; to: Date };
  }> {
    try {
      const result = await tradeQueryService.queryTrades(userId, {
        ...filters,
        limit: 1,
        page: 1,
      });

      const totalRecords = result.pagination.total;
      const estimatedSizeKB = Math.ceil((totalRecords * 200) / 1024); // Rough estimate: 200 bytes per record

      // Get date range
      const trades = await Trade.find(
        await (tradeQueryService as any).buildQuery(userId, filters)
      )
        .sort({ createdAt: 1 })
        .select('createdAt')
        .limit(1);

      const firstTrade = trades[0];
      const lastTrade = await Trade.find(
        await (tradeQueryService as any).buildQuery(userId, filters)
      )
        .sort({ createdAt: -1 })
        .select('createdAt')
        .limit(1);

      return {
        totalRecords,
        estimatedSizeKB,
        dateRange: {
          from: firstTrade?.createdAt || new Date(),
          to: lastTrade[0]?.createdAt || new Date(),
        },
      };
    } catch (error) {
      console.error('Error getting export stats:', error);
      return {
        totalRecords: 0,
        estimatedSizeKB: 0,
        dateRange: { from: new Date(), to: new Date() },
      };
    }
  }

  /**
   * Escape CSV special characters
   */
  private escapeCSV(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = String(value);

    // If contains comma, quote, or newline, wrap in quotes and escape quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return `"${stringValue.replace(/"/g, '""')}"`;
    }

    return stringValue;
  }

  /**
   * Generate filename for export
   */
  generateFilename(format: 'csv' | 'json', type: 'trades' | 'agents'): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return `mariposa_${type}_${timestamp}.${format}`;
  }
}

export const exportService = new ExportService();
