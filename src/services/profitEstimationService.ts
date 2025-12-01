import { Trade } from '../models';
import MT4Position from '../models/MT4Position';

export interface ProfitEstimationConfig {
  totalBudget: number;           // e.g., $5,000
  parallelOrders: number;        // e.g., 3
  amountPerOrder: number;        // e.g., $900
  cryptoPipValue: number;        // e.g., $10
}

export interface HistoricalMetrics {
  winRate: number;               // % (e.g., 62.5)
  avgWinPips: number;            // Average pips won per winning trade
  avgLossPips: number;           // Average pips lost per losing trade
  avgWinAmount: number;          // Average $ won per winning trade
  avgLossAmount: number;         // Average $ lost per losing trade
  avgTradesPerDay: number;       // Average trades executed per day
  totalTradesAnalyzed: number;
  daysAnalyzed: number;
  winningTrades: number;
  losingTrades: number;
}

export interface DailyEstimate {
  estimatedOrders: number;
  estimatedWins: number;
  estimatedLosses: number;
  winProfitUSD: number;
  lossCostUSD: number;
  netProfitUSD: number;
  netProfitPips: number;
}

export interface Projections {
  weeklyProfitUSD: number;
  monthlyProfitUSD: number;
  dailyROIPercent: number;
  weeklyROIPercent: number;
  monthlyROIPercent: number;
}

export interface RiskMetrics {
  capitalAtRisk: number;         // Total $ at risk (parallelOrders * amountPerOrder)
  capitalAtRiskPercent: number;  // % of budget at risk
  maxObservedDrawdown: number;   // Worst drawdown observed
  worstDayLoss: number;          // Worst single day loss
  bestDayProfit: number;         // Best single day profit
}

export interface ProfitEstimationReport {
  config: ProfitEstimationConfig;
  historical: HistoricalMetrics;
  dailyEstimate: DailyEstimate;
  projections: Projections;
  risk: RiskMetrics;
  generatedAt: Date;
}

export class ProfitEstimationService {
  private readonly DEFAULT_CONFIG: ProfitEstimationConfig = {
    totalBudget: 5000,
    parallelOrders: 3,
    amountPerOrder: 900,
    cryptoPipValue: 10
  };

  /**
   * Calculate historical metrics from past trades
   */
  async calculateHistoricalMetrics(userId: string, days: number = 30): Promise<HistoricalMetrics> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Query closed trades
    const trades = await Trade.find({
      userId,
      status: 'filled',
      pnl: { $exists: true, $ne: null },
      createdAt: { $gte: startDate }
    }).sort({ createdAt: -1 });

    // Also check MT4Position for more data
    const mt4Positions = await MT4Position.find({
      userId,
      status: { $in: ['closed', 'auto-closed'] },
      profit: { $exists: true, $ne: null },
      closedAt: { $gte: startDate }
    }).sort({ closedAt: -1 });

    // Combine and deduplicate by ticket
    const allTrades: Array<{ pnl: number; createdAt: Date }> = [];
    const seenTickets = new Set<number>();

    for (const pos of mt4Positions) {
      if (!seenTickets.has(pos.ticket)) {
        seenTickets.add(pos.ticket);
        allTrades.push({
          pnl: pos.profit || 0,
          createdAt: pos.closedAt || pos.openedAt
        });
      }
    }

    for (const trade of trades) {
      if (trade.mt4Ticket && !seenTickets.has(trade.mt4Ticket)) {
        seenTickets.add(trade.mt4Ticket);
        allTrades.push({
          pnl: trade.pnl || 0,
          createdAt: trade.createdAt
        });
      } else if (!trade.mt4Ticket) {
        allTrades.push({
          pnl: trade.pnl || 0,
          createdAt: trade.createdAt
        });
      }
    }

    if (allTrades.length === 0) {
      return {
        winRate: 0,
        avgWinPips: 0,
        avgLossPips: 0,
        avgWinAmount: 0,
        avgLossAmount: 0,
        avgTradesPerDay: 0,
        totalTradesAnalyzed: 0,
        daysAnalyzed: days,
        winningTrades: 0,
        losingTrades: 0
      };
    }

