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
        {$_('session_expired_detail')}
      </div>
      <div class="modal-action">
        <a href="/app/login" class="btn btn-ghost capitalize" onclick={dismissToLogin}>
          {$_('login_again')}
        </a>
        <button class="btn btn-primary capitalize" onclick={handleConfirm} data-testid="session-expired-reconnect">
          {$_('connect_wallet')}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button onclick={dismissToLogin}>{$_('close')}</button>
    </form>
  </dialog>
{/if}