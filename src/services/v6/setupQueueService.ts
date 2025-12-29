/**
 * MARIPOSA V6 PRO - Setup Queue Service
 *
 * Manages the queue of pending trade setups.
 * - Maximum 5 active setups at a time
 * - Maximum 4 trades per day
 * - Setups expire after 6 hours
 * - Persisted to Redis for crash recovery
 */

import { v4 as uuidv4 } from 'uuid';
import { redisService } from '../redisService';
import {
  TradeSetup,
  SetupStatus,
  SetupQueueState,
  V6_SETUP_CONFIG,
  isSetupValid,
  createExpiryDate,
} from '../../types/v6';

// ============================================================================
// REDIS KEYS
// ============================================================================

const REDIS_KEYS = {
  QUEUE_STATE: 'v6:queue_state',
  SETUP_PREFIX: 'v6:setup:',
  DAILY_TRADES: 'v6:daily_trades',
  DAILY_DATE: 'v6:daily_date',
};

// ============================================================================
// SETUP QUEUE SERVICE
// ============================================================================

class SetupQueueService {
  // In-memory cache for fast access
  private setups: Map<string, TradeSetup> = new Map();
  private todayTradeCount: number = 0;
  private todayDate: string = '';
  private initialized: boolean = false;

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the service - load state from Redis
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[V6-QUEUE] Already initialized');
      return;
    }

    console.log('[V6-QUEUE] Initializing setup queue service...');

    try {
      // Load queue state from Redis
      await this.loadFromRedis();

      // Check if we need to reset daily counter
      await this.checkDailyReset();

      // Clean up any expired setups
      await this.cleanupExpiredSetups();

      this.initialized = true;
      console.log(`[V6-QUEUE] Initialized with ${this.setups.size} active setups, ${this.todayTradeCount} trades today`);
    } catch (error: any) {
      console.error('[V6-QUEUE] Initialization error:', error.message);
      // Initialize with empty state on error
      this.setups = new Map();
      this.todayTradeCount = 0;
      this.todayDate = this.getCurrentDateString();
      this.initialized = true;
    }
  }

  // ============================================================================
  // SETUP MANAGEMENT
  // ============================================================================

  /**
   * Check if a similar setup already exists in the queue
   * Two setups are considered duplicates if:
   * - Same direction (BUY/SELL)
   * - Entry zones overlap OR midpoints within 0.5% of each other
   */
  private isDuplicateSetup(newSetup: Omit<TradeSetup, 'id' | 'status' | 'confirmationAttempts'>): boolean {
    const DUPLICATE_THRESHOLD_PCT = 0.005; // 0.5% (increased from 0.3%)
    const activeSetups = this.getActiveSetups();

    for (const existing of activeSetups) {
      // Must be same direction
      if (existing.direction !== newSetup.direction) continue;

      // Check 1: Zone overlap detection (stricter check)
      const existingZone = existing.entryZone;
      const newZone = newSetup.entryZone;

      // Zones overlap if: newLow <= existingHigh AND newHigh >= existingLow
      const zonesOverlap = newZone.low <= existingZone.high && newZone.high >= existingZone.low;

      if (zonesOverlap) {
        console.log(`[V6-QUEUE] Duplicate detected (ZONE OVERLAP): ${newSetup.direction} zone $${newZone.low.toFixed(0)}-$${newZone.high.toFixed(0)} overlaps with existing $${existingZone.low.toFixed(0)}-$${existingZone.high.toFixed(0)}`);
        return true;
      }

      // Check 2: Midpoint proximity (0.5% threshold)
      const priceDiff = Math.abs(existing.entryZone.midpoint - newSetup.entryZone.midpoint);
      const priceRatio = priceDiff / existing.entryZone.midpoint;

      if (priceRatio < DUPLICATE_THRESHOLD_PCT) {
        console.log(`[V6-QUEUE] Duplicate detected (MIDPOINT): ${newSetup.direction} @ $${newSetup.entryZone.midpoint.toFixed(0)} too close to existing @ $${existing.entryZone.midpoint.toFixed(0)} (${(priceRatio * 100).toFixed(3)}% diff)`);
        return true;
      }
    }
    return false;
  }

  /**
   * Add a new setup to the queue
   */
  async addSetup(setup: Omit<TradeSetup, 'id' | 'status' | 'confirmationAttempts'>): Promise<TradeSetup | null> {
    await this.ensureInitialized();

    // Check if we can add more setups
    if (!this.canAddMoreSetups()) {
      console.log(`[V6-QUEUE] Cannot add setup: Queue full (${this.setups.size}/${V6_SETUP_CONFIG.MAX_ACTIVE_SETUPS})`);
      return null;
    }

    // Check for duplicate setup
    if (this.isDuplicateSetup(setup)) {
      console.log(`[V6-QUEUE] Rejecting duplicate: ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(0)} (similar setup already exists)`);
      return null;
    }

    // Create the full setup object
    const fullSetup: TradeSetup = {
      ...setup,
      id: uuidv4(),
      status: 'WAITING',
      confirmationAttempts: 0,
      maxConfirmationAttempts: V6_SETUP_CONFIG.MAX_CONFIRMATION_ATTEMPTS,
      expiresAt: setup.expiresAt || createExpiryDate(),
    };

    // Add to in-memory cache
    this.setups.set(fullSetup.id, fullSetup);

    // Persist to Redis
    await this.saveSetupToRedis(fullSetup);

    console.log(`[V6-QUEUE] Added setup ${fullSetup.id}: ${fullSetup.direction} @ $${fullSetup.entryZone.midpoint.toFixed(2)} (Grade ${fullSetup.grade})`);

    return fullSetup;
  }

  /**
   * Get all active (non-expired, non-executed) setups
   */
  getActiveSetups(): TradeSetup[] {
    return Array.from(this.setups.values()).filter(isSetupValid);
  }

  /**
   * Get all setups regardless of status
   */
  getAllSetups(): TradeSetup[] {
    return Array.from(this.setups.values());
  }

  /**
   * Get a specific setup by ID
   */
  getSetupById(id: string): TradeSetup | null {
    return this.setups.get(id) || null;
  }

  /**
   * Update a setup's status
   */
  async updateSetupStatus(id: string, status: SetupStatus): Promise<boolean> {
    const setup = this.setups.get(id);
    if (!setup) {
      console.warn(`[V6-QUEUE] Setup ${id} not found for status update`);
      return false;
    }

    const oldStatus = setup.status;
    setup.status = status;

    // Persist to Redis
    await this.saveSetupToRedis(setup);

    console.log(`[V6-QUEUE] Setup ${id} status: ${oldStatus} -> ${status}`);

    return true;
  }

  /**
   * Mark a setup as having been in zone (for safe MISSED detection)
   */
  async markWasInZone(id: string): Promise<void> {
    const setup = this.setups.get(id);
    if (setup && !setup.wasEverInZone) {
      setup.wasEverInZone = true;
      await this.saveSetupToRedis(setup);
      console.log(`[V6-QUEUE] Setup ${id.slice(0, 8)} marked as wasInZone`);
    }
  }

  /**
   * Increment confirmation attempts for a setup
   */
  async incrementConfirmationAttempts(id: string): Promise<number> {
    const setup = this.setups.get(id);
    if (!setup) {
      return -1;
    }

    setup.confirmationAttempts++;

    // Check if max attempts reached
    if (setup.confirmationAttempts >= setup.maxConfirmationAttempts) {
      setup.status = 'MAX_ATTEMPTS';
      console.log(`[V6-QUEUE] Setup ${id} reached max confirmation attempts (${setup.confirmationAttempts})`);
    }

    await this.saveSetupToRedis(setup);

    return setup.confirmationAttempts;
  }

  /**
   * Mark a setup as executed
   */
  async markExecuted(
    id: string,
    executionPrice: number,
    signalId?: string,
    mt4Ticket?: number
  ): Promise<boolean> {
    const setup = this.setups.get(id);
    if (!setup) {
      return false;
    }

    setup.status = 'EXECUTED';
    setup.executedAt = new Date();
    setup.executionPrice = executionPrice;
    setup.executionSignalId = signalId;
    setup.mt4Ticket = mt4Ticket;

    // Increment daily trade counter
    this.todayTradeCount++;
    await this.saveDailyCounterToRedis();

    // Persist to Redis
    await this.saveSetupToRedis(setup);

    console.log(`[V6-QUEUE] Setup ${id} EXECUTED @ $${executionPrice.toFixed(2)} | Trades today: ${this.todayTradeCount}/${V6_SETUP_CONFIG.MAX_TRADES_PER_DAY}`);

    return true;
  }

  /**
   * Remove a setup from the queue
   */
  async removeSetup(id: string): Promise<boolean> {
    if (!this.setups.has(id)) {
      return false;
    }

    this.setups.delete(id);
    await this.deleteSetupFromRedis(id);

    console.log(`[V6-QUEUE] Removed setup ${id}`);

    return true;
  }

  /**
   * Cancel a setup
   */
  async cancelSetup(id: string, reason: string = 'Manual cancellation'): Promise<boolean> {
    const setup = this.setups.get(id);
    if (!setup) {
      return false;
    }

    setup.status = 'CANCELLED';
    setup.marketContext = `${setup.marketContext} | Cancelled: ${reason}`;

    await this.saveSetupToRedis(setup);

    console.log(`[V6-QUEUE] Setup ${id} cancelled: ${reason}`);

    return true;
  }

  // ============================================================================
  // CAPACITY CHECKS
  // ============================================================================

  /**
   * Check if we can add more setups to the queue
   */
  canAddMoreSetups(): boolean {
    const activeCount = this.getActiveSetups().length;
    return activeCount < V6_SETUP_CONFIG.MAX_ACTIVE_SETUPS;
  }

  /**
   * Get number of available slots
   */
  getAvailableSlots(): number {
    const activeCount = this.getActiveSetups().length;
    return Math.max(0, V6_SETUP_CONFIG.MAX_ACTIVE_SETUPS - activeCount);
  }

  /**
   * Check if we can execute more trades today
   */
  canExecuteMoreTrades(): boolean {
    return this.todayTradeCount < V6_SETUP_CONFIG.MAX_TRADES_PER_DAY;
  }

  /**
   * Get remaining trades allowed today
   */
  getRemainingTradesToday(): number {
    return Math.max(0, V6_SETUP_CONFIG.MAX_TRADES_PER_DAY - this.todayTradeCount);
  }

  /**
   * Get today's trade count
   */
  getTodayTradeCount(): number {
    return this.todayTradeCount;
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Clean up expired setups
   */
  async cleanupExpiredSetups(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [id, setup] of this.setups) {
      if (now >= setup.expiresAt && setup.status !== 'EXECUTED') {
        setup.status = 'EXPIRED';
        await this.saveSetupToRedis(setup);
        cleanedCount++;
        console.log(`[V6-QUEUE] Setup ${id} expired (was ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(2)})`);
      }
    }

    if (cleanedCount > 0) {
      console.log(`[V6-QUEUE] Cleaned up ${cleanedCount} expired setups`);
    }

    return cleanedCount;
  }

  /**
   * Remove all inactive (expired, executed, cancelled) setups from memory
   */
  async purgeInactiveSetups(): Promise<number> {
    const inactiveStatuses: SetupStatus[] = ['EXPIRED', 'EXECUTED', 'CANCELLED', 'MAX_ATTEMPTS'];
    let purgedCount = 0;

    for (const [id, setup] of this.setups) {
      if (inactiveStatuses.includes(setup.status)) {
        this.setups.delete(id);
        await this.deleteSetupFromRedis(id);
        purgedCount++;
      }
    }

    if (purgedCount > 0) {
      console.log(`[V6-QUEUE] Purged ${purgedCount} inactive setups`);
    }

    return purgedCount;
  }

  /**
   * Clear ALL setups from the queue (for mode switching)
   * Used when switching from SWING to SCALPING mode to ensure fresh scalping-optimized setups
   */
  async clearAllSetups(): Promise<number> {
    const clearedCount = this.setups.size;

    if (clearedCount > 0) {
      console.log(`[V6-QUEUE] Clearing ALL ${clearedCount} setups for scalping mode...`);

      // Log what we're clearing
      for (const [id, setup] of this.setups) {
        console.log(`[V6-QUEUE]   Clearing: ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(0)} (${setup.status})`);
      }

      // Clear in-memory cache
      this.setups.clear();

      // Persist empty state to Redis
      await this.saveQueueStateToRedis();

      console.log(`[V6-QUEUE] Cleared ${clearedCount} setups - queue is now empty`);
    } else {
      console.log('[V6-QUEUE] No setups to clear');
    }

    return clearedCount;
  }

  // ============================================================================
  // DAILY RESET
  // ============================================================================

  /**
   * Check if we need to reset the daily counter
   */
  private async checkDailyReset(): Promise<void> {
    const currentDate = this.getCurrentDateString();

    if (this.todayDate !== currentDate) {
      console.log(`[V6-QUEUE] New day detected (${this.todayDate} -> ${currentDate}), resetting daily counter`);
      this.todayDate = currentDate;
      this.todayTradeCount = 0;
      await this.saveDailyCounterToRedis();
    }
  }

  /**
   * Force reset daily counter (for testing)
   */
  async resetDailyCounter(): Promise<void> {
    this.todayTradeCount = 0;
    this.todayDate = this.getCurrentDateString();
    await this.saveDailyCounterToRedis();
    console.log('[V6-QUEUE] Daily counter reset');
  }

  // ============================================================================
  // REDIS PERSISTENCE
  // ============================================================================

  /**
   * Load queue state from Redis
   */
  private async loadFromRedis(): Promise<void> {
    try {
      // Load daily counter
      const dailyDate = await redisService.get(REDIS_KEYS.DAILY_DATE);
      const dailyCount = await redisService.get(REDIS_KEYS.DAILY_TRADES);

      this.todayDate = dailyDate || this.getCurrentDateString();
      this.todayTradeCount = dailyCount || 0;

      // Load all setups
      const queueState = await redisService.get(REDIS_KEYS.QUEUE_STATE) as SetupQueueState | null;

      if (queueState && queueState.setups) {
        for (const setup of queueState.setups) {
          // Convert date strings back to Date objects
          setup.createdAt = new Date(setup.createdAt);
          setup.expiresAt = new Date(setup.expiresAt);
          setup.analysisTimestamp = new Date(setup.analysisTimestamp);
          if (setup.executedAt) {
            setup.executedAt = new Date(setup.executedAt);
          }

          this.setups.set(setup.id, setup);
        }
      }

      console.log(`[V6-QUEUE] Loaded ${this.setups.size} setups from Redis`);
    } catch (error: any) {
      console.error('[V6-QUEUE] Error loading from Redis:', error.message);
    }
  }

  /**
   * Save a single setup to Redis
   */
  private async saveSetupToRedis(setup: TradeSetup): Promise<void> {
    try {
      // Save to queue state
      await this.saveQueueStateToRedis();
    } catch (error: any) {
      console.error(`[V6-QUEUE] Error saving setup ${setup.id} to Redis:`, error.message);
    }
  }

  /**
   * Save entire queue state to Redis
   */
  private async saveQueueStateToRedis(): Promise<void> {
    try {
      const state: SetupQueueState = {
        setups: Array.from(this.setups.values()),
        todayTradeCount: this.todayTradeCount,
        todayDate: this.todayDate,
        lastCleanupTime: Date.now(),
      };

      // TTL of 24 hours for queue state
      await redisService.set(REDIS_KEYS.QUEUE_STATE, state, { ttl: 86400 });
    } catch (error: any) {
      console.error('[V6-QUEUE] Error saving queue state to Redis:', error.message);
    }
  }

  /**
   * Delete a setup from Redis
   */
  private async deleteSetupFromRedis(id: string): Promise<void> {
    try {
      await this.saveQueueStateToRedis();
    } catch (error: any) {
      console.error(`[V6-QUEUE] Error deleting setup ${id} from Redis:`, error.message);
    }
  }

  /**
   * Save daily counter to Redis
   */
  private async saveDailyCounterToRedis(): Promise<void> {
    try {
      // TTL of 48 hours (survives day change)
      await redisService.set(REDIS_KEYS.DAILY_DATE, this.todayDate, { ttl: 172800 });
      await redisService.set(REDIS_KEYS.DAILY_TRADES, this.todayTradeCount, { ttl: 172800 });
    } catch (error: any) {
      console.error('[V6-QUEUE] Error saving daily counter to Redis:', error.message);
    }
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  /**
   * Get current date as YYYY-MM-DD string (UTC)
   */
  private getCurrentDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Ensure the service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get queue health status
   */
  getQueueHealth(): {
    activeSetups: number;
    maxSetups: number;
    todayTrades: number;
    maxTrades: number;
    oldestSetupAge: number | null;
    initialized: boolean;
  } {
    const activeSetups = this.getActiveSetups();
    let oldestAge: number | null = null;

    if (activeSetups.length > 0) {
      const oldestSetup = activeSetups.reduce((oldest, current) =>
        current.createdAt < oldest.createdAt ? current : oldest
      );
      oldestAge = Date.now() - oldestSetup.createdAt.getTime();
    }

    return {
      activeSetups: activeSetups.length,
      maxSetups: V6_SETUP_CONFIG.MAX_ACTIVE_SETUPS,
      todayTrades: this.todayTradeCount,
      maxTrades: V6_SETUP_CONFIG.MAX_TRADES_PER_DAY,
      oldestSetupAge: oldestAge,
      initialized: this.initialized,
    };
  }

  /**
   * Log current queue state
   */
  logQueueState(): void {
    const health = this.getQueueHealth();
    const activeSetups = this.getActiveSetups();

    console.log('');
    console.log('==================================================');
    console.log('[V6-QUEUE] Current State');
    console.log('==================================================');
    console.log(`  Active Setups: ${health.activeSetups}/${health.maxSetups}`);
    console.log(`  Today's Trades: ${health.todayTrades}/${health.maxTrades}`);
    console.log(`  Can Add More: ${this.canAddMoreSetups()}`);
    console.log(`  Can Execute: ${this.canExecuteMoreTrades()}`);

    if (activeSetups.length > 0) {
      console.log('');
      console.log('  Active Setups:');
      for (const setup of activeSetups) {
        const ageMinutes = Math.round((Date.now() - setup.createdAt.getTime()) / 60000);
        console.log(`    #${setup.id.slice(0, 8)} | ${setup.direction} @ $${setup.entryZone.midpoint.toFixed(0)} | Grade ${setup.grade} | ${setup.status} | Age: ${ageMinutes}m`);
      }
    }
    console.log('==================================================');
    console.log('');
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const setupQueueService = new SetupQueueService();
export { SetupQueueService };
