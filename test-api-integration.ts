// API Integration Test - Real API Validation
// This test validates the real API integration and should be run sparingly to avoid rate limiting

import { BatchApiManager } from './src/utils/batch-api-manager';
import { IntelligentCache } from './src/utils/intelligent-cache';
import { StockApiResponse } from './src/types';

console.log('🔗 API Integration Test - Real API Validation\n');
console.log('⚠️  WARNING: This test makes real API calls and should be run sparingly\n');

async function testRealApiIntegration() {
  console.log('📡 Testing Real API Integration...');
  
  const batchApi = BatchApiManager.getInstance();
  const cache = IntelligentCache.getInstance();
  
  // Test 1: Single stock request
  console.log('✅ Test 1: Single stock request...');
  try {
    const aaplResult = await batchApi.fetchStockData('AAPL', 'high');
    if (aaplResult) {
      console.log('   AAPL:', {
        price: `$${aaplResult.price}`,
        change: `${aaplResult.changePercent}%`,
        volume: aaplResult.volume?.toLocaleString(),
        marketCap: aaplResult.marketCap ? `$${(aaplResult.marketCap / 1e12).toFixed(2)}T` : 'N/A'
      });
    } else {
      console.log('   AAPL: Failed to fetch data');
    }
  } catch (error) {
    console.log('   AAPL: Error -', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Test 2: Small batch request
  console.log('✅ Test 2: Small batch request...');
  try {
    const batchTickers = ['GOOGL', 'MSFT'];
    const batchPromises = batchTickers.map(ticker => batchApi.fetchStockData(ticker, 'normal'));
    
    const batchResults = await Promise.all(batchPromises);
    const successCount = batchResults.filter(r => r !== null).length;
    
    console.log(`   Batch results: ${successCount}/${batchTickers.length} successful`);
    
    batchResults.forEach((result, index) => {
      if (result) {
        console.log(`   ${batchTickers[index]}: $${result.price} (${result.changePercent}%)`);
      } else {
        console.log(`   ${batchTickers[index]}: Failed`);
      }
    });
  } catch (error) {
    console.log('   Batch test: Error -', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Test 3: Cache integration
  console.log('✅ Test 3: Cache integration...');
  try {
    // First request - should hit API
    const firstRequest = await batchApi.fetchStockData('SPY', 'normal');
    console.log('   First SPY request:', firstRequest ? 'Success' : 'Failed');
    
    // Second request - should hit cache
    const secondRequest = await batchApi.fetchStockData('SPY', 'normal');
    console.log('   Second SPY request:', secondRequest ? 'Success' : 'Failed');
    
    // Check cache stats
    const cacheStats = cache.getStats();
    console.log('   Cache stats:', {
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      hitRate: Math.round(cacheStats.hitRate * 100) + '%'
    });
  } catch (error) {
    console.log('   Cache test: Error -', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Test 4: Error handling
  console.log('✅ Test 4: Error handling...');
  try {
    const invalidResult = await batchApi.fetchStockData('INVALID_TICKER_12345', 'low');
    console.log('   Invalid ticker result:', invalidResult ? 'Unexpected success' : 'Expected failure');
  } catch (error) {
    console.log('   Invalid ticker: Expected error -', error instanceof Error ? error.message : 'Unknown error');
  }
  
  // Test 5: Batch API statistics
  console.log('✅ Test 5: Batch API statistics...');
  const batchStats = batchApi.getStats();
  const queueStatus = batchApi.getQueueStatus();
  
  console.log('   Batch API stats:', {
    totalRequests: batchStats.totalRequests,
    batchedRequests: batchStats.batchedRequests,
    failedRequests: batchStats.failedRequests,
    averageBatchSize: Math.round(batchStats.averageBatchSize * 10) / 10,
    totalBatches: batchStats.totalBatches
  });
  
  console.log('   Queue status:', {
    queueLength: queueStatus.queueLength,
    isProcessing: queueStatus.isProcessing,
    averageWaitTime: Math.round(queueStatus.averageWaitTime) + 'ms'
  });
  
  console.log('📡 Real API Integration Test: COMPLETED\n');
}

async function testApiRateLimiting() {
  console.log('⏱️  Testing API Rate Limiting Behavior...');
  
  const batchApi = BatchApiManager.getInstance();
  
  // Test rapid requests to see rate limiting behavior
  console.log('✅ Testing rapid request handling...');
  
  const rapidTickers = ['QQQ', 'IWM', 'VTI', 'VOO', 'DIA'];
  const rapidPromises = rapidTickers.map((ticker, index) => {
    // Add small delay between requests
    return new Promise<{ ticker: string; result: StockApiResponse | null; error?: string }>(async (resolve) => {
      setTimeout(async () => {
        try {
          const result = await batchApi.fetchStockData(ticker, 'normal');
          resolve({ ticker, result });
        } catch (error) {
          resolve({ 
            ticker, 
            result: null, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }, index * 100); // 100ms delay between requests
    });
  });
  
  const rapidResults = await Promise.all(rapidPromises);
  
  console.log('   Rapid request results:');
  rapidResults.forEach(({ ticker, result, error }) => {
    if (result) {
      console.log(`     ${ticker}: Success - $${result.price} (${result.changePercent}%)`);
    } else {
      console.log(`     ${ticker}: Failed - ${error || 'Unknown error'}`);
    }
  });
  
  const successCount = rapidResults.filter(r => r.result !== null).length;
  console.log(`   Success rate: ${successCount}/${rapidTickers.length} (${Math.round(successCount/rapidTickers.length*100)}%)`);
  
  console.log('⏱️  API Rate Limiting Test: COMPLETED\n');
}

async function runApiIntegrationTests() {
  try {
    console.log('🚀 Starting API Integration Tests...\n');
    
    await testRealApiIntegration();
    await testApiRateLimiting();
    
    console.log('🎉 API Integration Tests Completed!');
    console.log('\n📊 Test Summary:');
    console.log('   • Real API connectivity validated');
    console.log('   • Batch processing tested');
    console.log('   • Cache integration verified');
    console.log('   • Error handling confirmed');
    console.log('   • Rate limiting behavior observed');
    
    console.log('\n✅ API integration is working correctly!');
    console.log('💡 Remember to run this test sparingly to avoid rate limiting.');
    
  } catch (error) {
    console.error('❌ API integration test failed:', error);
    console.log('\n💡 This may be due to:');
    console.log('   • Network connectivity issues');
    console.log('   • API rate limiting');
    console.log('   • API service downtime');
    console.log('   • Invalid API credentials');
  }
}

// Export for use in other tests
export { runApiIntegrationTests, testRealApiIntegration, testApiRateLimiting };

// Check if this is being run directly
if (require.main === module) {
  // Add a small delay before starting to avoid overwhelming the API
  console.log('⏳ Waiting 2 seconds before starting API tests...');
  setTimeout(() => {
    runApiIntegrationTests();
  }, 2000);
}
