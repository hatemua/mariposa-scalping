import mongoose from 'mongoose';
import dotenv from 'dotenv';
import BroadcastedSignal from '../src/models/BroadcastedSignal';
import AgentSignalLogModel from '../src/models/AgentSignalLog';
import { ScalpingAgent } from '../src/models';
import Trade from '../src/models/Trade';

dotenv.config();

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

interface SignalStats {
  totalSignals: number;
  avgConfidence: number;
  confidenceDistribution: { [key: string]: number };
  byRecommendation: { [key: string]: number };
}

interface AgentStats {
  totalAgentsConsidered: number;
  excluded: number;
  validated: number;
  rejected: number;
  validationRate: number;
}

interface MT4Stats {
  mt4AgentsTotal: number;
  mt4AgentsActive: number;
  mt4SignalsExecuted: number;
  mt4ExecutionRate: number;
}

interface ExecutionStats {
  executed: number;
  pending: number;
  failed: number;
  filtered: number;
  executionRate: number;
}

async function connectToDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mariposa-scalping';

  try {
    await mongoose.connect(mongoUri);
    console.log(`${colors.green}✓ Connected to MongoDB${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}✗ MongoDB connection error:${colors.reset}`, error);
    process.exit(1);
  }
}

async function getSignalGenerationStats(daysBack: number = 7): Promise<SignalStats> {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);

  const signals = await BroadcastedSignal.find({
    category: 'FIBONACCI_SCALPING',
    broadcastedAt: { $gte: dateFrom }
  });

  const stats: SignalStats = {
    totalSignals: signals.length,
    avgConfidence: 0,
    confidenceDistribution: {
      '70-75%': 0,
      '75-80%': 0,
      '80-85%': 0,
      '85-90%': 0,
      '90-100%': 0
    },
    byRecommendation: {
      BUY: 0,
      SELL: 0,
      HOLD: 0
    }
  };

  if (signals.length === 0) return stats;

  let totalConfidence = 0;

  signals.forEach(signal => {
    const confidence = signal.confidence * 100; // Convert to percentage
    totalConfidence += confidence;

    // Confidence distribution
    if (confidence >= 70 && confidence < 75) stats.confidenceDistribution['70-75%']++;
    else if (confidence >= 75 && confidence < 80) stats.confidenceDistribution['75-80%']++;
    else if (confidence >= 80 && confidence < 85) stats.confidenceDistribution['80-85%']++;
    else if (confidence >= 85 && confidence < 90) stats.confidenceDistribution['85-90%']++;
    else if (confidence >= 90) stats.confidenceDistribution['90-100%']++;

    // By recommendation
    stats.byRecommendation[signal.recommendation]++;
  });

  stats.avgConfidence = totalConfidence / signals.length;

  return stats;
}

async function getAgentProcessingStats(daysBack: number = 7): Promise<AgentStats> {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);

  const logs = await AgentSignalLogModel.find({
    signalCategory: 'FIBONACCI_SCALPING',
    processedAt: { $gte: dateFrom }
  });

  const stats: AgentStats = {
    totalAgentsConsidered: logs.length,
    excluded: 0,
    validated: 0,
    rejected: 0,
    validationRate: 0
  };

  logs.forEach(log => {
    if (log.status === 'EXCLUDED') stats.excluded++;
    else if (log.status === 'VALIDATED' || log.status === 'EXECUTED') stats.validated++;
    else if (log.status === 'REJECTED') stats.rejected++;
  });

  if (stats.totalAgentsConsidered > 0) {
    stats.validationRate = (stats.validated / stats.totalAgentsConsidered) * 100;
  }

  return stats;
}

