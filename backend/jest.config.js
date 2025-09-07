module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/__tests__/test-setup.js'],
  testTimeout: 10000,
  verbose: true,
  collectCoverageFrom: [
    '**/*.js',
    '!node_modules/**',
    '!__tests__/**',
    '!coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Handle database connections properly
  detectOpenHandles: true,
  forceExit: true,
}; 