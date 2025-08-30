/**
 * Batch API Manager for Stock Data
 * 
 * Implements intelligent request batching and parallelization to:
 * - Reduce API call frequency
 * - Improve response times
 * - Handle rate limiting more effectively
 * - Optimize network usage for smart glasses
 */

import { StockApiResponse } from '../types';

export interface BatchRequest {
  ticker: string;
  resolve: (value: StockApiResponse | null) => void;
  reject: (reason: any) => void;
  priority: 'high' | 'normal' | 'low';
  timestamp: number;
}

export interface BatchResponse {
  ticker: string;
  data: StockApiResponse | null;
  error?: string;
}

export class BatchApiManager {
  private static instance: BatchApiManager;
  
  private batchQueue: BatchRequest[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private isProcessing = false;
  
  // Configuration
  private BATCH_SIZE = 8; // Optimal for Yahoo Finance rate limits
  private BATCH_DELAY = 150; // ms - balance between responsiveness and batching
  private MAX_QUEUE_SIZE = 100;
  private REQUEST_TIMEOUT = 10000; // 10 seconds
  
  // Statistics
  private stats = {
    totalRequests: 0,
    batchedRequests: 0,
    failedRequests: 0,
    averageBatchSize: 0,
    totalBatches: 0
  };

  private constructor() {
    console.log('Batch API Manager initialized');
  }

  /**
   * Get singleton instance
   */
  static getInstance(): BatchApiManager {
    if (!BatchApiManager.instance) {
      BatchApiManager.instance = new BatchApiManager();
    }
    return BatchApiManager.instance;
  }

  /**
   * Fetch stock data with intelligent batching
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

    console.log(`Processing batch of ${batchSize} requests: ${tickers.join(', ')}`);

    try {
      // Fetch data for all tickers in batch
      const results = await this.fetchBatchFromAPI(tickers);
      
      // Resolve each request
      batch.forEach((request, index) => {
        const result = results[index];
        if (result && result.data) {
          request.resolve(result.data);
        } else {
          request.reject(new Error(`Failed to fetch data for ${request.ticker}`));
          this.stats.failedRequests++;
        }
      });

      // Update statistics
      this.stats.batchedRequests += batchSize;
      this.stats.totalBatches++;
      this.stats.averageBatchSize = this.stats.batchedRequests / this.stats.totalBatches;

    } catch (error) {
      console.error('Batch processing failed:', error);
      
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
   * Fetch data for multiple tickers from API
   */
  private async fetchBatchFromAPI(tickers: string[]): Promise<BatchResponse[]> {
    // Use Yahoo Finance batch endpoint if available
    const batchUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${tickers.join(',')}`;
    
    try {
      const response = await fetch(batchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        }
      });

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Parse batch response
      return tickers.map(ticker => {
        try {
          const stockData = this.parseBatchResponse(data, ticker);
          return {
            ticker,
            data: stockData
          };
                 } catch (error) {
           return {
             ticker,
             data: null as StockApiResponse | null,
             error: error instanceof Error ? error.message : 'Unknown error'
           };
         }
      });

    } catch (error) {
      console.error('Batch API request failed:', error);
      
      // Fallback to individual requests
      return this.fallbackToIndividualRequests(tickers);
    }
  }

  /**
   * Parse batch response from Yahoo Finance
   */
  private parseBatchResponse(data: any, ticker: string): StockApiResponse | null {
    if (!data.chart || !data.chart.result) {
      return null;
    }

    const result = data.chart.result.find((r: any) => r.meta && r.meta.symbol === ticker);
    if (!result) {
      return null;
    }

    const meta = result.meta;
    const indicators = result.indicators?.quote?.[0];
    
    if (!meta || !indicators) {
      return null;
    }

    const currentPrice = meta.regularMarketPrice || 0;
    const previousClose = meta.previousClose || currentPrice;
    const changePercent = previousClose > 0 ? ((currentPrice - previousClose) / previousClose) * 100 : 0;

    return {
      price: currentPrice,
      changePercent: changePercent,
      volume: indicators.volume?.[0] || 0,
      marketCap: meta.marketCap || 0,
      peRatio: meta.trailingPE || 0,
      dividendYield: meta.trailingAnnualDividendYield || 0,
      dayRange: {
        low: meta.regularMarketDayLow || currentPrice,
        high: meta.regularMarketDayHigh || currentPrice
      },
      yearRange: {
        low: meta.fiftyTwoWeekLow || currentPrice,
        high: meta.fiftyTwoWeekHigh || currentPrice
      },
      openPrice: meta.regularMarketOpen || currentPrice,
      previousClose: previousClose
    };
  }

  /**
   * Fallback to individual requests if batch fails
   */
  private async fallbackToIndividualRequests(tickers: string[]): Promise<BatchResponse[]> {
    console.log('Falling back to individual requests for:', tickers);
    
    const results: BatchResponse[] = [];
    
    for (const ticker of tickers) {
      try {
        // Import the existing stock API manager
        const { stockApiManager } = await import('./stock-api');
        const data = await stockApiManager.fetchStockData(ticker, '1D');
        
        results.push({
          ticker,
          data
        });
      } catch (error) {
        results.push({
          ticker,
          data: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      
      // Add small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return results;
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
    
    console.log('Batch API Manager config updated:', config);
  }
}
