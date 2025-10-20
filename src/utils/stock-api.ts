/**
 * Stock API utilities using Alpha Vantage
 */

import axios from 'axios';
import { StockDataCache } from './stock-cache';
import { ALPHA_VANTAGE_API_KEY } from './constants';

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
 * Alpha Vantage API Provider
 */
export class AlphaVantageProvider {
  name = 'Alpha Vantage';
  private cache = StockDataCache.getInstance();
  private apiKey: string;

  constructor() {
    if (!ALPHA_VANTAGE_API_KEY) {
      throw new Error('ALPHA_VANTAGE_API_KEY environment variable is required for Alpha Vantage API');
    }
    this.apiKey = ALPHA_VANTAGE_API_KEY;
  }

  async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    try {
      // First, get the current quote for real-time data
      const quoteData = await this.fetchQuote(ticker);
      if (!quoteData) {
        return null;
      }

      // Get historical data for percentage change calculation
      const historicalData = await this.fetchHistoricalData(ticker, timeframe);
      
      const currentPrice = parseFloat(quoteData['05. price']);
      const openPrice = parseFloat(quoteData['02. open']);
      const volume = parseInt(quoteData['06. volume']);
      const previousClose = parseFloat(quoteData['08. previous close']);
      
      if (!currentPrice) {
        return null;
      }

      // Store current price in cache for future percentage calculations
      this.cache.storePriceData(ticker, currentPrice);

      // Calculate percentage change
      let changePercent: number;
      let previousPrice: number;

      if (previousClose && previousClose !== currentPrice) {
        changePercent = ((currentPrice - previousClose) / previousClose) * 100;
        previousPrice = previousClose;
        console.log(`✅ Using Alpha Vantage percentage data for ${ticker}: ${changePercent.toFixed(2)}%`);
      } else if (this.cache.hasValidPercentageData(ticker)) {
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
      } else {
        changePercent = 0.0;
        previousPrice = currentPrice;
        console.log(`🔄 No historical data for ${ticker}, using 0.0% change`);
      }

      // Calculate day range
      const dayHigh = parseFloat(quoteData['03. high']);
      const dayLow = parseFloat(quoteData['04. low']);
      const dayRange = {
        low: dayLow || currentPrice * 0.98,
        high: dayHigh || currentPrice * 1.02
      };

      // Calculate year range (simplified)
      const yearRange = {
        low: currentPrice * 0.7,
        high: currentPrice * 1.3
      };

      // Add delay to respect rate limits (5 requests per minute for free tier)
      await new Promise(resolve => setTimeout(resolve, 13000)); // 13 seconds to be safe

      // Try to fetch additional financial metrics
      let marketCap: number | undefined;
      let peRatio: number | undefined;
      let beta: number | undefined;
      let eps: number | undefined;
      let dividendYield: number | undefined;

      try {
        const overviewData = await this.fetchOverview(ticker);
        if (overviewData) {
          marketCap = parseFloat(overviewData['MarketCapitalization']) || undefined;
          peRatio = parseFloat(overviewData['PERatio']) || undefined;
          beta = parseFloat(overviewData['Beta']) || undefined;
          eps = parseFloat(overviewData['EPS']) || undefined;
          dividendYield = parseFloat(overviewData['DividendYield']) || undefined;
        }
      } catch (error) {
        console.log(`Alpha Vantage overview API failed for ${ticker}:`, error.message);
      }

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
        priceToBook: undefined, // Not available in Alpha Vantage free tier
        debtToEquity: undefined, // Not available in Alpha Vantage free tier
        returnOnEquity: undefined, // Not available in Alpha Vantage free tier
        profitMargin: undefined, // Not available in Alpha Vantage free tier
        revenueGrowth: undefined, // Not available in Alpha Vantage free tier
        earningsGrowth: undefined, // Not available in Alpha Vantage free tier
        freeCashFlow: undefined, // Not available in Alpha Vantage free tier
        enterpriseValue: undefined // Not available in Alpha Vantage free tier
      };
    } catch (error) {
      console.error(`Alpha Vantage API error for ${ticker}:`, error.message);
      if (error.response) {
        console.error(`Status: ${error.response.status}, Data:`, error.response.data);
      }
      return null;
    }
  }

  private async fetchQuote(ticker: string): Promise<any> {
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'GLOBAL_QUOTE',
        symbol: ticker,
        apikey: this.apiKey
      },
      timeout: 15000
    });

    if (response.data['Error Message']) {
      throw new Error(response.data['Error Message']);
    }

    if (response.data['Note']) {
      throw new Error('API call frequency limit reached. Please wait before making another request.');
    }

    return response.data['Global Quote'];
  }

  private async fetchHistoricalData(ticker: string, timeframe: string): Promise<any> {
    const functionName = this.mapTimeframeToFunction(timeframe);
    
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: functionName,
        symbol: ticker,
        apikey: this.apiKey,
        outputsize: 'compact'
      },
      timeout: 15000
    });

    if (response.data['Error Message']) {
      throw new Error(response.data['Error Message']);
    }

    if (response.data['Note']) {
      throw new Error('API call frequency limit reached. Please wait before making another request.');
    }

    return response.data;
  }

  private async fetchOverview(ticker: string): Promise<any> {
    const response = await axios.get('https://www.alphavantage.co/query', {
      params: {
        function: 'OVERVIEW',
        symbol: ticker,
        apikey: this.apiKey
      },
      timeout: 15000
    });

    if (response.data['Error Message']) {
      throw new Error(response.data['Error Message']);
    }

    if (response.data['Note']) {
      throw new Error('API call frequency limit reached. Please wait before making another request.');
    }

    return response.data;
  }

  private mapTimeframeToFunction(timeframe: string): string {
    switch (timeframe) {
      case '1D': return 'TIME_SERIES_INTRADAY';
      case '1W': return 'TIME_SERIES_DAILY';
      case '1M': return 'TIME_SERIES_DAILY';
      case '1Y': return 'TIME_SERIES_DAILY';
      default: return 'TIME_SERIES_DAILY';
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
  private alphaVantageProvider: AlphaVantageProvider | null;
  private mockProvider: MockProvider;

  constructor() {
    try {
      this.alphaVantageProvider = new AlphaVantageProvider();
    } catch (error) {
      console.warn('Alpha Vantage provider not available:', error.message);
      this.alphaVantageProvider = null;
    }
    this.mockProvider = new MockProvider();
  }

  async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    // Try Alpha Vantage first if available
    if (this.alphaVantageProvider) {
      try {
        const result = await this.alphaVantageProvider.fetchStockData(ticker, timeframe);
        if (result) {
          console.log(`✅ Successfully fetched ${ticker} data from Alpha Vantage`);
          return result;
        }
      } catch (error) {
        console.error(`❌ Alpha Vantage failed for ${ticker}:`, error.message);
      }
    } else {
      console.log('Alpha Vantage provider not available, skipping...');
    }

    // Fallback to mock data
    console.log(`🔄 Falling back to mock data for ${ticker}`);
    return await this.mockProvider.fetchStockData(ticker, timeframe);
  }

  getProviderInfo(): string[] {
    const providers = [];
    if (this.alphaVantageProvider) {
      providers.push('Alpha Vantage');
    }
    providers.push('Mock Data');
    return providers;
  }
}

// Export default instance
export const stockApiManager = new StockApiManager();
