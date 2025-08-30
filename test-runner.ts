#!/usr/bin/env ts-node

/**
 * Test Runner for Phase 2 Optimizations
 * 
 * Usage:
 *   npm run test:mock     - Run comprehensive mock tests (default)
 *   npm run test:api      - Run real API integration tests (use sparingly)
 *   npm run test:all      - Run both mock and API tests
 */

import { runAllMockTests } from './test-phase2-mock';
import { runApiIntegrationTests } from './test-api-integration';

async function runMockTests() {
  console.log('🧪 Running Phase 2 Mock Tests...\n');
  await runAllMockTests();
}

async function runApiTests() {
  console.log('🔗 Running API Integration Tests...\n');
  await runApiIntegrationTests();
}

async function runAllTests() {
  console.log('🚀 Running All Phase 2 Tests...\n');
  
  console.log('=== MOCK TESTS ===');
  await runMockTests();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  console.log('=== API TESTS ===');
  await runApiTests();
  
  console.log('\n🎉 All tests completed!');
}

function showUsage() {
  console.log(`
🧪 Phase 2 Optimization Test Runner

Usage:
  npm run test:mock     - Run comprehensive mock tests (recommended)
  npm run test:api      - Run real API integration tests (use sparingly)
  npm run test:all      - Run both mock and API tests

Examples:
  npx ts-node test-runner.ts mock
  npx ts-node test-runner.ts api
  npx ts-node test-runner.ts all

Note: API tests make real network calls and should be run sparingly to avoid rate limiting.
`);
}

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0]?.toLowerCase();

  switch (testType) {
    case 'mock':
      await runMockTests();
      break;
    case 'api':
      await runApiTests();
      break;
    case 'all':
      await runAllTests();
      break;
    default:
      console.log('No test type specified, running mock tests by default...\n');
      await runMockTests();
      break;
  }
}

// Run the test runner
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
}
