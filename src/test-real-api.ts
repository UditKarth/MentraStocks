import 'dotenv/config';
import { stockApiManager } from './utils/stock-api';

async function testRealStockAPI() {
  console.log('🧪 Testing Real Stock API with popular stocks...\n');

  const testStocks = ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN', 'NVDA', 'META', 'NFLX'];
  const timeframes = ['1D', '1W', '1M'];

  for (const ticker of testStocks) {
    console.log(`📈 Testing ${ticker}:`);
    
    for (const timeframe of timeframes) {
      try {
        console.log(`  ${timeframe}: Fetching data...`);
        const data = await stockApiManager.fetchStockData(ticker, timeframe);
        
        if (data) {
          const changeIcon = data.changePercent >= 0 ? '▲' : '▼';
          console.log(`  ${timeframe}: $${data.price.toFixed(2)} ${changeIcon}${Math.abs(data.changePercent).toFixed(2)}%`);
        } else {
          console.log(`  ${timeframe}: ❌ No data available`);
        }
      } catch (error) {
        console.log(`  ${timeframe}: ❌ Error: ${error.message}`);
      }
      
      // Small delay between requests to be respectful to the API
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(''); // Empty line between stocks
  }

  console.log('✅ Real API test completed!');
  console.log(`📊 Available providers: ${stockApiManager.getProviderInfo().join(', ')}`);
  console.log('💡 Using Yahoo Finance API (no API key required)');
}

// Run the test
testRealStockAPI().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
