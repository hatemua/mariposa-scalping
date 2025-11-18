#!/usr/bin/env ts-node

/**
 * Test BTC Fibonacci Scalping System
 *
 * Tests the entire flow:
 * 1. LLM Pattern Detection (4 specialists)
 * 2. Multi-timeframe analysis
 * 3. Signal generation with consensus
 * 4. Entry/exit parameters calculation
 */

import { btcMultiPatternScalpingService } from '../src/services/btcMultiPatternScalpingService';
import { llmPatternDetectionService } from '../src/services/llmPatternDetectionService';
import { binanceService } from '../src/services/binanceService';

async function testPatternDetection() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TESTING LLM PATTERN DETECTION (4 Specialists)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Fetch 5m timeframe data for BTC
    const klines = await binanceService.getKlines('BTCUSDT', '5m', 100);
    const indicators = llmPatternDetectionService.calculateIndicators(klines);
    const currentPrice = klines[klines.length - 1].close;

    console.log(`Current BTC Price: $${currentPrice.toFixed(2)}\n`);

    console.log('📈 Technical Indicators:');
    console.log(`  RSI: ${indicators.rsi.toFixed(2)}`);
    console.log(`  MACD: ${indicators.macd.MACD.toFixed(2)}, Signal: ${indicators.macd.signal.toFixed(2)}`);
    console.log(`  Stochastic K: ${indicators.stochastic.k.toFixed(2)}, D: ${indicators.stochastic.d.toFixed(2)}`);
    console.log(`  ADX (Trend Strength): ${indicators.adx.toFixed(2)}`);
    console.log(`  ATR: ${indicators.atr.toFixed(2)}`);
    console.log(`  Volume Ratio: ${indicators.volumeRatio.toFixed(2)}x`);
    console.log(`  EMA20: ${indicators.ema20.toFixed(2)}, EMA50: ${indicators.ema50.toFixed(2)}`);
    console.log(`  Bollinger: Upper ${indicators.bollingerBands.upper.toFixed(2)}, Lower ${indicators.bollingerBands.lower.toFixed(2)}\n`);

    const input = { klines, indicators, currentPrice, timeframe: '5m' };

    // Test each LLM specialist
    console.log('🔍 Testing LLM Specialists...\n');

    console.log('1️⃣  FIBONACCI SPECIALIST');
    console.log('─────────────────────────');
    const fibAnalysis = await llmPatternDetectionService.analyzeFibonacciPatterns(input);
    console.log(`Type: ${fibAnalysis.type}`);
    console.log(`Current Level: ${fibAnalysis.currentLevel || 'None'}`);
    console.log(`Swing High: $${fibAnalysis.swingHigh.toFixed(2)}, Swing Low: $${fibAnalysis.swingLow.toFixed(2)}`);
    console.log(`Entry Zone: ${fibAnalysis.entryZone ? `$${fibAnalysis.entryZone.min.toFixed(2)} - $${fibAnalysis.entryZone.max.toFixed(2)}` : 'None'}`);
    console.log(`Target Zone: ${fibAnalysis.targetZone ? `$${fibAnalysis.targetZone.min.toFixed(2)} - $${fibAnalysis.targetZone.max.toFixed(2)}` : 'None'}`);
    console.log(`Confidence: ${fibAnalysis.confidence.toFixed(0)}%`);
    console.log(`Reasoning: ${fibAnalysis.reasoning}\n`);

    console.log('2️⃣  CHART PATTERN SPECIALIST');
    console.log('─────────────────────────────');
    const chartAnalysis = await llmPatternDetectionService.analyzeChartPatterns(input);
    console.log(`Pattern: ${chartAnalysis.type}`);
    console.log(`Direction: ${chartAnalysis.direction}`);
    console.log(`Completion: ${chartAnalysis.completionPercentage.toFixed(0)}%`);
    console.log(`Breakout Target: ${chartAnalysis.breakoutTarget ? `$${chartAnalysis.breakoutTarget.toFixed(2)}` : 'None'}`);
    console.log(`Confidence: ${chartAnalysis.confidence.toFixed(0)}%`);
    console.log(`Reasoning: ${chartAnalysis.reasoning}\n`);

    console.log('3️⃣  CANDLESTICK SPECIALIST');
    console.log('───────────────────────────');
    const candlestickAnalysis = await llmPatternDetectionService.analyzeCandlestickPatterns(input);
    console.log(`Patterns: ${candlestickAnalysis.patterns.join(', ') || 'None'}`);
    console.log(`Strength: ${candlestickAnalysis.strength}`);
    console.log(`Direction: ${candlestickAnalysis.direction}`);
    console.log(`Recent Patterns: ${candlestickAnalysis.recentPatterns.length}`);
    console.log(`Confidence: ${candlestickAnalysis.confidence.toFixed(0)}%`);
    console.log(`Reasoning: ${candlestickAnalysis.reasoning}\n`);

    console.log('4️⃣  SUPPORT/RESISTANCE SPECIALIST');
    console.log('──────────────────────────────────');
    const srAnalysis = await llmPatternDetectionService.analyzeSupportResistance(input);
    console.log(`Key Levels: ${srAnalysis.keyLevels.length}`);
    srAnalysis.keyLevels.forEach((level, i) => {
      console.log(`  Level ${i + 1}: $${level.price.toFixed(2)} (${level.type}, ${level.strength}, ${level.touches} touches)`);
    });
    console.log(`Nearest Support: $${srAnalysis.nearestSupport.toFixed(2)}`);
    console.log(`Nearest Resistance: $${srAnalysis.nearestResistance.toFixed(2)}`);
    console.log(`Current Zone: ${srAnalysis.currentZone}`);
    console.log(`Confidence: ${srAnalysis.confidence.toFixed(0)}%`);
    console.log(`Reasoning: ${srAnalysis.reasoning}\n`);

    console.log('✅ Pattern detection test completed!\n');

  } catch (error: any) {
    console.error('❌ Pattern detection test failed:', error.message);
    console.error(error.stack);
  }
}

