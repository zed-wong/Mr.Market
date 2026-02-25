import adapterAuto from '@sveltejs/adapter-auto';
import adapterNode from '@sveltejs/adapter-node';
import adapterStatic from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * @returns {import('@sveltejs/kit').Adapter}
 */
function getAdapter() {
  if (process.env.ADAPTER === 'node') {
    return adapterNode();
  } else if (process.env.ADAPTER === 'static' || process.env.RENDER) {
    return adapterStatic({
      pages: 'build',
      assets: 'build',
      fallback: 'app.html',
      precompress: false,
      strict: true
    });
  }

  return adapterAuto();
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),
  vitePlugin: {
    experimental: {
      disableSvelteResolveWarnings: true
    }
  },

  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: getAdapter()
  }
};

export default config;
