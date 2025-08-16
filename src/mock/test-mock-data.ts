// Mock stock data for testing the StockTracker application
// This file can be used to test the app without requiring a real financial API

export const mockStockData: Record<string, { price: number; changePercent: number }> = {
  'AAPL': { price: 175.20, changePercent: 0.5 },
  'GOOGL': { price: 140.10, changePercent: -1.2 },
  'MSFT': { price: 380.50, changePercent: 2.1 },
  'TSLA': { price: 245.30, changePercent: -0.8 },
  'NVDA': { price: 485.90, changePercent: 3.2 },
  'AMZN': { price: 145.80, changePercent: 1.5 },
  'META': { price: 320.40, changePercent: -0.3 },
  'NFLX': { price: 580.20, changePercent: 0.9 },
  'AMD': { price: 125.60, changePercent: -2.1 },
  'INTC': { price: 45.30, changePercent: 1.8 }
};

/**
 * Mock function to simulate fetching stock data
 * Replace the fetchStockData method in StockTrackerApp.ts with this for testing
 */
export async function mockFetchStockData(ticker: string): Promise<{ price: number; changePercent: number } | null> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
  
  // Simulate occasional failures
  if (Math.random() < 0.1) {
    throw new Error(`Mock API error for ${ticker}`);
  }
  
  const data = mockStockData[ticker.toUpperCase()];
  if (data) {
    // Add some realistic price variation
    const variation = (Math.random() - 0.5) * 0.02; // ±1% variation
    return {
      price: data.price * (1 + variation),
      changePercent: data.changePercent + (Math.random() - 0.5) * 0.5
    };
  }
  
  return null;
}

/**
 * Example usage in StockTrackerApp.ts:
 * 
 * Replace the fetchStockData method with:
 * 
 * private async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
 *   try {
 *     return await mockFetchStockData(ticker);
 *   } catch (error) {
 *     console.error(`Error fetching data for ${ticker}:`, error);
 *     return null;
 *   }
 * }
 */

// Test the mock data
if (require.main === module) {
  console.log('Testing mock stock data...');
  
  async function testMockData() {
    const testTickers = ['AAPL', 'GOOGL', 'MSFT', 'INVALID'];
    
    for (const ticker of testTickers) {
      try {
        const result = await mockFetchStockData(ticker);
        console.log(`${ticker}:`, result);
      } catch (error) {
        console.log(`${ticker}: Error -`, error.message);
      }
    }
  }
  
  testMockData();
}
