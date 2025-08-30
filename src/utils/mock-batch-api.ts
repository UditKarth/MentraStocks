/**
 * Mock Batch API Manager for Testing
 * 
 * Provides realistic mock data and behavior for testing Phase 2 optimizations
 * without making actual API calls that could trigger rate limiting.
 */

import { StockApiResponse } from '../types';
import { BatchRequest, BatchResponse } from './batch-api-manager';

export class MockBatchApiManager {
  private static instance: MockBatchApiManager;
  
  private batchQueue: BatchRequest[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private isProcessing = false;
  
  // Configuration
  private BATCH_SIZE = 8;
  private BATCH_DELAY = 50; // Faster for testing
  private MAX_QUEUE_SIZE = 100;
  private REQUEST_TIMEOUT = 5000; // 5 seconds for testing
  
  // Statistics
  private stats = {
    totalRequests: 0,
    batchedRequests: 0,
    failedRequests: 0,
    averageBatchSize: 0,
    totalBatches: 0
  };

  // Mock data for common stocks
  private mockData: Record<string, StockApiResponse> = {
    'AAPL': {
      price: 150.25,
      changePercent: 2.5,
      volume: 45000000,
      marketCap: 2500000000000,
      peRatio: 25.5,
      dividendYield: 0.5,
      dayRange: { low: 148.0, high: 152.0 },
      yearRange: { low: 120.0, high: 180.0 },
      openPrice: 149.0,
      previousClose: 146.5,
      beta: 1.2,
      eps: 5.89,
      priceToBook: 15.2,
      debtToEquity: 0.8,
      returnOnEquity: 0.15,
      profitMargin: 0.25,
      revenueGrowth: 0.08,
      earningsGrowth: 0.12,
      freeCashFlow: 95000000000,
      enterpriseValue: 2600000000000
    },
    'GOOGL': {
      price: 2800.50,
      changePercent: -1.2,
      volume: 25000000,
      marketCap: 1800000000000,
      peRatio: 28.3,
      dividendYield: 0.0,
      dayRange: { low: 2780.0, high: 2850.0 },
      yearRange: { low: 2200.0, high: 3000.0 },
      openPrice: 2820.0,
      previousClose: 2834.0,
      beta: 1.1,
      eps: 98.95,
      priceToBook: 6.8,
      debtToEquity: 0.1,
      returnOnEquity: 0.22,
      profitMargin: 0.28,
      revenueGrowth: 0.15,
      earningsGrowth: 0.18,
      freeCashFlow: 65000000000,
      enterpriseValue: 1850000000000
    },
    'MSFT': {
      price: 320.75,
      changePercent: 1.8,
      volume: 35000000,
      marketCap: 2400000000000,
      peRatio: 32.1,
      dividendYield: 0.8,
      dayRange: { low: 318.0, high: 325.0 },
      yearRange: { low: 250.0, high: 350.0 },
      openPrice: 319.0,
      previousClose: 315.0,
      beta: 0.9,
      eps: 9.99,
      priceToBook: 12.5,
      debtToEquity: 0.3,
      returnOnEquity: 0.35,
      profitMargin: 0.32,
      revenueGrowth: 0.12,
      earningsGrowth: 0.15,
      freeCashFlow: 55000000000,
      enterpriseValue: 2450000000000
    },
    'TSLA': {
      price: 850.25,
      changePercent: 5.2,
      volume: 80000000,
      marketCap: 850000000000,
      peRatio: 85.2,
      dividendYield: 0.0,
      dayRange: { low: 820.0, high: 870.0 },
      yearRange: { low: 600.0, high: 900.0 },
      openPrice: 825.0,
      previousClose: 808.0,
      beta: 2.1,
      eps: 9.98,
      priceToBook: 25.3,
      debtToEquity: 0.2,
      returnOnEquity: 0.18,
      profitMargin: 0.12,
      revenueGrowth: 0.25,
      earningsGrowth: 0.30,
      freeCashFlow: 12000000000,
      enterpriseValue: 900000000000
    },
    'NVDA': {
      price: 450.80,
      changePercent: 3.7,
      volume: 60000000,
      marketCap: 1100000000000,
      peRatio: 45.1,
      dividendYield: 0.1,
      dayRange: { low: 440.0, high: 460.0 },
      yearRange: { low: 300.0, high: 500.0 },
      openPrice: 445.0,
      previousClose: 434.0,
      beta: 1.8,
      eps: 9.99,
      priceToBook: 18.7,
      debtToEquity: 0.1,
      returnOnEquity: 0.45,
      profitMargin: 0.35,
      revenueGrowth: 0.45,
      earningsGrowth: 0.50,
      freeCashFlow: 25000000000,
      enterpriseValue: 1150000000000
    },
    'SPY': {
      price: 420.50,
      changePercent: 0.8,
      volume: 80000000,
      marketCap: 400000000000,
      peRatio: 22.5,
      dividendYield: 1.5,
      dayRange: { low: 418.0, high: 422.0 },
      yearRange: { low: 380.0, high: 450.0 },
      openPrice: 419.0,
      previousClose: 417.0,
      beta: 1.0,
      eps: 18.68,
      priceToBook: 3.2,
      debtToEquity: 0.0,
      returnOnEquity: 0.15,
      profitMargin: 0.12,
      revenueGrowth: 0.05,
      earningsGrowth: 0.08,
      freeCashFlow: 20000000000,
      enterpriseValue: 400000000000
    },
    'QQQ': {
      price: 380.25,
      changePercent: 1.2,
      volume: 45000000,
      marketCap: 180000000000,
      peRatio: 28.5,
      dividendYield: 0.6,
      dayRange: { low: 378.0, high: 382.0 },
      yearRange: { low: 320.0, high: 400.0 },
      openPrice: 379.0,
      previousClose: 375.5,
      beta: 1.2,
      eps: 13.34,
      priceToBook: 5.8,
      debtToEquity: 0.0,
      returnOnEquity: 0.20,
      profitMargin: 0.18,
      revenueGrowth: 0.12,
      earningsGrowth: 0.15,
      freeCashFlow: 15000000000,
      enterpriseValue: 180000000000
    }
  };

  private constructor() {
    console.log('Mock Batch API Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): MockBatchApiManager {
    if (!MockBatchApiManager.instance) {
      MockBatchApiManager.instance = new MockBatchApiManager();
    }
    return MockBatchApiManager.instance;
  }

  /**
   * Fetch stock data with mock batching
   */
  async fetchStockData(ticker: string, priority: 'high' | 'normal' | 'low' = 'normal'): Promise<StockApiResponse | null> {
    this.stats.totalRequests++;
    
    return new Promise((resolve, reject) => {
      const request: BatchRequest = {
        ticker: ticker.toUpperCase(),
        resolve,
        reject,
        priority,
        timestamp: Date.now()
      };

      // Add to queue
      this.addToQueue(request);
      
      // Set timeout for individual request
      setTimeout(() => {
        if (this.batchQueue.find(r => r.ticker === ticker)) {
          reject(new Error(`Request timeout for ${ticker}`));
          this.removeFromQueue(ticker);
        }
      }, this.REQUEST_TIMEOUT);
    });
  }

  /**
   * Add request to batch queue
   */
  private addToQueue(request: BatchRequest): void {
    // Check queue size limit
    if (this.batchQueue.length >= this.MAX_QUEUE_SIZE) {
      const oldestRequest = this.batchQueue.shift();
      if (oldestRequest) {
        oldestRequest.reject(new Error('Queue full - request dropped'));
      }
    }

    // Insert based on priority
    if (request.priority === 'high') {
      this.batchQueue.unshift(request); // Add to front
    } else {
      this.batchQueue.push(request); // Add to back
    }

    // Schedule batch processing
    this.scheduleBatchProcessing();
  }

  /**
   * Remove request from queue
   */
  private removeFromQueue(ticker: string): void {
    const index = this.batchQueue.findIndex(r => r.ticker === ticker);
    if (index !== -1) {
      this.batchQueue.splice(index, 1);
    }
  }

  /**
   * Schedule batch processing
   */
  private scheduleBatchProcessing(): void {
    if (this.isProcessing) return;

    // Process immediately if batch is full
    if (this.batchQueue.length >= this.BATCH_SIZE) {
      this.processBatch();
      return;
    }

    // Schedule delayed processing
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.BATCH_DELAY);
    }
  }

