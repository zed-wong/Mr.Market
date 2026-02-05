import { createLogger, defineConfig, type Plugin } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const browserOnlyPolyfills = nodePolyfills({
  globals: {
    Buffer: true,
    global: true,
    process: true,
  },
}) as Plugin;

browserOnlyPolyfills.apply = (config) => {
  // Skip the polyfill aliasing for SSR builds so Node keeps its native modules.
  if (config?.build?.ssr) {
    return false;
  }

  return true;
};

export default defineConfig({
  customLogger: (() => {
    const logger = createLogger();
    const originalWarn = logger.warn;

    logger.warn = (message, options) => {
      if (typeof message === "string") {
        const normalized = message.toLowerCase();
        const isMissingExports = normalized.includes(
          "missing exports condition for svelte",
        );
        const mentionsCarousel = normalized.includes("svelte-carousel");

        if (isMissingExports && mentionsCarousel) {
          return;
        }
      }

      originalWarn(message, options);
    };

    return logger;
  })(),
  plugins: [sveltekit(), browserOnlyPolyfills],
  server: {
    allowedHosts: [''],
    host: "0.0.0.0"
  },
});
