/**
 * MARIPOSA V6 PRO - Session Filter Service
 *
 * Determines best trading times based on market session (UTC hours).
 * Pure calculation - no API calls, instant response.
 */

import {
  MarketSession,
  SessionInfo,
  SessionFilterResult,
  SESSION_TIMES,
  TradingStrategy,
} from '../../types/v6/analysis.types';

// ============================================================================
// SESSION FILTER SERVICE
// ============================================================================

class SessionFilterService {
  /**
   * Analyze current session and provide trading recommendation
   */
  analyze(): SessionFilterResult {
    const now = new Date();
    const utcHour = now.getUTCHours();
    const utcMinute = now.getUTCMinutes();

    const sessionInfo = this.getSessionInfo(utcHour, utcMinute);
    const { shouldTrade, reason, positionMultiplier, slMultiplier, confidenceModifier, strategy } =
      this.getTradingRecommendation(sessionInfo);

    console.log(`[V6-SESSION] ${sessionInfo.session} session (UTC ${utcHour}:${utcMinute.toString().padStart(2, '0')}) - ${sessionInfo.quality} quality - ${strategy} strategy`);

    return {
      sessionInfo,
      shouldTrade,
      reason,
      positionMultiplier,
      slMultiplier,
      confidenceModifier,
      strategy,
    };
  }

  /**
   * Check if a specific grade should trade in current session
   *
   * SESSION-SPECIFIC SOFT FILTER RULES:
   * - OVERLAP: All grades (A, B, C) - Best liquidity, aggressive trading
   * - LONDON:  All grades (A, B, C) - Good liquidity, normal trading
   * - NEW_YORK: A, B only - Good liquidity but Grade C too risky
   * - ASIA:    A only - Low liquidity, choppy, only best setups
   * - QUIET:   A only - Very low liquidity, minimal trading
   */
  shouldGradeTrade(grade: 'A' | 'B' | 'C'): { allowed: boolean; reason?: string } {
    const result = this.analyze();
    const session = result.sessionInfo.session;

    // Grade A always allowed in all sessions
    if (grade === 'A') {
      return { allowed: true };
    }

    // Grade B: Blocked in ASIA and QUIET (low liquidity)
    if (grade === 'B') {
      if (session === 'ASIA' || session === 'QUIET') {
        return {
          allowed: false,
          reason: `Grade B not allowed in ${session} session - only Grade A (soft filter)`,
        };
      }
      return { allowed: true };
    }

    // Grade C: Only allowed in OVERLAP and LONDON (highest liquidity)
    if (grade === 'C') {
      if (session === 'ASIA' || session === 'QUIET' || session === 'NEW_YORK') {
        return {
          allowed: false,
          reason: `Grade C not allowed in ${session} session (soft filter)`,
        };
      }
      // Grade C allowed in OVERLAP and LONDON
      return { allowed: true };
    }

    return { allowed: true };
  }

  /**
   * Get detailed session information
   */
  private getSessionInfo(utcHour: number, utcMinute: number): SessionInfo {
    const session = this.getCurrentSession(utcHour);
    const quality = this.getSessionQuality(session, utcHour);
    const volatility = this.getExpectedVolatility(session, utcHour);
    const isKillzone = this.isKillzone(session, utcHour);
    const minutesToNextSession = this.getMinutesToNextSession(utcHour, utcMinute);

    return {
      session,
      quality,
      volatility,
      isKillzone,
      utcHour,
      minutesToNextSession,
    };
  }

  /**
   * Determine current session from UTC hour
   */
  private getCurrentSession(utcHour: number): MarketSession {
    // Check OVERLAP first (highest priority) - 13:00-16:00 UTC
    if (utcHour >= 13 && utcHour < 16) {
      return 'OVERLAP';
    }

    // LONDON session: 07:00-16:00 UTC
    if (utcHour >= 7 && utcHour < 16) {
      return 'LONDON';
    }

    // NEW_YORK session: 13:00-22:00 UTC (after overlap check)
    if (utcHour >= 16 && utcHour < 22) {
      return 'NEW_YORK';
    }

    // ASIA session: 00:00-08:00 UTC
    if (utcHour >= 0 && utcHour < 8) {
      return 'ASIA';
    }

    // QUIET period: 22:00-00:00 UTC
    return 'QUIET';
  }

  /**
   * Get session quality rating
   */
  private getSessionQuality(session: MarketSession, utcHour: number): 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' {
    // London-NY overlap is best
    if (session === 'OVERLAP') {
      return 'EXCELLENT';
    }

    // London open (07:00-09:00) is great
    if (session === 'LONDON' && utcHour >= 7 && utcHour < 9) {
      return 'EXCELLENT';
    }

