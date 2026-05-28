<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';

  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import { updateAdminPassword } from '$lib/helpers/api/auth';

  let password = $state('');
  let confirmPassword = $state('');
  let saving = $state(false);
  let error = $state<string | null>(null);
  let showPassword = $state(false);
  let showConfirm = $state(false);

  const passwordsMatch = $derived(password.length > 0 && password === confirmPassword);
  const canSave = $derived(passwordsMatch && !saving);

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

  <div class="grid gap-6 lg:grid-cols-3">
    <!-- Form card -->
    <div class="card border border-base-300 bg-base-100 shadow-none lg:col-span-2">
      <form
        class="card-body gap-6 p-6"
        onsubmit={(event) => {
          event.preventDefault();
          void savePassword();
        }}
      >
        {#if error}
          <div class="flex items-start gap-3 rounded-lg border border-error/30 bg-error/5 p-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="mt-0.5 h-4 w-4 shrink-0 text-error" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v4a1 1 0 102 0V7zm-1 7a1 1 0 100 2 1 1 0 000-2z" clip-rule="evenodd" />
            </svg>
            <span class="text-sm text-error">{error}</span>
          </div>
        {/if}

        <!-- New password -->
        <label class="form-control gap-2">
          <span class="label-text capitalize text-base-content/70">{$_('admin.password_new_label')}</span>
          <div class="relative">
            <input
              class="input input-bordered w-full border-base-300 bg-base-100 pr-12 font-mono"
              type={showPassword ? 'text' : 'password'}
              autocomplete="new-password"
              bind:value={password}
              required
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center px-3 text-base-content/50 hover:text-base-content"
              onclick={() => (showPassword = !showPassword)}
              aria-label={showPassword ? $_('admin.hide_password') : $_('admin.show_password')}
            >
              {#if showPassword}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              {/if}
            </button>
          </div>
        </label>

        <!-- Confirm password -->
        <label class="form-control gap-2">
          <span class="label-text capitalize text-base-content/70">{$_('admin.password_confirm_label')}</span>
          <div class="relative">
            <input
              class="input input-bordered w-full border-base-300 bg-base-100 pr-12 font-mono"
              type={showConfirm ? 'text' : 'password'}
              autocomplete="new-password"
              bind:value={confirmPassword}
              required
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 flex items-center px-3 text-base-content/50 hover:text-base-content"
              onclick={() => (showConfirm = !showConfirm)}
              aria-label={showConfirm ? $_('admin.hide_password') : $_('admin.show_password')}
            >
              {#if showConfirm}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              {:else}
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              {/if}
            </button>
          </div>
          {#if confirmPassword && password !== confirmPassword}
            <span class="text-xs text-warning">{$_('admin.password_mismatch')}</span>
          {/if}
        </label>

        <div class="flex justify-end pt-2">
          <button type="submit" class="btn btn-primary rounded-full capitalize" disabled={!canSave}>
            {#if saving}
              <span class="loading loading-spinner loading-xs"></span>
            {/if}
            <span>{$_('admin.password_save')}</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Tips sidebar -->
    <aside class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-4 p-6">
        <div class="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-base-content/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span class="text-sm font-medium capitalize">{$_('admin.password_tips_title')}</span>
        </div>
        <ul class="flex flex-col gap-3 text-xs text-base-content/70">
          {#each ['password_tip_long', 'password_tip_unique', 'password_tip_manager', 'password_tip_session'] as tip (tip)}
            <li class="flex items-start gap-2">
              <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-base-content/40"></span>
              <span>{$_('admin.' + tip)}</span>
            </li>
          {/each}
        </ul>
      </div>
    </aside>
  </div>
</section>