    // Calculate metrics
    const winningTrades = allTrades.filter(t => t.pnl > 0);
    const losingTrades = allTrades.filter(t => t.pnl < 0);

    const totalWinAmount = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
    const totalLossAmount = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));

    const avgWinAmount = winningTrades.length > 0 ? totalWinAmount / winningTrades.length : 0;
    const avgLossAmount = losingTrades.length > 0 ? totalLossAmount / losingTrades.length : 0;

    // Calculate trading days (unique dates)
    const tradingDays = new Set(allTrades.map(t =>
      new Date(t.createdAt).toISOString().split('T')[0]
    ));
    const actualDaysTraded = tradingDays.size || 1;

    const winRate = allTrades.length > 0
      ? (winningTrades.length / allTrades.length) * 100
      : 0;

    return {
      winRate,
      avgWinPips: avgWinAmount / this.DEFAULT_CONFIG.cryptoPipValue,
      avgLossPips: avgLossAmount / this.DEFAULT_CONFIG.cryptoPipValue,
      avgWinAmount,
      avgLossAmount,
      avgTradesPerDay: allTrades.length / actualDaysTraded,
      totalTradesAnalyzed: allTrades.length,
      daysAnalyzed: actualDaysTraded,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length
    };
  }

  /**
   * Calculate daily profit/loss breakdown by date
   */
  async getDailyBreakdown(userId: string, days: number = 30): Promise<Map<string, { profit: number; trades: number }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const mt4Positions = await MT4Position.find({
      userId,
      status: { $in: ['closed', 'auto-closed'] },
      closedAt: { $gte: startDate }
    });

    const dailyMap = new Map<string, { profit: number; trades: number }>();

    for (const pos of mt4Positions) {
      const dateKey = pos.closedAt
        ? new Date(pos.closedAt).toISOString().split('T')[0]
        : new Date(pos.openedAt).toISOString().split('T')[0];

      const existing = dailyMap.get(dateKey) || { profit: 0, trades: 0 };
      existing.profit += pos.profit || 0;
      existing.trades += 1;
      dailyMap.set(dateKey, existing);
    }

    return dailyMap;
  }

  /**
   * Generate full profit estimation report
   */
  async generateProfitEstimation(
    userId: string,
    config?: Partial<ProfitEstimationConfig>,
    historicalDays: number = 30
  ): Promise<ProfitEstimationReport> {
    const finalConfig: ProfitEstimationConfig = {
      ...this.DEFAULT_CONFIG,
      ...config
    };

    // Get historical metrics
    const historical = await this.calculateHistoricalMetrics(userId, historicalDays);

    // Get daily breakdown for risk metrics
    const dailyBreakdown = await this.getDailyBreakdown(userId, historicalDays);

    // Calculate daily estimates based on historical performance
    const estimatedOrders = historical.avgTradesPerDay;
    const estimatedWins = estimatedOrders * (historical.winRate / 100);
    const estimatedLosses = estimatedOrders * (1 - historical.winRate / 100);

    const winProfitUSD = estimatedWins * historical.avgWinAmount;
    const lossCostUSD = estimatedLosses * historical.avgLossAmount;
    const netProfitUSD = winProfitUSD - lossCostUSD;
    const netProfitPips = netProfitUSD / finalConfig.cryptoPipValue;

    const dailyEstimate: DailyEstimate = {
      estimatedOrders: Math.round(estimatedOrders * 10) / 10,
      estimatedWins: Math.round(estimatedWins * 10) / 10,
      estimatedLosses: Math.round(estimatedLosses * 10) / 10,
      winProfitUSD: Math.round(winProfitUSD * 100) / 100,
      lossCostUSD: Math.round(lossCostUSD * 100) / 100,
      netProfitUSD: Math.round(netProfitUSD * 100) / 100,
      netProfitPips: Math.round(netProfitPips * 10) / 10
    };

    // Calculate projections
    const dailyROI = finalConfig.totalBudget > 0
      ? (netProfitUSD / finalConfig.totalBudget) * 100
      : 0;

    const projections: Projections = {
      weeklyProfitUSD: Math.round(netProfitUSD * 5 * 100) / 100,   // 5 trading days
      monthlyProfitUSD: Math.round(netProfitUSD * 22 * 100) / 100, // 22 trading days
      dailyROIPercent: Math.round(dailyROI * 100) / 100,
      weeklyROIPercent: Math.round(dailyROI * 5 * 100) / 100,
      monthlyROIPercent: Math.round(dailyROI * 22 * 100) / 100
    };

    // Calculate risk metrics
    const capitalAtRisk = finalConfig.parallelOrders * finalConfig.amountPerOrder;
    const dailyProfits = Array.from(dailyBreakdown.values()).map(d => d.profit);

    let maxDrawdown = 0;
    let runningProfit = 0;
    let peak = 0;

    for (const profit of dailyProfits) {
      runningProfit += profit;
      if (runningProfit > peak) {
        peak = runningProfit;
      }
      const drawdown = peak - runningProfit;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    const risk: RiskMetrics = {
      capitalAtRisk,
      capitalAtRiskPercent: finalConfig.totalBudget > 0
        ? Math.round((capitalAtRisk / finalConfig.totalBudget) * 10000) / 100
        : 0,
      maxObservedDrawdown: Math.round(maxDrawdown * 100) / 100,
      worstDayLoss: dailyProfits.length > 0
        ? Math.round(Math.abs(Math.min(...dailyProfits, 0)) * 100) / 100
        : 0,
      bestDayProfit: dailyProfits.length > 0
        ? Math.round(Math.max(...dailyProfits, 0) * 100) / 100
        : 0
    };

    return {
      config: finalConfig,
      historical,
      dailyEstimate,
      projections,
      risk,
      generatedAt: new Date()
    };
  }

  /**
   * Get a summary string for logging/display
   */
  formatReportSummary(report: ProfitEstimationReport): string {
    return `
📊 PROFIT ESTIMATION REPORT
============================
Budget: $${report.config.totalBudget} | ${report.config.parallelOrders} orders @ $${report.config.amountPerOrder}

📈 HISTORICAL PERFORMANCE (${report.historical.daysAnalyzed} days, ${report.historical.totalTradesAnalyzed} trades)
   Win Rate: ${report.historical.winRate.toFixed(1)}%
   Avg Win: $${report.historical.avgWinAmount.toFixed(2)} (${report.historical.avgWinPips.toFixed(1)} pips)
   Avg Loss: $${report.historical.avgLossAmount.toFixed(2)} (${report.historical.avgLossPips.toFixed(1)} pips)
   Trades/Day: ${report.historical.avgTradesPerDay.toFixed(1)}

💰 DAILY ESTIMATE
   Orders: ${report.dailyEstimate.estimatedOrders} (Wins: ${report.dailyEstimate.estimatedWins}, Losses: ${report.dailyEstimate.estimatedLosses})
   Gross Profit: $${report.dailyEstimate.winProfitUSD.toFixed(2)}
   Gross Loss: $${report.dailyEstimate.lossCostUSD.toFixed(2)}
   Net Profit: $${report.dailyEstimate.netProfitUSD.toFixed(2)} (${report.dailyEstimate.netProfitPips.toFixed(1)} pips)

📅 PROJECTIONS
   Weekly: $${report.projections.weeklyProfitUSD.toFixed(2)} (${report.projections.weeklyROIPercent.toFixed(2)}% ROI)
   Monthly: $${report.projections.monthlyProfitUSD.toFixed(2)} (${report.projections.monthlyROIPercent.toFixed(2)}% ROI)

⚠️ RISK METRICS
   Capital at Risk: $${report.risk.capitalAtRisk} (${report.risk.capitalAtRiskPercent.toFixed(1)}%)
   Max Drawdown: $${report.risk.maxObservedDrawdown.toFixed(2)}
   Worst Day: -$${report.risk.worstDayLoss.toFixed(2)}
   Best Day: +$${report.risk.bestDayProfit.toFixed(2)}
`;
  }
}

export const profitEstimationService = new ProfitEstimationService();
