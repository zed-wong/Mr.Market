<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { showSessionExpired } from '$lib/stores/auth';

  interface Props {
    onConfirm: () => void;
  }

  let { onConfirm }: Props = $props();
  let dialogEl: HTMLDialogElement | null = $state(null);

  $effect(() => {
    if ($showSessionExpired && dialogEl && !dialogEl.open) {
      dialogEl.showModal();
    }
  });

  const dismiss = () => {
    dialogEl?.close();
    showSessionExpired.set(false);
  };

  const confirm = () => {
    dialogEl?.close();
    showSessionExpired.set(false);
    onConfirm();
  };
</script>

<dialog bind:this={dialogEl} class="modal modal-bottom sm:modal-middle">
  <div class="modal-box rounded-2xl p-8">
    <span class="text-xl font-bold text-base-content capitalize">
      {$_('admin.session_expired_title')}
    </span>
    <span class="block pt-3 pb-6 text-sm leading-relaxed text-base-content/60">
      {$_('admin.session_expired_message')}
    </span>
    <div class="flex items-center justify-end gap-3">
      <button type="button" class="btn btn-ghost text-primary font-semibold capitalize" onclick={dismiss}>
        {$_('admin.cancel')}
      </button>
      <button type="button" class="btn btn-primary rounded-xl px-8 capitalize" onclick={confirm}>
        {$_('admin.login_again')}
      </button>
    </div>
  </div>
</dialog>
