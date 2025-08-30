/**
 * Stock data caching utility for historical price tracking
 */

interface CachedPriceData {
  ticker: string;
  price: number;
  timestamp: number;
  previousPrice?: number;
  previousTimestamp?: number;
}

interface CacheEntry {
  data: CachedPriceData;
  lastUpdated: number;
}

export class StockDataCache {
  private static instance: StockDataCache;
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000; // Maximum number of cached entries

  private constructor() {}

  static getInstance(): StockDataCache {
    if (!StockDataCache.instance) {
      StockDataCache.instance = new StockDataCache();
    }
    return StockDataCache.instance;
  }

  /**
   * Store current price data in cache
   */
  storePriceData(ticker: string, price: number): void {
    const now = Date.now();
    const existing = this.cache.get(ticker);
    
    let previousPrice: number | undefined;
    let previousTimestamp: number | undefined;

    if (existing) {
      // Move current data to previous
      previousPrice = existing.data.price;
      previousTimestamp = existing.data.timestamp;
    }

    const newData: CachedPriceData = {
      ticker,
      price,
      timestamp: now,
      previousPrice,
      previousTimestamp
    };

    this.cache.set(ticker, {
      data: newData,
      lastUpdated: now
    });

    // Clean up old entries if cache is too large
    this.cleanup();
  }

  /**
   * Get cached price data for a ticker
   */
  getPriceData(ticker: string): CachedPriceData | null {
    const entry = this.cache.get(ticker);
    if (!entry) return null;

    // Check if cache is still valid
    if (Date.now() - entry.lastUpdated > this.CACHE_DURATION) {
      this.cache.delete(ticker);
      return null;
    }

    return entry.data;
  }

  /**
   * Calculate percentage change using cached data
   */
  calculatePercentageChange(ticker: string, currentPrice: number): number {
    const cached = this.getPriceData(ticker);
    
    if (!cached || !cached.previousPrice) {
      return 0.0; // No previous data available
    }

    // Use the most recent previous price
    const previousPrice = cached.previousPrice;
    return ((currentPrice - previousPrice) / previousPrice) * 100;
  }

  /**
   * Get the most recent previous price for a ticker
   */
  getPreviousPrice(ticker: string): number | null {
    const cached = this.getPriceData(ticker);
    return cached?.previousPrice || null;
  }

  /**
   * Get cached percentage change for a ticker
   */
  getCachedPercentageChange(ticker: string): number | null {
    const cached = this.getPriceData(ticker);
    if (!cached || !cached.previousPrice) {
      return null;
    }
    return this.calculatePercentageChange(ticker, cached.price);
  }

  /**
   * Check if we have valid cached data for percentage calculation
   */
  hasValidPercentageData(ticker: string): boolean {
    const cached = this.getPriceData(ticker);
    return !!(cached && cached.previousPrice);
  }

  /**
   * Clean up old cache entries
   */
  private cleanup(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return;

    const now = Date.now();
    const entries = Array.from(this.cache.entries());
    
    // Sort by last updated time (oldest first)
    entries.sort((a, b) => a[1].lastUpdated - b[1].lastUpdated);
    
    // Remove oldest entries
    const toRemove = entries.slice(0, this.cache.size - this.MAX_CACHE_SIZE);
    toRemove.forEach(([ticker]) => this.cache.delete(ticker));
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.MAX_CACHE_SIZE
    };
  }
}
