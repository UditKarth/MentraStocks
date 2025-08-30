/**
 * Stock API utilities using Yahoo Finance
 */

import axios from 'axios';
import { StockDataCache } from './stock-cache';

export interface StockApiResponse {
  price: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  peRatio?: number;
  dividendYield?: number;
  dayRange?: {
    low: number;
    high: number;
  };
  yearRange?: {
    low: number;
    high: number;
  };
  openPrice?: number;
  previousClose?: number;
  // Additional metrics for investment analysis
  beta?: number;
  eps?: number;
  priceToBook?: number;
  debtToEquity?: number;
  returnOnEquity?: number;
  profitMargin?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  freeCashFlow?: number;
  enterpriseValue?: number;
}

/**
 * Yahoo Finance API Provider (No API key required)
 */
export class YahooFinanceProvider {
  name = 'Yahoo Finance';
  private cache = StockDataCache.getInstance();

  async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    try {
      // Try multiple Yahoo Finance endpoints with better error handling
      let priceData = null;
      let metricsData = null;

      // Method 1: Try the newer API endpoint first
      try {
        const priceResponse = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
          params: {
            interval: this.mapTimeframe(timeframe),
            range: this.mapRange(timeframe),
            includePrePost: false
          },
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site'
          }
        });

        if (priceResponse.data?.chart?.result?.[0]) {
          priceData = priceResponse.data.chart.result[0];
        }
      } catch (error) {
        console.log(`Yahoo Finance chart API failed for ${ticker}:`, error.message);
      }

      // Method 2: Try alternative endpoint if first one failed
      if (!priceData) {
        try {
          const altResponse = await axios.get(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
            params: {
              modules: 'price,summaryDetail'
            },
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive'
            }
          });

          if (altResponse.data?.quoteSummary?.result?.[0]) {
            const priceModule = altResponse.data.quoteSummary.result[0].price;
            if (priceModule) {
              priceData = {
                meta: { regularMarketPrice: priceModule.regularMarketPrice?.raw },
                indicators: {
                  quote: [{
                    close: [priceModule.regularMarketPrice?.raw],
                    open: [priceModule.regularMarketOpen?.raw],
                    volume: [priceModule.regularMarketVolume?.raw]
                  }]
                }
              };
            }
          }
        } catch (error) {
          console.log(`Yahoo Finance alternative API failed for ${ticker}:`, error.message);
        }
      }

      if (!priceData) {
        throw new Error('Unable to fetch price data from Yahoo Finance');
      }

      const quote = priceData.indicators.quote[0];
      const meta = priceData.meta;
      
      // Get current and previous prices
      const currentPrice = quote.close[quote.close.length - 1] || meta.regularMarketPrice;
      const openPrice = quote.open[quote.open.length - 1];
      const volume = quote.volume[quote.volume.length - 1];
      
      if (!currentPrice) {
        return null;
      }

      // Store current price in cache for future percentage calculations
      this.cache.storePriceData(ticker, currentPrice);

      // Calculate percentage change using smart caching strategy
      let changePercent: number;
      let previousPrice: number;

      // Strategy 1: Try to get percentage from current API response
      const apiPreviousPrice = quote.close[quote.close.length - 2] || quote.open[quote.open.length - 1];
      if (apiPreviousPrice && apiPreviousPrice !== currentPrice) {
        changePercent = ((currentPrice - apiPreviousPrice) / apiPreviousPrice) * 100;
        previousPrice = apiPreviousPrice;
        console.log(`✅ Using API percentage data for ${ticker}: ${changePercent.toFixed(2)}%`);
      } 
      // Strategy 2: Use cached historical data
      else if (this.cache.hasValidPercentageData(ticker)) {
        const cachedPreviousPrice = this.cache.getPreviousPrice(ticker);
        if (cachedPreviousPrice && cachedPreviousPrice !== currentPrice) {
          changePercent = this.cache.calculatePercentageChange(ticker, currentPrice);
          previousPrice = cachedPreviousPrice;
          console.log(`📊 Using cached percentage data for ${ticker}: ${changePercent.toFixed(2)}%`);
        } else {
          changePercent = 0.0;
          previousPrice = currentPrice;
          console.log(`⚠️ No valid previous price for ${ticker}, using 0.0% change`);
        }
      } 
      // Strategy 3: Fallback to 0.0% change
      else {
        changePercent = 0.0;
        previousPrice = currentPrice;
        console.log(`🔄 No historical data for ${ticker}, using 0.0% change`);
      }

      // Calculate day range (simplified)
      const dayRange = {
        low: currentPrice * 0.98,
        high: currentPrice * 1.02
      };

      // Calculate year range (simplified)
      const yearRange = {
        low: currentPrice * 0.7,
        high: currentPrice * 1.3
      };

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));

      // Try to fetch additional financial metrics with different approach
      try {
        // Try the newer v11 endpoint first
        const metricsResponse = await axios.get(`https://query1.finance.yahoo.com/v11/finance/quoteSummary/${ticker}`, {
          params: {
            modules: 'summaryDetail,financialData,defaultKeyStatistics'
          },
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Referer': 'https://finance.yahoo.com/',
            'Origin': 'https://finance.yahoo.com'
          }
        });

        if (metricsResponse.data?.quoteSummary?.result?.[0]) {
          metricsData = metricsResponse.data.quoteSummary.result[0];
        }
      } catch (error) {
        console.log(`Yahoo Finance v11 API failed for ${ticker}:`, error.message);
        
        // Try alternative approach - fetch from the main page
        try {
          const altResponse = await axios.get(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`, {
            params: {
              modules: 'price,summaryDetail'
            },
            timeout: 15000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Connection': 'keep-alive',
              'Referer': 'https://finance.yahoo.com/',
              'Origin': 'https://finance.yahoo.com'
            }
          });

          if (altResponse.data?.quoteSummary?.result?.[0]) {
            const summaryDetail = altResponse.data.quoteSummary.result[0].summaryDetail;
            if (summaryDetail) {
              metricsData = {
                summaryDetail: summaryDetail,
                financialData: {},
                defaultKeyStatistics: {}
              };
            }
          }
        } catch (altError) {
          console.log(`Yahoo Finance alternative metrics API failed for ${ticker}:`, altError.message);
        }
      }

      // Extract metrics with fallbacks
      const summaryDetail = metricsData?.summaryDetail;
      const financialData = metricsData?.financialData;
      const defaultKeyStatistics = metricsData?.defaultKeyStatistics;

      const marketCap = summaryDetail?.marketCap?.raw;
      const dividendYield = summaryDetail?.dividendYield?.raw;
      const peRatio = financialData?.forwardPE?.raw || financialData?.trailingPE?.raw;
      const beta = defaultKeyStatistics?.beta?.raw;
      const eps = financialData?.trailingEps?.raw;
      const priceToBook = financialData?.priceToBook?.raw;
      const debtToEquity = financialData?.debtToEquity?.raw;
      const returnOnEquity = financialData?.returnOnEquity?.raw;
      const profitMargin = financialData?.profitMargins?.raw;
      const freeCashFlow = financialData?.freeCashflow?.raw;
      const enterpriseValue = defaultKeyStatistics?.enterpriseValue?.raw;

      return {
        price: currentPrice,
        changePercent: changePercent,
        volume: volume,
        openPrice: openPrice,
        previousClose: previousPrice,
        dayRange: dayRange,
        yearRange: yearRange,
        marketCap: marketCap,
        dividendYield: dividendYield,
        peRatio: peRatio,
        beta: beta,
        eps: eps,
        priceToBook: priceToBook,
        debtToEquity: debtToEquity,
        returnOnEquity: returnOnEquity,
        profitMargin: profitMargin,
        revenueGrowth: null, // Simplified for now
        earningsGrowth: null, // Simplified for now
        freeCashFlow: freeCashFlow,
        enterpriseValue: enterpriseValue
      };
    } catch (error) {
      console.error(`Yahoo Finance API error for ${ticker}:`, error.message);
      if (error.response) {
        console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      }
      return null;
    }
  }

  private mapTimeframe(timeframe: string): string {
    switch (timeframe) {
      case '1D': return '1m';
      case '1W': return '5m';
      case '1M': return '1d';
      case '1Y': return '1d';
      default: return '1m';
    }
  }

  private mapRange(timeframe: string): string {
    switch (timeframe) {
      case '1D': return '1d';
      case '1W': return '5d';
      case '1M': return '1mo';
      case '1Y': return '1y';
      default: return '1d';
    }
  }
}

/**
 * Mock API Provider for testing
 */
class MockProvider {
  name = 'Mock Data';
  private cache = StockDataCache.getInstance();

  async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Simulate occasional failures
    if (Math.random() < 0.1) {
      return null;
    }

    // Generate realistic mock data
    const basePrice = 50 + Math.random() * 950; // $50-$1000 range
    const volume = 1000000 + Math.random() * 10000000;
    const openPrice = basePrice * (0.98 + Math.random() * 0.04);
    
    // Store current price in cache
    this.cache.storePriceData(ticker, basePrice);
    
    // Calculate percentage change using cache strategy
    let changePercent: number;
    let previousClose: number;
    
    if (this.cache.hasValidPercentageData(ticker)) {
      const cachedPreviousPrice = this.cache.getPreviousPrice(ticker);
      if (cachedPreviousPrice && cachedPreviousPrice !== basePrice) {
        changePercent = this.cache.calculatePercentageChange(ticker, basePrice);
        previousClose = cachedPreviousPrice;
      } else {
        changePercent = 0.0;
        previousClose = basePrice;
      }
    } else {
      changePercent = 0.0;
      previousClose = basePrice;
    }

    return {
      price: basePrice,
      changePercent: changePercent,
      volume: volume,
      openPrice: openPrice,
      previousClose: previousClose,
      dayRange: {
        low: basePrice * 0.95,
        high: basePrice * 1.05
      },
      yearRange: {
        low: basePrice * 0.7,
        high: basePrice * 1.3
      },
      // Mock investment metrics
      marketCap: 1000000000 + Math.random() * 100000000000,
      peRatio: 10 + Math.random() * 30,
      beta: 0.5 + Math.random() * 1.5,
      eps: -5 + Math.random() * 10,
      priceToBook: 0.5 + Math.random() * 5,
      debtToEquity: Math.random() * 2,
      returnOnEquity: 0.05 + Math.random() * 0.25,
      profitMargin: 0.05 + Math.random() * 0.25,
      revenueGrowth: -10 + Math.random() * 30,
      earningsGrowth: -20 + Math.random() * 40,
      dividendYield: Math.random() * 0.05,
      freeCashFlow: -100000000 + Math.random() * 1000000000,
      enterpriseValue: 1000000000 + Math.random() * 100000000000
    };
  }
}

/**
 * Stock API Manager
 */
export class StockApiManager {
  private yahooProvider: YahooFinanceProvider;
  private mockProvider: MockProvider;

  constructor() {
    this.yahooProvider = new YahooFinanceProvider();
    this.mockProvider = new MockProvider();
  }

  async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    // Try Yahoo Finance first
    try {
      const result = await this.yahooProvider.fetchStockData(ticker, timeframe);
      if (result) {
        console.log(`✅ Successfully fetched ${ticker} data from Yahoo Finance`);
        return result;
      }
    } catch (error) {
      console.error(`❌ Yahoo Finance failed for ${ticker}:`, error.message);
    }

    // Fallback to mock data
    console.log(`🔄 Falling back to mock data for ${ticker}`);
    return await this.mockProvider.fetchStockData(ticker, timeframe);
  }

  getProviderInfo(): string[] {
    return ['Yahoo Finance', 'Mock Data'];
  }
}

// Export default instance
export const stockApiManager = new StockApiManager();
