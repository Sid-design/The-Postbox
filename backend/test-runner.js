#!/usr/bin/env node
/**
 * PostgreSQL API Test Runner
 * Runs comprehensive tests for the Newsletter Reader backend
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 PostgreSQL API Test Runner');
console.log('==============================\n');

// Check if we're in the right directory
if (!require('fs').existsSync('package.json')) {
  console.error('❌ Error: Run this script from the backend directory');
  process.exit(1);
}

// Check for required environment variables
const requiredEnvVars = ['JWT_SECRET', 'DATABASE_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.log('⚠️  Warning: Missing environment variables:');
  missingVars.forEach(varName => console.log(`   - ${varName}`));
  console.log('📝 Tests will use default test values\n');
}

// Run the tests
console.log('🚀 Running PostgreSQL API Tests...\n');

const jest = spawn('npx', ['jest', '--verbose', '--coverage'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'test',
    JWT_SECRET: process.env.JWT_SECRET || 'test-jwt-secret-key',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://postgres:devpassword@localhost:5432/newsletter_reader_test'
  }
});

jest.on('close', (code) => {
  console.log(`\n${'='.repeat(50)}`);
  if (code === 0) {
    console.log('✅ All tests passed successfully!');
    console.log('📊 Check coverage report in: backend/coverage/');
  } else {
    console.log('❌ Some tests failed. Check the output above for details.');
  }
  console.log(`${'='.repeat(50)}\n`);
  process.exit(code);
});

jest.on('error', (error) => {
  console.error('❌ Error running tests:', error.message);
  process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n🛑 Test runner interrupted by user');
  jest.kill('SIGINT');
});


