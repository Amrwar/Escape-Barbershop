import { defineConfig } from 'vitest/config';
import path from 'path';

/**
 * The by-hand checks in tests/manual, which run against the preview shop on a
 * developer's own machine. They are kept out of the normal suite because the
 * preview is not always up, and a green suite must mean the code is sound
 * rather than that somebody happened to have Docker running.
 *
 *   npm run test:preview
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/manual/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
