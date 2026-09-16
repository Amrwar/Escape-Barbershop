import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * Two suites:
 *   unit        — the rules as plain functions, no database, milliseconds
 *   integration — the API against a real Postgres, started by tests/db.ts
 *
 * `npm test` runs the unit suite. `npm run test:all` runs both, and needs Docker.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // One database, one shop: integration tests share a schema, so they must not
    // run over each other.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
});
