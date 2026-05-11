<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { registerPasskey } from '$lib/helpers/api/auth';
  import { darkTheme, toggleDarkTheme } from '$lib/stores/theme';

  interface Props {
    onToggleSidebar: () => void;
  }

  let { onToggleSidebar }: Props = $props();
  let passkeyMessage = $state<string | null>(null);
  let passkeyLoading = $state(false);

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

<header class="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur">
  <div class="flex items-center gap-3 px-3 py-3 sm:px-4 md:px-6">
    <button
      type="button"
      class="btn btn-ghost btn-sm"
      onclick={onToggleSidebar}
      aria-label="toggle sidebar"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="h-5 w-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M3.75 6.75h16.5m-16.5 5.25h16.5m-16.5 5.25h16.5"
        />
      </svg>
    </button>

    <div class="ml-auto flex items-center gap-2">
      <button
        type="button"
        class="btn btn-ghost btn-sm capitalize"
        disabled={passkeyLoading}
        onclick={handleRegisterPasskey}
      >
        {#if passkeyLoading}
          <span class="loading loading-spinner loading-xs"></span>
        {/if}
        <span>{$_('admin.register_passkey')}</span>
      </button>
      {#if passkeyMessage}
        <span class="text-xs text-base-content/70" role="status" aria-live="polite">
          {passkeyMessage}
        </span>
      {/if}
      <button
        type="button"
        class="btn btn-ghost btn-sm capitalize"
        onclick={toggleDarkTheme}
        aria-label="toggle theme"
      >
        {$darkTheme ? $_('admin.theme_light') : $_('admin.theme_dark')}
      </button>
    </div>
  </div>
</header>
