// vitest.config.integration.ts
// Extended Vitest configuration with all test suites

import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Test file patterns
    include: [
      'src/server/**/__tests__/**/*.test.ts',
      'src/server/**/__tests__/**/*.test.tsx',
      'src/server/**/__tests__/**/*.spec.ts',
      'src/shared/**/__tests__/**/*.test.ts',
    ],

    // Exclude patterns
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache',
    ],

    // Global setup/teardown
    setupFiles: ['./src/server/__tests__/setup.ts'],

    // Coverage options
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/server/__tests__/',
      ],
      all: true,
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },

    // Globals
    globals: false,

    // Test timeout
    testTimeout: 30000,

    // Hook timeout
    hookTimeout: 30000,

    // Silent output
    silent: false,

    // Reporters
    reporters: ['verbose'],

    // Environment variables
    env: {
      NODE_ENV: 'test',
      GEMINI_API_KEY: 'test-key-for-unit-tests',
    },

    // Use default pool settings

    // Bail on first failure
    bail: 0, // 0 = continue, 1 = stop on first failure

    // Retry failed tests
    retry: 0,

    // Snapshot handling
    snapshotFormat: {
      printBasicPrototype: true,
    },
  },

  // Define entry point for tests
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});