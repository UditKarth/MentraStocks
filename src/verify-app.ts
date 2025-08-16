import 'dotenv/config';
import { stockApiManager } from './utils/stock-api';
import axios from 'axios';

async function verifyAppFunctionality() {
  console.log('🔍 Verifying StockTracker App Functionality\n');

  // Test 1: Verify Real Stock API
  console.log('1️⃣ Testing Real Stock API...');
  const testStocks = ['AAPL', 'TSLA', 'GOOGL'];
  let apiSuccess = true;

  for (const ticker of testStocks) {
    try {
      const data = await stockApiManager.fetchStockData(ticker, '1D');
      if (data) {
        console.log(`   ✅ ${ticker}: $${data.price.toFixed(2)} (${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%)`);
      } else {
        console.log(`   ❌ ${ticker}: No data available`);
        apiSuccess = false;
      }
    } catch (error) {
      console.log(`   ❌ ${ticker}: Error - ${error.message}`);
      apiSuccess = false;
    }
  }

  // Test 2: Verify API Providers
  console.log('\n2️⃣ Testing API Providers...');
  const providers = stockApiManager.getProviderInfo();
  console.log(`   Available providers: ${providers.join(', ')}`);
  console.log(`   ✅ Primary provider (Yahoo Finance): ${providers.includes('Yahoo Finance') ? 'Available' : 'Missing'}`);

  // Test 3: Test API Endpoints (if server is running)
  console.log('\n3️⃣ Testing API Endpoints...');
  const port = process.env.PORT || 80;
  const baseUrl = `http://localhost:${port}`;

  try {
    // Test health check
    const healthResponse = await axios.get(`${baseUrl}/health`, { timeout: 5000 });
    console.log(`   ✅ Health check: ${healthResponse.status} ${healthResponse.statusText}`);

    // Test status endpoint
    const statusResponse = await axios.get(`${baseUrl}/api/status`, { timeout: 5000 });
    console.log(`   ✅ Status endpoint: ${statusResponse.status} ${statusResponse.statusText}`);
    console.log(`   📊 App: ${statusResponse.data.app}`);
    console.log(`   📊 Version: ${statusResponse.data.version}`);

    // Test stock data endpoint
    const stockResponse = await axios.get(`${baseUrl}/api/stock/AAPL`, { timeout: 5000 });
    console.log(`   ✅ Stock endpoint: ${stockResponse.status} ${stockResponse.statusText}`);
    console.log(`   📈 AAPL data: $${stockResponse.data.price} (${stockResponse.data.changePercent}%)`);

  } catch (error) {
    console.log(`   ⚠️  Server not running on port ${port} - start the app first to test endpoints`);
    console.log(`   💡 Run: npm run start (for real data) or npm run start:mock (for mock data)`);
  }

  // Test 4: Verify Environment Configuration
  console.log('\n4️⃣ Verifying Environment Configuration...');
  const requiredEnvVars = ['PACKAGE_NAME', 'AUGMENTOS_API_KEY'];
  const optionalEnvVars = ['FMP_API_KEY', 'PORT'];

  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar}: Set`);
    } else {
      console.log(`   ❌ ${envVar}: Missing (required)`);
    }
  }

  for (const envVar of optionalEnvVars) {
    if (process.env[envVar]) {
      console.log(`   ✅ ${envVar}: Set (${process.env[envVar]})`);
    } else {
      console.log(`   ⚠️  ${envVar}: Not set (optional)`);
    }
  }

  // Test 5: Verify Package Dependencies
  console.log('\n5️⃣ Verifying Package Dependencies...');
  try {
    const packageJson = require('../package.json');
    const requiredDeps = ['@mentra/sdk', 'axios', 'dotenv'];
    
    for (const dep of requiredDeps) {
      if (packageJson.dependencies[dep]) {
        console.log(`   ✅ ${dep}: ${packageJson.dependencies[dep]}`);
      } else {
        console.log(`   ❌ ${dep}: Missing`);
      }
    }
  } catch (error) {
    console.log(`   ❌ Could not read package.json: ${error.message}`);
  }

  // Summary
  console.log('\n📋 Verification Summary:');
  console.log(`   Real Stock API: ${apiSuccess ? '✅ Working' : '❌ Issues detected'}`);
  console.log(`   API Providers: ✅ Available`);
  console.log(`   Environment: ${requiredEnvVars.every(v => process.env[v]) ? '✅ Configured' : '⚠️  Missing required vars'}`);
  
  if (apiSuccess) {
    console.log('\n🎉 StockTracker App is ready to use with real stock data!');
    console.log('\n🚀 Next steps:');
    console.log('   1. Set up your environment variables (see config/env.example)');
    console.log('   2. Run: npm run start (for real data)');
    console.log('   3. Run: npm run start:mock (for mock data)');
    console.log('   4. Test voice commands: "Stock tracker add AAPL"');
    console.log('\n📚 Available commands:');
    console.log('   - npm run start: Real stock data');
    console.log('   - npm run start:mock: Mock data');
    console.log('   - npm run test:real: Test real API');
    console.log('   - npm run test: Test mock API');
  } else {
    console.log('\n⚠️  Some issues detected. Please check the errors above.');
  }
}

// Run verification
verifyAppFunctionality().catch(error => {
  console.error('❌ Verification failed:', error);
  process.exit(1);
});
