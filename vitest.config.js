import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    exclude: ['test/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
