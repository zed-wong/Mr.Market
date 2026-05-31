import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
  .replaceAll('\\', '/')
  .replace(/\/$/, '');

function ignoreDevWatcherPath(filePath: string) {
  const normalized = filePath.replaceAll('\\', '/');

  if (!normalized.startsWith(`${projectRoot}/`)) {
    return false;
  }

  const topLevelPath = normalized
    .slice(projectRoot.length + 1)
    .split('/')[0];

  return topLevelPath !== 'src' && topLevelPath !== 'static';
}

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', '.svelte-kit/**', 'build/**'],
  },
  server: {
    host: '0.0.0.0',
    watch: {
      ignored: ignoreDevWatcherPath,
    },
  },
});
