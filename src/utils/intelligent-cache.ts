/**
 * Intelligent Cache System for Stock Data
 * 
 * Implements adaptive caching strategies based on:
 * - Stock volatility (high/medium/low)
 * - Market hours vs after-hours
 * - Data freshness requirements
 * - Memory constraints
 * - Power state considerations
 */

import { StockApiResponse } from '../types';

export interface CacheEntry {
  data: StockApiResponse;
  timestamp: number;
  volatility: number;
  accessCount: number;
  lastAccess: number;
  priority: 'high' | 'medium' | 'low';
}

export interface CacheConfig {
  maxEntries: number;
  defaultTTL: number;
  highVolatilityTTL: number;
  mediumVolatilityTTL: number;
  lowVolatilityTTL: number;
  afterHoursTTL: number;
  cleanupInterval: number;
}

export class IntelligentCache {
  private static instance: IntelligentCache;
  
  private cache: Map<string, CacheEntry> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;
  
  // Configuration
  private config: CacheConfig = {
    maxEntries: 1000,
    defaultTTL: 60 * 1000, // 1 minute
    highVolatilityTTL: 30 * 1000, // 30 seconds
    mediumVolatilityTTL: 60 * 1000, // 1 minute
    lowVolatilityTTL: 300 * 1000, // 5 minutes
    afterHoursTTL: 600 * 1000, // 10 minutes
    cleanupInterval: 5 * 60 * 1000 // 5 minutes
  };
  