    // Normal London/NY
    if (session === 'LONDON' || session === 'NEW_YORK') {
      return 'GOOD';
    }

    // Asia session open (00:00-02:00) can be okay
    if (session === 'ASIA' && utcHour >= 0 && utcHour < 2) {
      return 'FAIR';
    }

    // Rest of Asia is ranging
    if (session === 'ASIA') {
      return 'FAIR';
    }

    // Quiet period
    return 'POOR';
  }

  /**
   * Get expected volatility
   */
  private getExpectedVolatility(session: MarketSession, utcHour: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (session === 'OVERLAP') return 'HIGH';
    if (session === 'LONDON' && utcHour >= 7 && utcHour < 10) return 'HIGH';
    if (session === 'LONDON' || session === 'NEW_YORK') return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Check if currently in a killzone (best trading times)
   */
  private isKillzone(session: MarketSession, utcHour: number): boolean {
    // London-NY overlap
    if (session === 'OVERLAP') return true;

    // London open
    if (session === 'LONDON' && utcHour >= 7 && utcHour < 10) return true;

    // NY open (after overlap)
    if (session === 'NEW_YORK' && utcHour >= 16 && utcHour < 18) return true;

    return false;
  }

  /**
   * Calculate minutes until next session change
   */
  private getMinutesToNextSession(utcHour: number, utcMinute: number): number {
    let nextSessionHour: number;

    if (utcHour < 7) nextSessionHour = 7;      // Asia -> London
    else if (utcHour < 13) nextSessionHour = 13;  // London -> Overlap
    else if (utcHour < 16) nextSessionHour = 16;  // Overlap -> NY
    else if (utcHour < 22) nextSessionHour = 22;  // NY -> Quiet
    else nextSessionHour = 24;                     // Quiet -> Asia (next day)

    const hoursUntil = nextSessionHour - utcHour - 1;
    const minutesUntil = 60 - utcMinute;

    return (hoursUntil * 60) + minutesUntil;
  }

  /**
   * Get trading recommendation based on session
   *
   * SOFT FILTER SESSION RULES:
   * | Session   | Grades | Position | SL   | Strategy     |
   * |-----------|--------|----------|------|--------------|
   * | OVERLAP   | A,B,C  | 1.25x    | 1.0x | AGGRESSIVE   |
   * | LONDON    | A,B,C  | 1.0x     | 1.0x | NORMAL       |
   * | NEW_YORK  | A,B    | 1.0x     | 1.0x | NORMAL       |
   * | ASIA      | A only | 0.6x     | 1.3x | CONSERVATIVE |
   * | QUIET     | A only | 0.5x     | 1.3x | CONSERVATIVE |
   */
  private getTradingRecommendation(sessionInfo: SessionInfo): {
    shouldTrade: boolean;
    reason: string;
    positionMultiplier: number;
    slMultiplier: number;
    confidenceModifier: number;
    strategy: TradingStrategy;
  } {
    switch (sessionInfo.quality) {
      case 'EXCELLENT':
        return {
          shouldTrade: true,
          reason: `${sessionInfo.session} killzone - optimal trading conditions, all grades allowed`,
          positionMultiplier: 1.25,
          slMultiplier: 1.0,
          confidenceModifier: 10,
          strategy: 'AGGRESSIVE',
        };

      case 'GOOD':
        return {
          shouldTrade: true,
          reason: `${sessionInfo.session} session - good liquidity`,
          positionMultiplier: 1.0,
          slMultiplier: 1.0,
          confidenceModifier: 5,
          strategy: 'NORMAL',
        };

      case 'FAIR':
        return {
          shouldTrade: true,
          reason: `${sessionInfo.session} session - reduced liquidity, Grade A only (soft filter)`,
          positionMultiplier: 0.6,
          slMultiplier: 1.3,  // 30% wider SL for choppy ASIA conditions
          confidenceModifier: -5,
          strategy: 'CONSERVATIVE',
        };

      case 'POOR':
        return {
          shouldTrade: false,
          reason: `${sessionInfo.session} - low liquidity, Grade A only (soft filter)`,
          positionMultiplier: 0.5,
          slMultiplier: 1.3,
          confidenceModifier: -10,
          strategy: 'CONSERVATIVE',
        };

      default:
        return {
          shouldTrade: false,
          reason: 'Unknown session state',
          positionMultiplier: 0.5,
          slMultiplier: 1.0,
          confidenceModifier: 0,
          strategy: 'CONSERVATIVE',
        };
    }
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const sessionFilterService = new SessionFilterService();
export { SessionFilterService };
