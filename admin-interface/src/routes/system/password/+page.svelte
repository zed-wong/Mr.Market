<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';

  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import { updateAdminPassword } from '$lib/helpers/api/auth';

  let password = $state('');
  let confirmPassword = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);

  const canSave = $derived(password.length >= 8 && password === confirmPassword && !saving);

  async function savePassword() {
    if (!canSave) return;

    saving = true;
    error = null;
    try {
      await updateAdminPassword(password);
      password = '';
      confirmPassword = '';
      toast.success($_('admin.password_update_success'));
    } catch (err) {
      error = err instanceof Error ? err.message : $_('admin.password_update_failed');
      toast.error($_('admin.password_update_failed'));
    } finally {
      saving = false;
    }
  }
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title={$_('admin.nav.password')}
    subtitle={$_('admin.password_subtitle')}
  />

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <form class="card-body max-w-2xl gap-5 p-5" onsubmit={(event) => { event.preventDefault(); void savePassword(); }}>
      {#if error}
        <div class="rounded-lg border border-error/30 p-3">
          <span class="text-sm text-error">{error}</span>
        </div>
      {/if}

      <label class="form-control gap-2">
        <span class="label-text capitalize">{$_('admin.password_new_label')}</span>
        <input
          class="input input-bordered border-base-300 bg-base-100"
          type="password"
          minlength="8"
          autocomplete="new-password"
          bind:value={password}
          required
        />
      </label>

      <label class="form-control gap-2">
        <span class="label-text capitalize">{$_('admin.password_confirm_label')}</span>
        <input
          class="input input-bordered border-base-300 bg-base-100"
          type="password"
          minlength="8"
          autocomplete="new-password"
          bind:value={confirmPassword}
          required
        />
      </label>

      <div class="flex flex-col gap-2">
        {#if password && password.length < 8}
          <span class="text-xs text-warning">{$_('admin.password_min_length')}</span>
        {/if}
        {#if confirmPassword && password !== confirmPassword}
          <span class="text-xs text-warning">{$_('admin.password_mismatch')}</span>
        {/if}
      </div>

      <div>
        <button type="submit" class="btn btn-primary rounded-full capitalize" disabled={!canSave}>
          {#if saving}
            <span class="loading loading-spinner loading-xs"></span>
          {/if}
          <span>{$_('admin.password_save')}</span>
        </button>
      </div>
    </form>
  </div>
</section>
