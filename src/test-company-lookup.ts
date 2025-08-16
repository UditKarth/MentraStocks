import 'dotenv/config';
import { CompanyLookup } from './utils/company-lookup';

async function testCompanyLookup() {
  console.log('🔍 Testing Company Name to Ticker Lookup\n');

  const testCompanies = [
    // Exact matches
    'Apple',
    'Google',
    'Microsoft',
    'Tesla',
    'Amazon',
    'NVIDIA',
    'Meta',
    'Facebook',
    'Netflix',
    
    // Partial matches
    'Apple Inc',
    'Google LLC',
    'Microsoft Corporation',
    'Tesla Motors',
    'Amazon.com',
    'NVIDIA Corporation',
    'Meta Platforms',
    'Facebook Inc',
    'Netflix Inc',
    
    // Common variations
    'JP Morgan',
    'Bank of America',
    'Wells Fargo',
    'Goldman Sachs',
    'Coca Cola',
    'Coca-Cola',
    'Procter and Gamble',
    'Johnson and Johnson',
    'Exxon Mobil',
    'General Electric',
    
    // Edge cases
    'Unknown Company',
    'XYZ Corp',
    '123 Company',
    '',
    '   ',
  ];

  for (const companyName of testCompanies) {
    console.log(`📈 Looking up: "${companyName}"`);
    
    try {
      const result = await CompanyLookup.lookupCompany(companyName);
      
      if (result.success && result.results.length > 0) {
        console.log(`   ✅ Found ${result.results.length} match(es):`);
        result.results.forEach((match, index) => {
          console.log(`      ${index + 1}. ${match.ticker} (${match.name}) - Confidence: ${(match.confidence * 100).toFixed(1)}%`);
        });
      } else {
        console.log(`   ❌ No matches found: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log(''); // Empty line between companies
  }

  // Test some specific scenarios
  console.log('🧪 Testing Specific Scenarios:\n');
  
  const scenarios = [
    { name: 'apple', expected: 'AAPL' },
    { name: 'google', expected: 'GOOGL' },
    { name: 'microsoft', expected: 'MSFT' },
    { name: 'tesla', expected: 'TSLA' },
    { name: 'amazon', expected: 'AMZN' },
    { name: 'nvidia', expected: 'NVDA' },
    { name: 'meta', expected: 'META' },
    { name: 'facebook', expected: 'META' },
    { name: 'netflix', expected: 'NFLX' },
  ];

  let successCount = 0;
  for (const scenario of scenarios) {
    const result = await CompanyLookup.lookupCompany(scenario.name);
    const success = result.success && result.results.length > 0 && result.results[0].ticker === scenario.expected;
    
    if (success) {
      console.log(`   ✅ "${scenario.name}" → ${scenario.expected}`);
      successCount++;
    } else {
      console.log(`   ❌ "${scenario.name}" → Expected: ${scenario.expected}, Got: ${result.results[0]?.ticker || 'None'}`);
    }
  }

  console.log(`\n📊 Test Results: ${successCount}/${scenarios.length} scenarios passed`);
  
  if (successCount === scenarios.length) {
    console.log('🎉 All company lookup tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please check the implementation.');
  }

  // Show available companies
  console.log('\n📋 Available Companies:');
  const companies = CompanyLookup.getCommonCompanies();
  const companyList = Array.from(companies.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .slice(0, 20); // Show first 20 for brevity
  
  companyList.forEach(([name, ticker]) => {
    console.log(`   ${ticker}: ${name}`);
  });
  
  if (companies.size > 20) {
    console.log(`   ... and ${companies.size - 20} more companies`);
  }
}

// Run the test
testCompanyLookup().catch(error => {
  console.error('❌ Company lookup test failed:', error);
  process.exit(1);
});