  // Statistics
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalEntries: 0,
    memoryUsage: 0
  };

  private constructor() {
    this.startCleanupTimer();
    console.log('Intelligent Cache initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): IntelligentCache {
    if (!IntelligentCache.instance) {
      IntelligentCache.instance = new IntelligentCache();
    }
    return IntelligentCache.instance;
  }

  /**
   * Store data in cache with intelligent TTL
   */
  storeData(ticker: string, data: StockApiResponse): void {
    const volatility = this.calculateVolatility(data);
    const priority = this.determinePriority(ticker, volatility);
    const ttl = this.getTTL(volatility, priority);
    
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      volatility,
      accessCount: 0,
      lastAccess: Date.now(),
      priority
    };

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxEntries) {
      this.evictEntries();
    }

    this.cache.set(ticker.toUpperCase(), entry);
    this.stats.totalEntries = this.cache.size;
    
    console.log(`Cached ${ticker} with TTL ${ttl}ms (volatility: ${volatility.toFixed(4)}, priority: ${priority})`);
  }

  /**
   * Retrieve data from cache
   */
  getData(ticker: string): StockApiResponse | null {
    const entry = this.cache.get(ticker.toUpperCase());
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry is expired
    const ttl = this.getTTL(entry.volatility, entry.priority);
    const isExpired = (Date.now() - entry.timestamp) > ttl;
    
    if (isExpired) {
      this.cache.delete(ticker.toUpperCase());
      this.stats.misses++;
      this.stats.totalEntries = this.cache.size;
      return null;
    }

    // Update access statistics
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.stats.hits++;
    
    return entry.data;
  }

  /**
   * Calculate stock volatility based on price data
   */
  private calculateVolatility(data: StockApiResponse): number {
    if (!data.price || !data.previousClose) {
      return 0.02; // Default to medium volatility
    }

    const priceChange = Math.abs(data.changePercent || 0);
    const dayRange = data.dayRange;
    
    if (!dayRange) {
      return priceChange / 100; // Use percentage change as volatility proxy
    }

    const rangeSize = dayRange.high - dayRange.low;
    const averagePrice = (dayRange.high + dayRange.low) / 2;
    const rangeVolatility = rangeSize / averagePrice;
    
    // Combine percentage change and range volatility
    const combinedVolatility = (priceChange / 100 + rangeVolatility) / 2;
    
    return Math.min(combinedVolatility, 0.5); // Cap at 50% volatility
  }

  /**
   * Determine cache priority based on ticker and volatility
   */
  private determinePriority(ticker: string, volatility: number): 'high' | 'medium' | 'low' {
    // High priority for major indices and frequently traded stocks
    const highPriorityTickers = ['SPY', 'QQQ', 'IWM', 'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA'];
    
    if (highPriorityTickers.includes(ticker.toUpperCase())) {
      return 'high';
    }
    
    // Medium priority for high volatility stocks
    if (volatility > 0.05) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Get TTL based on volatility and priority
   */
  private getTTL(volatility: number, priority: 'high' | 'medium' | 'low'): number {
    const isAfterHours = this.isAfterHours();
    
    // After hours get longer TTL
    if (isAfterHours) {
      return this.config.afterHoursTTL;
    }
    
    // High volatility stocks get shorter TTL
    if (volatility > 0.05) {
      return this.config.highVolatilityTTL;
    } else if (volatility > 0.02) {
      return this.config.mediumVolatilityTTL;
    } else {
      return this.config.lowVolatilityTTL;
    }
  }

  /**
   * Check if current time is after market hours
   */
  private isAfterHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();
    
    // Weekend
    if (day === 0 || day === 6) {
      return true;
    }
    
    // Before 9:30 AM or after 4:00 PM ET (simplified)
    return hour < 9 || hour >= 16;
  }

  /**
   * Evict entries when cache is full
   */
  private evictEntries(): void {
    const entries = Array.from(this.cache.entries());
    
    // Sort by priority and access count
    entries.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      const aScore = priorityOrder[a[1].priority] * a[1].accessCount;
      const bScore = priorityOrder[b[1].priority] * b[1].accessCount;
      
      return aScore - bScore; // Keep higher scores
    });
    
    // Remove lowest priority entries (up to 20% of cache)
    const evictCount = Math.ceil(this.config.maxEntries * 0.2);
    const toEvict = entries.slice(0, evictCount);
    
    toEvict.forEach(([ticker]) => {
      this.cache.delete(ticker);
      this.stats.evictions++;
    });
    
    this.stats.totalEntries = this.cache.size;
    console.log(`Evicted ${evictCount} cache entries`);
  }

  /**
   * Periodic cleanup of expired entries
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.config.cleanupInterval);
  }

  /**
   * Remove expired entries from cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [ticker, entry] of this.cache.entries()) {
      const ttl = this.getTTL(entry.volatility, entry.priority);
      if ((now - entry.timestamp) > ttl) {
        this.cache.delete(ticker);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      this.stats.totalEntries = this.cache.size;
      console.log(`Cleaned up ${cleanedCount} expired cache entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): typeof this.stats & {
    hitRate: number;
    averageVolatility: number;
    priorityDistribution: Record<string, number>;
  } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    // Calculate average volatility
    const entries = Array.from(this.cache.values());
    const averageVolatility = entries.length > 0 
      ? entries.reduce((sum, entry) => sum + entry.volatility, 0) / entries.length 
      : 0;
    
    // Calculate priority distribution
    const priorityDistribution = { high: 0, medium: 0, low: 0 };
    entries.forEach(entry => {
      priorityDistribution[entry.priority]++;
    });
    
    return {
      ...this.stats,
      hitRate,
      averageVolatility,
      priorityDistribution
    };
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Update cache configuration
   */
  updateConfig(newConfig: Partial<CacheConfig>): void {
    this.config = { ...this.config, ...newConfig };
    console.log('Intelligent Cache config updated:', newConfig);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.totalEntries = 0;
    console.log('Intelligent Cache cleared');
  }

  /**
   * Get cache size and memory usage estimate
   */
  getSizeInfo(): {
    entryCount: number;
    maxEntries: number;
    memoryUsageEstimate: number;
  } {
    // Rough estimate: each entry ~2KB
    const memoryUsageEstimate = this.cache.size * 2;
    
    return {
      entryCount: this.cache.size,
      maxEntries: this.config.maxEntries,
      memoryUsageEstimate
    };
  }

  /**
   * Check if ticker is cached and fresh
   */
  isCached(ticker: string): boolean {
    const entry = this.cache.get(ticker.toUpperCase());
    if (!entry) return false;
    
    const ttl = this.getTTL(entry.volatility, entry.priority);
    return (Date.now() - entry.timestamp) <= ttl;
  }

  /**
   * Get cache entry metadata
   */
  getEntryInfo(ticker: string): {
    isCached: boolean;
    age: number;
    volatility: number;
    priority: string;
    accessCount: number;
    ttl: number;
  } | null {
    const entry = this.cache.get(ticker.toUpperCase());
    if (!entry) return null;
    
    const ttl = this.getTTL(entry.volatility, entry.priority);
    const age = Date.now() - entry.timestamp;
    
    return {
      isCached: true,
      age,
      volatility: entry.volatility,
      priority: entry.priority,
      accessCount: entry.accessCount,
      ttl
    };
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.cache.clear();
    console.log('Intelligent Cache destroyed');
  }
}