async function getMT4SpecificStats(daysBack: number = 7): Promise<MT4Stats> {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);

  // Get all MT4 agents
  const mt4Agents = await ScalpingAgent.find({ broker: 'MT4' });
  const mt4ActiveAgents = await ScalpingAgent.find({ broker: 'MT4', isActive: true });

  // Get MT4 signal executions
  const mt4Logs = await AgentSignalLogModel.find({
    signalCategory: 'FIBONACCI_SCALPING',
    processedAt: { $gte: dateFrom },
    status: 'EXECUTED'
  }).populate('agentId');

  const mt4Executed = mt4Logs.filter((log: any) => {
    return log.agentId && log.agentId.broker === 'MT4';
  }).length;

  const totalMT4Logs = await AgentSignalLogModel.countDocuments({
    signalCategory: 'FIBONACCI_SCALPING',
    processedAt: { $gte: dateFrom }
  });

  const stats: MT4Stats = {
    mt4AgentsTotal: mt4Agents.length,
    mt4AgentsActive: mt4ActiveAgents.length,
    mt4SignalsExecuted: mt4Executed,
    mt4ExecutionRate: totalMT4Logs > 0 ? (mt4Executed / totalMT4Logs) * 100 : 0
  };

  return stats;
}

async function getExecutionStats(daysBack: number = 7): Promise<ExecutionStats> {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);

  const logs = await AgentSignalLogModel.find({
    signalCategory: 'FIBONACCI_SCALPING',
    processedAt: { $gte: dateFrom }
  });

  const stats: ExecutionStats = {
    executed: 0,
    pending: 0,
    failed: 0,
    filtered: 0,
    executionRate: 0
  };

  logs.forEach(log => {
    const status = log.status as string; // Type assertion for extended status values
    if (status === 'EXECUTED') stats.executed++;
    else if (status === 'VALIDATED' && !log.executed) stats.pending++;
    else if (status === 'FAILED') stats.failed++;
    else if (status === 'FILTERED') stats.filtered++;
  });

  const totalValidated = logs.filter(l => l.status === 'VALIDATED' || l.status === 'EXECUTED').length;
  if (totalValidated > 0) {
    stats.executionRate = (stats.executed / totalValidated) * 100;
  }

  return stats;
}

async function getRecentSignals(limit: number = 10) {
  const signals = await BroadcastedSignal.find({
    category: 'FIBONACCI_SCALPING'
  })
    .sort({ broadcastedAt: -1 })
    .limit(limit);

  const detailedSignals = [];

  for (const signal of signals) {
    const logs = await AgentSignalLogModel.find({ signalId: signal.signalId });

    const statusBreakdown = {
      excluded: logs.filter(l => l.status === 'EXCLUDED').length,
      validated: logs.filter(l => l.status === 'VALIDATED').length,
      rejected: logs.filter(l => l.status === 'REJECTED').length,
      executed: logs.filter(l => l.status === 'EXECUTED').length,
      filtered: logs.filter(l => (l.status as string) === 'FILTERED').length
    };

    detailedSignals.push({
      signalId: signal.signalId,
      symbol: signal.symbol,
      recommendation: signal.recommendation,
      confidence: (signal.confidence * 100).toFixed(2),
      broadcastedAt: signal.broadcastedAt,
      totalAgents: signal.totalAgentsConsidered,
      statusBreakdown
    });
  }

  return detailedSignals;
}

async function getExclusionReasons(daysBack: number = 7) {
  const dateFrom = new Date();
  dateFrom.setDate(dateFrom.getDate() - daysBack);

  const excludedLogs = await AgentSignalLogModel.find({
    signalCategory: 'FIBONACCI_SCALPING',
    processedAt: { $gte: dateFrom },
    status: 'EXCLUDED'
  });

  const reasonCounts: { [key: string]: number } = {};

  excludedLogs.forEach(log => {
    if (log.exclusionReasons && log.exclusionReasons.length > 0) {
      log.exclusionReasons.forEach(reason => {
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      });
    }
  });

  return Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
}

