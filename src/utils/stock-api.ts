/**
 * Stock API utilities using Yahoo Finance
 */

import axios from 'axios';

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
}

/**
 * Yahoo Finance API Provider (No API key required)
 */
class YahooFinanceProvider {
  name = 'Yahoo Finance';

  async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    try {
      // Yahoo Finance API endpoint
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}`, {
        params: {
          interval: this.mapTimeframe(timeframe),
          range: this.mapRange(timeframe),
          includePrePost: false
        },
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; StockTracker/1.0)'
        }
      });

      const data = response.data.chart.result[0];
      const quote = data.indicators.quote[0];
      const meta = data.meta;
      
      // Get current and previous prices
      const currentPrice = quote.close[quote.close.length - 1];
      const previousPrice = quote.close[quote.close.length - 2] || quote.open[quote.open.length - 1];
      const openPrice = quote.open[quote.open.length - 1];
      const volume = quote.volume[quote.volume.length - 1];
      
      if (!currentPrice || !previousPrice) {
        return null;
      }

      const changePercent = ((currentPrice - previousPrice) / previousPrice) * 100;

      // Calculate day range
      const dayPrices = quote.close.slice(-1);
      const dayRange = {
        low: Math.min(...dayPrices.filter((p: number | null) => p !== null)),
        high: Math.max(...dayPrices.filter((p: number | null) => p !== null))
      };

      // Calculate year range (approximate)
      const yearPrices = quote.close.slice(-252); // ~1 year of trading days
      const yearRange = {
        low: Math.min(...yearPrices.filter((p: number | null) => p !== null)),
        high: Math.max(...yearPrices.filter((p: number | null) => p !== null))
      };

      return {
        price: currentPrice,
        changePercent: changePercent,
        volume: volume,
        openPrice: openPrice,
        previousClose: previousPrice,
        dayRange: dayRange,
        yearRange: yearRange
      };
    } catch (error) {
      console.error(`Yahoo Finance API error for ${ticker}:`, error.message);
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

  async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

    // Simulate occasional failures
    if (Math.random() < 0.1) {
      return null;
    }

    // Generate realistic mock data
    const basePrice = 50 + Math.random() * 950; // $50-$1000 range
    const changePercent = (Math.random() - 0.5) * 10; // -5% to +5%

    return {
      price: basePrice,
      changePercent: changePercent
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