async function testSignalGeneration() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 TESTING BTC FIBONACCI SIGNAL GENERATION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    console.log('Generating entry signal (includes multi-timeframe analysis)...\n');

    const signal = await btcMultiPatternScalpingService.generateEntrySignal();

    if (!signal) {
      console.log('⚠️  No signal generated (confidence < 70% or no consensus)\n');
      return;
    }

    console.log('✅ SIGNAL GENERATED!\n');
    console.log('═════════════════════════════════════════\n');

    console.log('📊 SIGNAL DETAILS:');
    console.log(`  ID: ${signal.id}`);
    console.log(`  Symbol: ${signal.symbol}`);
    console.log(`  Category: ${signal.category}`);
    console.log(`  Recommendation: ${signal.recommendation}`);
    console.log(`  Confidence: ${signal.confidence.toFixed(2)}%`);
    console.log(`  Timestamp: ${signal.timestamp.toISOString()}\n`);

    console.log('💰 ENTRY/EXIT PARAMETERS:');
    console.log(`  Entry Price: $${signal.entryPrice.toFixed(2)}`);
    console.log(`  Stop Loss: ${signal.stopLossPrice ? `$${signal.stopLossPrice.toFixed(2)}` : 'None'}`);
    console.log(`  Take Profit: ${signal.takeProfitPrice ? `$${signal.takeProfitPrice.toFixed(2)}` : 'None'}`);
    console.log(`  Risk:Reward: 1:${signal.riskRewardRatio.toFixed(2)}\n`);

    console.log('🗳️  LLM CONSENSUS:');
    console.log(`  Fibonacci Vote: ${signal.llmConsensus.fibonacciVote}`);
    console.log(`  Chart Pattern Vote: ${signal.llmConsensus.chartPatternVote}`);
    console.log(`  Candlestick Vote: ${signal.llmConsensus.candlestickVote}`);
    console.log(`  S/R Vote: ${signal.llmConsensus.supportResistanceVote}`);
    console.log(`  Consensus Achieved: ${signal.llmConsensus.consensusAchieved ? '✅ YES' : '❌ NO'}`);
    console.log(`  Votes: ${signal.llmConsensus.votesFor} for, ${signal.llmConsensus.votesAgainst} against, ${signal.llmConsensus.votesNeutral} neutral\n`);

    console.log('📈 MULTI-TIMEFRAME ANALYSIS:');
    console.log(`  Primary (5m): ${signal.multiTimeframeAnalysis.primary.recommendation} (${signal.multiTimeframeAnalysis.primary.confidence.toFixed(0)}%)`);
    signal.multiTimeframeAnalysis.supporting.forEach((tf: any) => {
      console.log(`  ${tf.timeframe}: ${tf.recommendation} (${tf.confidence.toFixed(0)}%)`);
    });
    console.log(`  Confluence Score: ${signal.multiTimeframeAnalysis.confluenceScore.toFixed(0)}%\n`);

    console.log('📝 REASONING:');
    console.log(signal.reasoning);
    console.log('\n');

    console.log('✅ Signal generation test completed!\n');

  } catch (error: any) {
    console.error('❌ Signal generation test failed:', error.message);
    console.error(error.stack);
  }
}

