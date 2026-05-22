<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import { initi18n } from '../i18n/i18n';
  import { darkTheme } from '$lib/stores/theme';
  import { toWeb3Theme } from '$lib/theme/themes';
  import TopBar from '$lib/components/topBar/TopBar.svelte';
  import BottomNav from '$lib/components/bottomNav/BottomNav.svelte';

  let { children } = $props();

  let i18nReady = $state(false);
  let web3Theme = $derived(toWeb3Theme($darkTheme));

  $effect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', web3Theme);
    }
  });

  onMount(() => {
    void (async () => {
      await initi18n();
      i18nReady = true;
    })();
  });
</script>

{#if !i18nReady}
  <div class="flex min-h-screen items-center justify-center bg-base-100 text-base-content">
    <span class="loading loading-spinner loading-md"></span>
  </div>
{:else}
  <main class="min-h-screen bg-base-200 text-base-content">
    <BottomNav />
    <div class="lg:pl-72">
      <TopBar />
      <div class="mx-auto max-w-7xl px-4 py-6 lg:px-8">
        {@render children?.()}
      </div>
    </div>
  </main>
{/if}