async function analyzeSignals() {
  console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}   BTC FIBONACCI SCALPING SIGNAL ANALYSIS${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);

  const daysBack = 7;
  console.log(`${colors.bright}Period: Last ${daysBack} days${colors.reset}\n`);

  // 1. Signal Generation Stats
  console.log(`${colors.bright}${colors.blue}[1] SIGNAL GENERATION${colors.reset}`);
  const signalStats = await getSignalGenerationStats(daysBack);

  if (signalStats.totalSignals === 0) {
    console.log(`${colors.red}   ⚠️  NO SIGNALS GENERATED IN LAST ${daysBack} DAYS${colors.reset}`);
    console.log(`${colors.yellow}   Possible reasons:${colors.reset}`);
    console.log(`      - WebSocket not connected to Binance`);
    console.log(`      - BTC Fibonacci service not started`);
    console.log(`      - Confidence threshold not met (< 70%)`);
    console.log(`      - LLM API issues (rate limiting, errors)`);
    console.log(`      - Market conditions not favorable\n`);
  } else {
    console.log(`   Total Signals: ${colors.green}${signalStats.totalSignals}${colors.reset}`);
    console.log(`   Average Confidence: ${colors.green}${signalStats.avgConfidence.toFixed(2)}%${colors.reset}`);
    console.log(`   Confidence Distribution:`);
    Object.entries(signalStats.confidenceDistribution).forEach(([range, count]) => {
      const percentage = ((count / signalStats.totalSignals) * 100).toFixed(1);
      console.log(`      ${range}: ${count} signals (${percentage}%)`);
    });
    console.log(`   By Recommendation:`);
    Object.entries(signalStats.byRecommendation).forEach(([rec, count]) => {
      const color = rec === 'BUY' ? colors.green : rec === 'SELL' ? colors.red : colors.yellow;
      console.log(`      ${color}${rec}${colors.reset}: ${count}`);
    });
    console.log();
  }

  // 2. Agent Processing Stats
  console.log(`${colors.bright}${colors.blue}[2] AGENT PROCESSING${colors.reset}`);
  const agentStats = await getAgentProcessingStats(daysBack);

  if (agentStats.totalAgentsConsidered === 0) {
    console.log(`${colors.yellow}   No agent processing data available${colors.reset}\n`);
  } else {
    console.log(`   Total Agent Interactions: ${agentStats.totalAgentsConsidered}`);
    console.log(`   Excluded: ${colors.red}${agentStats.excluded}${colors.reset} (${((agentStats.excluded / agentStats.totalAgentsConsidered) * 100).toFixed(1)}%)`);
    console.log(`   Validated: ${colors.green}${agentStats.validated}${colors.reset} (${agentStats.validationRate.toFixed(1)}%)`);
    console.log(`   Rejected: ${colors.red}${agentStats.rejected}${colors.reset} (${((agentStats.rejected / agentStats.totalAgentsConsidered) * 100).toFixed(1)}%)`);
    console.log();

    // Get top exclusion reasons
    const exclusionReasons = await getExclusionReasons(daysBack);
    if (exclusionReasons.length > 0) {
      console.log(`   Top Exclusion Reasons:`);
      exclusionReasons.forEach(([reason, count]) => {
        console.log(`      - ${reason}: ${count}`);
      });
      console.log();
    }
  }

  // 3. MT4 Specific
  console.log(`${colors.bright}${colors.blue}[3] MT4 SPECIFIC ANALYSIS${colors.reset}`);
  const mt4Stats = await getMT4SpecificStats(daysBack);
  console.log(`   MT4 Agents Available: ${mt4Stats.mt4AgentsTotal}`);
  console.log(`   MT4 Agents Active: ${colors.green}${mt4Stats.mt4AgentsActive}${colors.reset}`);
  console.log(`   MT4 Signals Executed: ${colors.green}${mt4Stats.mt4SignalsExecuted}${colors.reset}`);
  console.log(`   MT4 Execution Rate: ${colors.green}${mt4Stats.mt4ExecutionRate.toFixed(1)}%${colors.reset}\n`);

  // 4. Execution Status
  console.log(`${colors.bright}${colors.blue}[4] EXECUTION STATUS${colors.reset}`);
  const execStats = await getExecutionStats(daysBack);
  console.log(`   Executed: ${colors.green}${execStats.executed}${colors.reset}`);
  console.log(`   Pending: ${colors.yellow}${execStats.pending}${colors.reset}`);
  console.log(`   Failed: ${colors.red}${execStats.failed}${colors.reset}`);
  console.log(`   Filtered: ${colors.magenta}${execStats.filtered}${colors.reset}`);
  console.log(`   Execution Rate: ${colors.green}${execStats.executionRate.toFixed(1)}%${colors.reset}\n`);

  // 5. Recent Signals
  console.log(`${colors.bright}${colors.blue}[5] RECENT SIGNALS (Last 10)${colors.reset}`);
  const recentSignals = await getRecentSignals(10);

  if (recentSignals.length === 0) {
    console.log(`${colors.yellow}   No recent signals found${colors.reset}\n`);
  } else {
    recentSignals.forEach((signal, index) => {
      const recColor = signal.recommendation === 'BUY' ? colors.green : colors.red;
      console.log(`   ${index + 1}. ${signal.symbol} - ${recColor}${signal.recommendation}${colors.reset} (${signal.confidence}%)`);
      console.log(`      Signal ID: ${signal.signalId}`);
      console.log(`      Time: ${signal.broadcastedAt.toLocaleString()}`);
      console.log(`      Status: Excluded=${signal.statusBreakdown.excluded}, Validated=${signal.statusBreakdown.validated}, Rejected=${signal.statusBreakdown.rejected}, Executed=${colors.green}${signal.statusBreakdown.executed}${colors.reset}, Filtered=${signal.statusBreakdown.filtered}`);
      console.log();
    });
  }

  // 6. Recommendations
  console.log(`${colors.bright}${colors.blue}[6] RECOMMENDATIONS${colors.reset}`);

  if (signalStats.totalSignals === 0) {
    console.log(`   ${colors.red}⚠️  CRITICAL: No signals generated${colors.reset}`);
    console.log(`      → Check if BTC Fibonacci service is running`);
    console.log(`      → Verify Binance WebSocket connection`);
    console.log(`      → Check LLM API connectivity and quota`);
    console.log(`      → Review server logs for errors\n`);
  } else if (signalStats.totalSignals < 10) {
    console.log(`   ${colors.yellow}⚠️  Low signal count (${signalStats.totalSignals} signals)${colors.reset}`);
    console.log(`      → Market may be ranging (low volatility)`);
    console.log(`      → Confidence threshold may be too strict (70%)`);
    console.log(`      → Review LLM pattern detection accuracy\n`);
  }

  if (agentStats.excluded > agentStats.validated && agentStats.totalAgentsConsidered > 0) {
    console.log(`   ${colors.yellow}⚠️  High exclusion rate (${((agentStats.excluded / agentStats.totalAgentsConsidered) * 100).toFixed(1)}%)${colors.reset}`);
    console.log(`      → Check agent balances (minimum $10 required)`);
    console.log(`      → Review max open positions settings`);
    console.log(`      → Verify agent active status\n`);
  }

  if (mt4Stats.mt4AgentsActive === 0) {
    console.log(`   ${colors.red}⚠️  CRITICAL: No active MT4 agents${colors.reset}`);
    console.log(`      → Activate at least one MT4 agent for BTC scalping`);
    console.log(`      → Ensure agent has sufficient balance`);
    console.log(`      → Verify MT4 credentials are correct\n`);
  }

  if (execStats.executed === 0 && agentStats.validated > 0) {
    console.log(`   ${colors.red}⚠️  CRITICAL: Validated signals not executing${colors.reset}`);
    console.log(`      → Check Redis queue connection`);
    console.log(`      → Verify validatedSignalExecutor is running`);
    console.log(`      → Review MT4 service connectivity`);
    console.log(`      → Check for execution errors in logs\n`);
  }

  if (execStats.filtered > 0) {
    console.log(`   ${colors.magenta}ℹ️  ${execStats.filtered} signals filtered (symbol not available)${colors.reset}`);
    console.log(`      → This should be resolved with BTCUSD mapping fix\n`);
  }

  console.log(`${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════${colors.reset}\n`);
}

async function main() {
  try {
    await connectToDatabase();
    await analyzeSignals();
  } catch (error) {
    console.error(`${colors.red}Error during analysis:${colors.reset}`, error);
  } finally {
    await mongoose.disconnect();
    console.log(`${colors.green}✓ Disconnected from MongoDB${colors.reset}`);
  }
}

main();
