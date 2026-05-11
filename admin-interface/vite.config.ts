import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.svelte-kit/**', 'build/**'],
  },
  server: {
    host: '0.0.0.0',
  },
});
