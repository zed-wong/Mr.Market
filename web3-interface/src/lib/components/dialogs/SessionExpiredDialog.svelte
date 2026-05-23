<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { showSessionExpired } from '$lib/stores/auth';

  let { onConfirm }: { onConfirm: () => void } = $props();

  let open = $derived($showSessionExpired);

  const handleConfirm = () => {
    showSessionExpired.set(false);
    onConfirm();
  };

  const dismissToLogin = () => {
    showSessionExpired.set(false);
  };
</script>

{#if open}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <span class="text-lg font-bold capitalize">{$_('session_expired_title')}</span>
      <p class="py-4 text-base-content/70">{$_('session_expired_message')}</p>
      <div class="rounded-2xl border border-base-300 px-4 py-3 text-sm text-base-content/60">
        Demo balances, funding, and campaign activity stay in local browser state. Reconnect a supported wallet to continue without any backend session call.
      </div>
      <div class="modal-action">
        <a href="/login" class="btn btn-ghost capitalize" onclick={dismissToLogin}>
          Return to login
        </a>
        <button class="btn btn-primary capitalize" onclick={handleConfirm} data-testid="session-expired-reconnect">
          Reconnect wallet
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button onclick={dismissToLogin}>close</button>
    </form>
  </dialog>
{/if}