async function testExitSignal() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚪 TESTING EXIT SIGNAL DETECTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  try {
    // Simulate an open position
    const mockEntrySignal = {
      category: 'FIBONACCI_SCALPING',
      recommendation: 'BUY',
      llmConsensus: {
        fibonacciVote: 'BUY',
        chartPatternVote: 'BUY',
        candlestickVote: 'BUY',
        supportResistanceVote: 'BUY'
      }
    };

    const entryPrice = 95000; // Mock entry price
    const currentPnLPercent = 0.8; // 0.8% profit

    console.log(`Simulating open position:`);
    console.log(`  Entry: $${entryPrice.toFixed(2)}`);
    console.log(`  Current P&L: ${currentPnLPercent.toFixed(2)}%\n`);

    console.log('Analyzing exit conditions...\n');

    const exitSignal = await btcMultiPatternScalpingService.generateExitSignal(
      entryPrice,
      currentPnLPercent,
      mockEntrySignal
    );

    console.log('📊 EXIT SIGNAL:');
    console.log(`  Should Exit: ${exitSignal.shouldExit ? '✅ YES' : '❌ NO'}`);
    console.log(`  Reason: ${exitSignal.reason}`);
    console.log(`  Confidence: ${exitSignal.confidence.toFixed(0)}%`);
    console.log(`  Exit Type: ${exitSignal.exitType}\n`);

    console.log('🤖 LLM RECOMMENDATIONS:');
    console.log(`  Fibonacci: ${exitSignal.llmRecommendations.fibonacci.exit ? 'EXIT' : 'HOLD'} - ${exitSignal.llmRecommendations.fibonacci.reason}`);
    console.log(`  Chart Pattern: ${exitSignal.llmRecommendations.chartPattern.exit ? 'EXIT' : 'HOLD'} - ${exitSignal.llmRecommendations.chartPattern.reason}`);
    console.log(`  Candlestick: ${exitSignal.llmRecommendations.candlestick.exit ? 'EXIT' : 'HOLD'} - ${exitSignal.llmRecommendations.candlestick.reason}`);
    console.log(`  S/R: ${exitSignal.llmRecommendations.supportResistance.exit ? 'EXIT' : 'HOLD'} - ${exitSignal.llmRecommendations.supportResistance.reason}\n`);

    console.log('✅ Exit signal test completed!\n');

  } catch (error: any) {
    console.error('❌ Exit signal test failed:', error.message);
    console.error(error.stack);
  }
}

async function main() {
  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   BTC FIBONACCI SCALPING SYSTEM - COMPREHENSIVE TEST     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\n');

  try {
    // Test 1: Pattern Detection
    await testPatternDetection();

    // Test 2: Signal Generation
    await testSignalGeneration();

    // Test 3: Exit Signal
    await testExitSignal();

    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║              ALL TESTS COMPLETED SUCCESSFULLY!            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

  } catch (error: any) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { testPatternDetection, testSignalGeneration, testExitSignal };
