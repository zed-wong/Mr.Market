<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { page } from '$app/stores';
  import { registerPasskey } from '$lib/helpers/api/auth';
  import { getActiveNavLocation } from './nav-items';

  interface Props {
    onToggleSidebar: () => void;
  }

  let { onToggleSidebar }: Props = $props();
  let passkeyMessage = $state<string | null>(null);
  let passkeyLoading = $state(false);
  let pathname = $derived($page.url.pathname.replace(/\/+$/, '') || '/');
  let activeLocation = $derived(getActiveNavLocation(pathname));

  const handleRegisterPasskey = async () => {
    if (passkeyLoading) return;
    passkeyLoading = true;
    passkeyMessage = null;
    try {
      await registerPasskey();
      passkeyMessage = $_('admin.passkey_registration_success');
    } catch {
      passkeyMessage = $_('admin.passkey_registration_failed');
    } finally {
      passkeyLoading = false;
    }
  };
</script>

<header class="sticky top-0 z-30 bg-base-100/90 backdrop-blur">
  <div class="flex min-h-15 items-center gap-3 px-5 py-4 md:px-8">
    <button
      type="button"
      class="btn-pill-ghost -ml-3"
      onclick={onToggleSidebar}
      aria-label={$_('toggle_sidebar')}
    >
      <span class="flex flex-col gap-1">
        <span class="block h-px w-5 bg-current"></span>
        <span class="block h-px w-5 bg-current"></span>
      </span>
    </button>

    {#if activeLocation}
      <div class="min-w-0">
        <span class="eyebrow block">
          {$_(activeLocation.group.label)}
        </span>
        <span class="block truncate text-sm font-semibold text-base-content capitalize tracking-tight">
          {activeLocation.child ? $_(activeLocation.child.label) : $_(activeLocation.group.label)}
        </span>
      </div>
    {/if}

    <div class="ml-auto flex items-center gap-2">
      {#if passkeyMessage}
        <span class="text-xs text-base-content/70" role="status" aria-live="polite">
          {passkeyMessage}
        </span>
      {/if}
      <button
        type="button"
        class="btn-pill-outline capitalize"
        disabled={passkeyLoading}
        onclick={handleRegisterPasskey}
      >
        {#if passkeyLoading}
          <span class="loading loading-spinner loading-xs"></span>
        {/if}
        <span>{$_('admin.register_passkey')}</span>
      </button>
    </div>
  </div>
</header>