  /**
   * Process current batch of requests
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.batchQueue.length === 0) return;

    this.isProcessing = true;
    
    // Clear timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }

    // Extract batch
    const batchSize = Math.min(this.BATCH_SIZE, this.batchQueue.length);
    const batch = this.batchQueue.splice(0, batchSize);
    const tickers = batch.map(r => r.ticker);

    console.log(`[MOCK] Processing batch of ${batchSize} requests: ${tickers.join(', ')}`);

    try {
      // Simulate processing delay
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Process each request with mock data
      batch.forEach((request) => {
        const mockData = this.getMockData(request.ticker);
        if (mockData) {
          request.resolve(mockData);
        } else {
          request.reject(new Error(`Mock data not available for ${request.ticker}`));
          this.stats.failedRequests++;
        }
      });

      // Update statistics
      this.stats.batchedRequests += batchSize;
      this.stats.totalBatches++;
      this.stats.averageBatchSize = this.stats.batchedRequests / this.stats.totalBatches;

    } catch (error) {
      console.error('[MOCK] Batch processing failed:', error);
      
      // Reject all requests in batch
      batch.forEach(request => {
        request.reject(error);
        this.stats.failedRequests++;
      });
    }

    this.isProcessing = false;

    // Process next batch if queue is not empty
    if (this.batchQueue.length > 0) {
      this.scheduleBatchProcessing();
    }
  }

  /**
   * Get mock data for a ticker
   */
  private getMockData(ticker: string): StockApiResponse | null {
    const baseData = this.mockData[ticker];
    if (!baseData) {
      // Generate generic mock data for unknown tickers
      return this.generateGenericMockData(ticker);
    }

    // Add some realistic variation to the mock data
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    const priceVariation = baseData.price * variation;
    
    return {
      ...baseData,
      price: Math.round((baseData.price + priceVariation) * 100) / 100,
      changePercent: Math.round((baseData.changePercent + variation * 100) * 10) / 10
    };
  }

