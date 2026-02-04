import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Include only files with the .test.ts suffix in the helpers folder
    include: ['src/**/*.test.ts'],
    exclude: ['src/**/*.spec.ts', 'node_modules'],
  },
  resolve: {
    alias: {
      '$lib': path.resolve(__dirname, './src/lib'),
      '$env/dynamic/public': path.resolve(__dirname, './src/lib/__mocks__/env.ts'),
      '$app/environment': path.resolve(__dirname, './src/lib/__mocks__/app-env.ts')
    },
  },
});
