/**
 * MARIPOSA V6 PRO - Kline Normalization Utility
 *
 * Normalizes Binance kline data from raw array format to object format.
 *
 * Binance API returns: [timestamp, "open", "high", "low", "close", "volume", closeTime, ...]
 * V6 services need: { openTime, open, high, low, close, volume, closeTime }
 */

export interface NormalizedKline {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

/**
 * Normalize raw Binance kline data to structured objects.
 * Handles both raw array format from API and already-normalized objects.
 *
 * @param rawKlines - Raw kline data from binanceService.getKlines()
 * @returns Array of normalized kline objects
 */
export function normalizeKlines(rawKlines: any[]): NormalizedKline[] {
  if (!rawKlines || rawKlines.length === 0) {
    return [];
  }

  return rawKlines.map((k, index) => {
    // If already normalized (object with close property), return as-is with type coercion
    if (typeof k === 'object' && !Array.isArray(k) && 'close' in k) {
      return {
        openTime: typeof k.openTime === 'number' ? k.openTime : parseInt(k.openTime),
        open: typeof k.open === 'number' ? k.open : parseFloat(k.open),
        high: typeof k.high === 'number' ? k.high : parseFloat(k.high),
        low: typeof k.low === 'number' ? k.low : parseFloat(k.low),
        close: typeof k.close === 'number' ? k.close : parseFloat(k.close),
        volume: typeof k.volume === 'number' ? k.volume : parseFloat(k.volume),
        closeTime: typeof k.closeTime === 'number' ? k.closeTime : parseInt(k.closeTime || '0'),
      };
    }

    // Raw array format from Binance API:
    // [0] Open time, [1] Open, [2] High, [3] Low, [4] Close, [5] Volume, [6] Close time
    if (Array.isArray(k) && k.length >= 7) {
      return {
        openTime: parseInt(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        closeTime: parseInt(k[6]),
      };
    }

    // Unknown format - log warning and return safe defaults
    console.warn(`[normalizeKlines] Unknown kline format at index ${index}:`, k);
    return {
      openTime: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      closeTime: 0,
    };
  });
}

/**
 * Get current price from normalized klines with safety check
 *
 * @param klines - Normalized kline array
 * @returns Current price (last candle close) or 0 if no data
 */
export function getCurrentPrice(klines: NormalizedKline[]): number {
  if (!klines || klines.length === 0) {
    return 0;
  }
  return klines[klines.length - 1].close || 0;
}
