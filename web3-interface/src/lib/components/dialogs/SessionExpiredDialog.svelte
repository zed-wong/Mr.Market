<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { showSessionExpired } from '$lib/stores/auth';

  let { onConfirm }: { onConfirm: () => void } = $props();

  let open = $derived($showSessionExpired);

  const handleConfirm = () => {
    showSessionExpired.set(false);
    onConfirm();
  };
</script>

{#if open}
  <dialog class="modal modal-open">
    <div class="modal-box">
      <span class="text-lg font-bold capitalize">{$_('session_expired_title')}</span>
      <p class="py-4 text-base-content/70">{$_('session_expired_message')}</p>
      <div class="modal-action">
        <button class="btn btn-primary capitalize" onclick={handleConfirm}>
          {$_('login_again')}
        </button>
      </div>
    </div>
    <form method="dialog" class="modal-backdrop">
      <button onclick={handleConfirm}>close</button>
    </form>
  </dialog>
{/if}