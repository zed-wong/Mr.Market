<script lang="ts">
  import { openMobileNav } from '$lib/stores/ui';
  import ThemeToggle from './ThemeToggle.svelte';
  import ConnectButton from './ConnectButton.svelte';
  import DemoWalletControls from './DemoWalletControls.svelte';
</script>

<header class="flex flex-wrap items-start justify-between gap-3 pb-6" data-testid="top-controls">
  <button
    class="btn-pill-ghost md:hidden -ml-3 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-base-100"
    onclick={openMobileNav}
    aria-label="Open navigation"
    data-testid="open-mobile-nav"
  >
    <span class="flex flex-col gap-1">
      <span class="block h-px w-5 bg-current"></span>
      <span class="block h-px w-5 bg-current"></span>
    </span>
  </button>

  <span class="hidden md:block"></span>

  <div class="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
    <DemoWalletControls />
    <ThemeToggle />
    <ConnectButton />
  </div>
</header>
