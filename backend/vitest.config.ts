import { defineConfig } from 'vitest/config';

/**
 * Integration tests must never use the application database. The setup file
 * selects a dedicated local test database before any test module is loaded.
 */
export default defineConfig({
  test: {
    setupFiles: ['./src/tests/setup/environment.ts'],
    // The integration suites share a local MongoDB database; run files in
    // sequence so test fixtures cannot race each other.
    fileParallelism: false,
  },
});
