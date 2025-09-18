/**
 * Symbol format conversion utilities for handling different exchange formats
 * Binance: BTCUSDT, ETHUSDT, etc.
 * OKX: BTC-USDT, ETH-USDT, etc.
 */

export type ExchangeFormat = 'binance' | 'okx';

interface SymbolInfo {
  base: string;
  quote: string;
  original: string;
}

export class SymbolConverter {
  // Common quote currencies for validation
  private static readonly COMMON_QUOTES = [
    'USDT', 'USD', 'BTC', 'ETH', 'BNB', 'BUSD', 'USDC', 'DAI'
  ];

  // Known symbol mappings for edge cases
  private static readonly SYMBOL_OVERRIDES: Record<string, { base: string; quote: string }> = {
    // Handle special cases where automatic parsing might fail
    'YGGUSDT': { base: 'YGG', quote: 'USDT' },
    'SCUSDT': { base: 'SC', quote: 'USDT' },
    'ADAUSDT': { base: 'ADA', quote: 'USDT' },
    // Add more as needed
  };

  /**
   * Parse a symbol into its base and quote components
   */
  static parseSymbol(symbol: string): SymbolInfo {
    const normalizedSymbol = symbol.toUpperCase();

    // Check for overrides first
    if (this.SYMBOL_OVERRIDES[normalizedSymbol]) {
      const override = this.SYMBOL_OVERRIDES[normalizedSymbol];
      return {
        base: override.base,
        quote: override.quote,
        original: symbol
      };
    }

    // Handle OKX format (BTC-USDT)
    if (symbol.includes('-')) {
      const [base, quote] = symbol.split('-');
      return {
        base: base.toUpperCase(),
        quote: quote.toUpperCase(),
        original: symbol
      };
    }

    // Handle Binance format (BTCUSDT)
    // Try to find the quote currency by checking common quotes
    for (const quote of this.COMMON_QUOTES) {
      if (normalizedSymbol.endsWith(quote)) {
        const base = normalizedSymbol.slice(0, -quote.length);
        if (base.length > 0) {
          return {
            base,
            quote,
            original: symbol
          };
        }
      }
    }

    // Fallback: assume last 4 characters are quote if they contain common patterns
    if (normalizedSymbol.length > 4) {
      const possibleQuote = normalizedSymbol.slice(-4);
      if (this.COMMON_QUOTES.includes(possibleQuote)) {
        return {
          base: normalizedSymbol.slice(0, -4),
          quote: possibleQuote,
          original: symbol
        };
      }
    }

    // Last resort: assume USDT as quote
    return {
      base: normalizedSymbol.replace('USDT', ''),
      quote: 'USDT',
      original: symbol
    };
  }

  /**
   * Convert symbol to Binance format (BTCUSDT)
   */
  static toBinanceFormat(symbol: string): string {
    if (!symbol) return '';

    const parsed = this.parseSymbol(symbol);
    return `${parsed.base}${parsed.quote}`;
  }

  /**
   * Convert symbol to OKX format (BTC-USDT)
   */
  static toOKXFormat(symbol: string): string {
    if (!symbol) return '';

    const parsed = this.parseSymbol(symbol);
    return `${parsed.base}-${parsed.quote}`;
  }

  /**
   * Convert symbol between formats
   */
  static convertSymbol(symbol: string, fromFormat: ExchangeFormat, toFormat: ExchangeFormat): string {
    if (fromFormat === toFormat) return symbol;

    const parsed = this.parseSymbol(symbol);

    if (toFormat === 'binance') {
      return `${parsed.base}${parsed.quote}`;
    } else {
      return `${parsed.base}-${parsed.quote}`;
    }
  }

  /**
   * Detect symbol format
   */
  static detectFormat(symbol: string): ExchangeFormat {
    return symbol.includes('-') ? 'okx' : 'binance';
  }

  /**
   * Normalize symbol to internal standard (Binance format)
   */
  static normalize(symbol: string): string {
    return this.toBinanceFormat(symbol);
  }

  /**
   * Validate if symbol format is correct for the given exchange
   */
  static validateFormat(symbol: string, exchange: ExchangeFormat): boolean {
    const detectedFormat = this.detectFormat(symbol);
    return detectedFormat === exchange;
  }

  /**
   * Get all possible formats for a symbol
   */
  static getAllFormats(symbol: string): { binance: string; okx: string; parsed: SymbolInfo } {
    const parsed = this.parseSymbol(symbol);
    return {
      binance: `${parsed.base}${parsed.quote}`,
      okx: `${parsed.base}-${parsed.quote}`,
      parsed
    };
  }

  /**
   * Batch convert multiple symbols
   */
  static batchConvert(symbols: string[], toFormat: ExchangeFormat): string[] {
    return symbols.map(symbol => {
      const fromFormat = this.detectFormat(symbol);
      return this.convertSymbol(symbol, fromFormat, toFormat);
    });
  }

  /**
   * Check if symbol is a valid trading pair
   */
  static isValidTradingPair(symbol: string): boolean {
    try {
      const parsed = this.parseSymbol(symbol);
      return (
        parsed.base.length > 0 &&
        parsed.quote.length > 0 &&
        parsed.base !== parsed.quote &&
        this.COMMON_QUOTES.includes(parsed.quote)
      );
    } catch (error) {
      return false;
    }
  }

  /**
   * Get base currency from symbol
   */
  static getBaseCurrency(symbol: string): string {
    return this.parseSymbol(symbol).base;
  }

  /**
   * Get quote currency from symbol
   */
  static getQuoteCurrency(symbol: string): string {
    return this.parseSymbol(symbol).quote;
  }

  /**
   * Create symbol from base and quote
   */
  static createSymbol(base: string, quote: string, format: ExchangeFormat): string {
    const normalizedBase = base.toUpperCase();
    const normalizedQuote = quote.toUpperCase();

    if (format === 'binance') {
      return `${normalizedBase}${normalizedQuote}`;
    } else {
      return `${normalizedBase}-${normalizedQuote}`;
    }
  }

  /**
   * Get popular trading pairs in specified format
   */
  static getPopularPairs(format: ExchangeFormat): string[] {
    const popularBases = ['BTC', 'ETH', 'BNB', 'ADA', 'DOT', 'SOL', 'AVAX', 'MATIC', 'LINK', 'UNI'];
    const quote = 'USDT';

    return popularBases.map(base => this.createSymbol(base, quote, format));
  }

  /**
   * Filter symbols by quote currency
   */
  static filterByQuote(symbols: string[], quoteCurrency: string): string[] {
    return symbols.filter(symbol => {
      const parsed = this.parseSymbol(symbol);
      return parsed.quote === quoteCurrency.toUpperCase();
    });
  }

  /**
   * Group symbols by quote currency
   */
  static groupByQuote(symbols: string[]): Record<string, string[]> {
    const groups: Record<string, string[]> = {};

    symbols.forEach(symbol => {
      const parsed = this.parseSymbol(symbol);
      if (!groups[parsed.quote]) {
        groups[parsed.quote] = [];
      }
      groups[parsed.quote].push(symbol);
    });

    return groups;
  }
}

// Convenience functions for common operations
export const toBinance = (symbol: string) => SymbolConverter.toBinanceFormat(symbol);
export const toOKX = (symbol: string) => SymbolConverter.toOKXFormat(symbol);
export const normalizeSymbol = (symbol: string) => SymbolConverter.normalize(symbol);
export const isValidPair = (symbol: string) => SymbolConverter.isValidTradingPair(symbol);

// Export for easier usage
export default SymbolConverter;