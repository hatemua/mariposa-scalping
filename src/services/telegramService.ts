import TelegramBot from 'node-telegram-bot-api';
import { redisService } from './redisService';

interface SignalNotification {
  id: string;
  symbol: string;
  recommendation: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  targetPrice?: number;
  stopLoss?: number;
  entryPrice?: number;
  reasoning: string;
  category?: string;
  priority: number;
  timestamp: Date;
}

interface BroadcastStats {
  totalAgents: number;
  validatedAgents: number;
  rejectedAgents: number;
}

export class TelegramService {
  private bot: TelegramBot | null = null;
  private chatId: string | null = null;
  private enabled: boolean = false;
  private messageQueue: Array<{ message: string; priority: number }> = [];
  private isProcessingQueue = false;
  private readonly MESSAGE_DELAY_MS = 3000; // 3 seconds between messages to avoid rate limiting

  constructor() {
    this.initialize();
  }

  /**
   * Initialize Telegram bot
   */
  private initialize() {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      const enabled = process.env.TELEGRAM_ENABLED === 'true';

      if (!enabled) {
        console.log('📱 Telegram notifications disabled');
        return;
      }

      if (!botToken || !chatId) {
        console.warn('⚠️  Telegram enabled but missing BOT_TOKEN or CHAT_ID');
        return;
      }

      this.bot = new TelegramBot(botToken, { polling: false });
      this.chatId = chatId;
      this.enabled = true;

      console.log('✅ Telegram bot initialized successfully');
      console.log(`📱 Will send notifications to chat: ${chatId}`);
    } catch (error) {
      console.error('❌ Failed to initialize Telegram bot:', error);
      this.enabled = false;
    }
  }

  /**
   * Send trading signal notification to Telegram group
   */
  async sendSignalNotification(
    signal: SignalNotification,
    stats: BroadcastStats
  ): Promise<void> {
    if (!this.enabled || !this.bot || !this.chatId) {
      return; // Silently skip if not enabled
    }

    try {
      // Check if signal was already sent (prevent duplicates)
      // Use composite key: symbol + recommendation + time window (5 minutes)
      // This prevents multiple agents from sending duplicate notifications for the same trading opportunity
      const timeWindow = Math.floor(Date.now() / (5 * 60 * 1000)); // 5-minute windows
      const redisKey = `telegram:sent:${signal.symbol}:${signal.recommendation}:${timeWindow}`;
      const alreadySent = await redisService.get(redisKey);

      if (alreadySent) {
        console.log(`📱 Skipping duplicate Telegram notification for ${signal.symbol} ${signal.recommendation} (already sent in this 5-min window)`);
        return;
      }

      const message = await this.formatSignalMessage(signal, stats);

      // Add to queue with priority
      this.messageQueue.push({
        message,
        priority: signal.priority
      });

      // Sort queue by priority (highest first)
      this.messageQueue.sort((a, b) => b.priority - a.priority);

      // Mark signal as sent (24 hour TTL to prevent old duplicates)
      await redisService.set(redisKey, 'sent', 86400); // 24 hours in seconds

      // Start processing queue if not already processing
      if (!this.isProcessingQueue) {
        this.processMessageQueue();
      }

      console.log(`📱 Queued Telegram notification for ${signal.symbol} (priority: ${signal.priority})`);
    } catch (error) {
      console.error('❌ Error queuing Telegram message:', error);
      // Don't throw - we don't want to break trading if Telegram fails
    }
  }

  /**
   * Process message queue with rate limiting
   */
  private async processMessageQueue(): Promise<void> {
    if (this.isProcessingQueue || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.messageQueue.length > 0) {
      const item = this.messageQueue.shift();
      if (!item) break;

      try {
        await this.sendMessage(item.message);
        console.log('✅ Telegram message sent successfully');

        // Wait before sending next message to avoid rate limiting
        if (this.messageQueue.length > 0) {
          await this.delay(this.MESSAGE_DELAY_MS);
        }
      } catch (error) {
        console.error('❌ Failed to send Telegram message:', error);
        // Continue with next message
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Send message to Telegram chat
   */
  private async sendMessage(message: string): Promise<void> {
    if (!this.bot || !this.chatId) {
      throw new Error('Telegram bot not initialized');
    }

    await this.bot.sendMessage(this.chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  }

  /**
   * Format signal as Telegram message with rich formatting
   */
  private async formatSignalMessage(
    signal: SignalNotification,
    stats: BroadcastStats
  ): Promise<string> {
    const emoji = this.getRecommendationEmoji(signal.recommendation);
    const priorityLabel = this.getPriorityLabel(signal.priority);
    const confidenceBar = this.getConfidenceBar(signal.confidence);

    let message = `🔔 *NEW TRADING SIGNAL*\n\n`;
    message += `📊 *Symbol:* \`${signal.symbol}\`\n`;
    message += `${emoji} *Action:* *${signal.recommendation}*\n`;
    message += `💪 *Confidence:* ${(signal.confidence * 100).toFixed(1)}% ${confidenceBar}\n`;
    message += `\n`;

    // Entry Price and Order Type
    if (signal.entryPrice) {
      message += `💵 *Entry Price:* $${signal.entryPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\n`;

      // Fetch current market price for comparison
      try {
        const { binanceService } = await import('./binanceService');
        const marketData = await binanceService.getSymbolInfo(signal.symbol);
        const currentPrice = parseFloat(marketData.lastPrice || marketData.price || '0');

        if (currentPrice > 0) {
          const priceDiff = Math.abs(((signal.entryPrice - currentPrice) / currentPrice) * 100);

          if (priceDiff < 0.5) {
            message += `📍 *Order Type:* MARKET ORDER (current: $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })})\n`;
          } else {
            message += `📍 *Order Type:* LIMIT ORDER (current: $${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })})\n`;
          }
        }
      } catch (error) {
        // If we can't fetch market price, just show entry price
        message += `📍 *Order Type:* LIMIT ORDER\n`;
      }
    } else {
      message += `📍 *Order Type:* MARKET ORDER\n`;
    }

    if (signal.targetPrice) {
      message += `🎯 *Target:* $${signal.targetPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\n`;
    }

    if (signal.stopLoss) {
      message += `🛡️ *Stop Loss:* $${signal.stopLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}\n`;
    }

    // Risk/Reward Ratio
    if (signal.entryPrice && signal.targetPrice && signal.stopLoss) {
      const risk = Math.abs(signal.entryPrice - signal.stopLoss);
      const reward = Math.abs(signal.targetPrice - signal.entryPrice);
      const rrRatio = risk > 0 ? (reward / risk) : 0;

      message += `⚖️ *Risk/Reward:* 1:${rrRatio.toFixed(2)} ($${risk.toFixed(2)} risk / $${reward.toFixed(2)} reward)\n`;
    }

    if (signal.category) {
      message += `🏷️ *Category:* ${signal.category}\n`;
    }

    message += `⚡ *Priority:* ${priorityLabel} (${signal.priority}/100)\n`;
    message += `\n`;

    // Get plain English explanation from LLM
    try {
      const { aiAnalysisService } = await import('./aiAnalysisService');
      const explanation = await aiAnalysisService.generateSignalExplanation(signal);
      message += `📝 *In Simple Terms:*\n_${explanation}_\n`;
      message += `\n`;
    } catch (error) {
      console.error('Failed to generate LLM explanation:', error);
      // Fallback to reasoning if LLM fails
      const shortReasoning = signal.reasoning.length > 200
        ? signal.reasoning.substring(0, 197) + '...'
        : signal.reasoning;
      message += `💡 *Reasoning:*\n_${shortReasoning}_\n`;
      message += `\n`;
    }

    // Agent validation stats
    const validationRate = stats.totalAgents > 0
      ? ((stats.validatedAgents / stats.totalAgents) * 100).toFixed(0)
      : '0';

    message += `📈 *Agent Validation:*\n`;
    message += `✅ Validated: ${stats.validatedAgents}/${stats.totalAgents} (${validationRate}%)\n`;
    message += `❌ Rejected: ${stats.rejectedAgents}\n`;
    message += `\n`;

    // Timestamp
    const time = new Date(signal.timestamp).toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short'
    });
    message += `⏰ *Time:* ${time} UTC\n`;

    // Footer
    message += `\n_🤖 Automated Signal by Mariposa Scalping Bot_`;

    return message;
  }

  /**
   * Get emoji for recommendation
   */
  private getRecommendationEmoji(recommendation: string): string {
    switch (recommendation) {
      case 'BUY':
        return '📈';
      case 'SELL':
        return '📉';
      case 'HOLD':
        return '⏸️';
      default:
        return '❓';
    }
  }

  /**
   * Get priority label
   */
  private getPriorityLabel(priority: number): string {
    if (priority >= 90) return '🔥 CRITICAL';
    if (priority >= 70) return '⚠️ HIGH';
    if (priority >= 50) return '📊 MEDIUM';
    return '📌 LOW';
  }

  /**
   * Get visual confidence bar
   */
  private getConfidenceBar(confidence: number): string {
    const percent = confidence * 100;
    const filled = Math.floor(percent / 10);
    const empty = 10 - filled;

    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Send startup notification when server starts
   */
  async sendStartupNotification(): Promise<void> {
    if (!this.enabled || !this.bot || !this.chatId) {
      console.log('📱 Telegram startup notification skipped (not enabled)');
      return;
    }

    try {
      const message = this.formatStartupMessage();
      await this.sendMessage(message);
      console.log('✅ Telegram startup notification sent successfully');
    } catch (error) {
      console.error('❌ Failed to send Telegram startup notification:', error);
      // Log detailed error for debugging
      if (error instanceof Error) {
        console.error('   Error details:', error.message);
      }
    }
  }

  /**
   * Format startup notification message
   */
  private formatStartupMessage(): string {
    const now = new Date().toLocaleString('en-US', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    let message = `🚀 *Mariposa Scalping Bot Started*\n\n`;
    message += `✅ Telegram notifications *ENABLED*\n`;
    message += `📱 Connected to this chat\n`;
    message += `⏰ ${now} UTC\n\n`;
    message += `📊 *System Status:*\n`;
    message += `• Database: Connected\n`;
    message += `• Redis: Connected\n`;
    message += `• Signal Detection: Active\n`;
    message += `• Trade Execution: Active\n\n`;
    message += `🔔 *You will receive notifications for:*\n`;
    message += `• High-priority signals (≥70)\n`;
    message += `• Signals validated by 2+ agents\n`;
    message += `• Whale activity alerts\n\n`;
    message += `_If you see this message, your Telegram configuration is working correctly!_`;

    return message;
  }

  /**
   * Test Telegram connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.enabled) {
      return {
        success: false,
        message: 'Telegram notifications are disabled. Set TELEGRAM_ENABLED=true in .env'
      };
    }

    if (!this.bot || !this.chatId) {
      return {
        success: false,
        message: 'Telegram bot not initialized. Check TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env'
      };
    }

    try {
      const testMessage = `✅ *Telegram Bot Test*\n\nConnection successful!\n\n⏰ ${new Date().toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;

      await this.sendMessage(testMessage);

      return {
        success: true,
        message: 'Test message sent successfully to Telegram group!'
      };
    } catch (error: any) {
      console.error('Telegram test failed:', error);

      return {
        success: false,
        message: `Failed to send test message: ${error.message}`
      };
    }
  }

  /**
   * Get current bot status
   */
  getStatus(): {
    enabled: boolean;
    connected: boolean;
    chatId: string | null;
    queueSize: number;
  } {
    return {
      enabled: this.enabled,
      connected: this.bot !== null && this.chatId !== null,
      chatId: this.chatId,
      queueSize: this.messageQueue.length
    };
  }

  /**
   * Send a document (PDF file) to Telegram
   */
  async sendDocument(filePath: string, filename: string): Promise<void> {
    if (!this.enabled || !this.bot || !this.chatId) {
      console.log('📱 Telegram not enabled, skipping document send');
      return;
    }

    try {
      console.log(`📎 Sending document to Telegram: ${filename}`);

      await this.bot.sendDocument(this.chatId, filePath, {
        caption: `📄 *${filename}*\n\n_Generated by Mariposa Scalping Bot_`,
        parse_mode: 'Markdown'
      });

      console.log('✅ Document sent successfully to Telegram');
    } catch (error) {
      console.error('❌ Failed to send document to Telegram:', error);
      throw error;
    }
  }

  /**
   * Send market report summary message
   */
  async sendMarketReportSummary(
    date: Date,
    snapshot: any,
    topOpportunities: any[]
  ): Promise<void> {
    if (!this.enabled || !this.bot || !this.chatId) {
      console.log('📱 Telegram not enabled, skipping report summary');
      return;
    }

    try {
      const dateStr = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Sentiment emoji
      const sentimentEmoji = snapshot.marketSentiment === 'BULLISH' ? '🟢' :
        snapshot.marketSentiment === 'BEARISH' ? '🔴' : '🟡';

      let message = `📊 *Daily Crypto Market Analysis*\n`;
      message += `📅 ${dateStr}\n\n`;

      // Market Overview
      message += `🎯 *Market Sentiment:* ${snapshot.marketSentiment} ${sentimentEmoji}\n`;
      message += `📈 *Total Opportunities:* ${snapshot.totalOpportunities} (${snapshot.highConfidenceSignals} high confidence)\n`;
      message += `🐋 *Whale Activities:* ${snapshot.whaleActivitiesCount} detected\n`;
      message += `⭐ *Average Score:* ${snapshot.averageOpportunityScore.toFixed(1)}/100\n\n`;

      // Top Gainers/Losers
      if (snapshot.topGainers.length > 0) {
        const topGainer = snapshot.topGainers[0];
        message += `🏆 *Top Gainer:* ${topGainer.symbol} ${this.formatPercentage(topGainer.priceChange)}\n`;
      }

      if (snapshot.topLosers.length > 0) {
        const topLoser = snapshot.topLosers[0];
        message += `📉 *Top Loser:* ${topLoser.symbol} ${this.formatPercentage(topLoser.priceChange)}\n`;
      }

      message += `\n`;

      // Top Opportunities Preview
      if (topOpportunities.length > 0) {
        message += `💡 *Top Opportunities:*\n`;

        topOpportunities.slice(0, 3).forEach((opp, i) => {
          const rrEmoji = opp.riskLevel === 'LOW' ? '🟢' : opp.riskLevel === 'HIGH' ? '🔴' : '🟡';
          message += `\n${i + 1}. *${opp.symbol}* - ${opp.category}\n`;
          message += `   ${opp.recommendation} | Score: ${opp.score}/100 ${rrEmoji}\n`;
          message += `   R/R: 1:${opp.riskReward.toFixed(2)} | Expected: ${this.formatPercentage(opp.expectedReturn)}\n`;
        });

        message += `\n`;
      }

      message += `📄 *Full PDF report attached below* ⬇️\n`;
      message += `\n_🤖 Automated by Mariposa Scalping Bot_`;

      await this.sendMessage(message);
      console.log('✅ Market report summary sent to Telegram');
    } catch (error) {
      console.error('❌ Failed to send market report summary:', error);
      throw error;
    }
  }

  /**
   * Format percentage with sign
   */
  private formatPercentage(value: number): string {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  /**
   * Utility: Delay for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const telegramService = new TelegramService();