  /**
   * Generate generic mock data for unknown tickers
   */
  private generateGenericMockData(ticker: string): StockApiResponse {
    const basePrice = 50 + Math.random() * 200; // Random price between $50-$250
    const changePercent = (Math.random() - 0.5) * 10; // Random change between -5% and +5%
    
    return {
      price: Math.round(basePrice * 100) / 100,
      changePercent: Math.round(changePercent * 10) / 10,
      volume: Math.floor(Math.random() * 10000000) + 1000000,
      marketCap: Math.floor(Math.random() * 100000000000) + 1000000000,
      peRatio: Math.round((Math.random() * 50 + 10) * 10) / 10,
      dividendYield: Math.round(Math.random() * 5 * 10) / 10,
      dayRange: {
        low: Math.round((basePrice * 0.95) * 100) / 100,
        high: Math.round((basePrice * 1.05) * 100) / 100
      },
      yearRange: {
        low: Math.round((basePrice * 0.7) * 100) / 100,
        high: Math.round((basePrice * 1.3) * 100) / 100
      },
      openPrice: Math.round((basePrice * (1 + (Math.random() - 0.5) * 0.02)) * 100) / 100,
      previousClose: Math.round((basePrice * (1 - changePercent / 100)) * 100) / 100,
      beta: Math.round((Math.random() * 2 + 0.5) * 10) / 10,
      eps: Math.round((Math.random() * 10 + 1) * 100) / 100,
      priceToBook: Math.round((Math.random() * 20 + 1) * 10) / 10,
      debtToEquity: Math.round(Math.random() * 2 * 10) / 10,
      returnOnEquity: Math.round((Math.random() * 0.3 + 0.1) * 100) / 100,
      profitMargin: Math.round((Math.random() * 0.2 + 0.1) * 100) / 100,
      revenueGrowth: Math.round((Math.random() * 0.2 + 0.05) * 100) / 100,
      earningsGrowth: Math.round((Math.random() * 0.3 + 0.1) * 100) / 100,
      freeCashFlow: Math.floor(Math.random() * 10000000000) + 1000000000,
      enterpriseValue: Math.floor(Math.random() * 100000000000) + 10000000000
    };
  }

  /**
   * Get batch processing statistics
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get current queue status
   */
  getQueueStatus(): {
    queueLength: number;
    isProcessing: boolean;
    averageWaitTime: number;
  } {
    const now = Date.now();
    const totalWaitTime = this.batchQueue.reduce((sum, req) => sum + (now - req.timestamp), 0);
    const averageWaitTime = this.batchQueue.length > 0 ? totalWaitTime / this.batchQueue.length : 0;

    return {
      queueLength: this.batchQueue.length,
      isProcessing: this.isProcessing,
      averageWaitTime
    };
  }

  /**
   * Clear all pending requests
   */
  clearQueue(): void {
    this.batchQueue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.batchQueue = [];
    
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
      this.batchTimeout = null;
    }
  }

  /**
   * Update batch configuration
   */
  updateConfig(config: Partial<{
    batchSize: number;
    batchDelay: number;
    maxQueueSize: number;
    requestTimeout: number;
  }>): void {
    if (config.batchSize) this.BATCH_SIZE = config.batchSize;
    if (config.batchDelay) this.BATCH_DELAY = config.batchDelay;
    if (config.maxQueueSize) this.MAX_QUEUE_SIZE = config.maxQueueSize;
    if (config.requestTimeout) this.REQUEST_TIMEOUT = config.requestTimeout;
    
    console.log('[MOCK] Batch API Manager config updated:', config);
  }

  /**
   * Add custom mock data for testing
   */
  addMockData(ticker: string, data: StockApiResponse): void {
    this.mockData[ticker.toUpperCase()] = data;
    console.log(`[MOCK] Added custom data for ${ticker}`);
  }

  /**
   * Clear all mock data
   */
  clearMockData(): void {
    this.mockData = {};
    console.log('[MOCK] All mock data cleared');
  }
}
