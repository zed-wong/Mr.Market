<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { login, loginWithPasskey } from '$lib/helpers/api/auth';
  import {
    correct,
    checked,
    submitted,
    loginLoading,
  } from '$lib/stores/auth';

  let password = $state('');
  let showPassword = $state(false);
  let shakeError = $state(false);
  let errorMessage = $state<string | null>(null);

  const submit = async (event?: SubmitEvent) => {
    event?.preventDefault();
    if (!password || $loginLoading) return;
    loginLoading.set(true);
    errorMessage = null;
    try {
      const ok = await login(password);
      submitted.set(true);
      checked.set(true);
      if (ok) {
        correct.set(true);
        goto('/');
      } else {
        correct.set(false);
        shakeError = true;
        setTimeout(() => (shakeError = false), 500);
      }
    } catch (err) {
      correct.set(false);
      errorMessage = err instanceof Error ? err.message : 'Login failed';
      shakeError = true;
      setTimeout(() => (shakeError = false), 500);
    } finally {
      loginLoading.set(false);
    }
  };

  const submitPasskey = async () => {
    if ($loginLoading) return;
    loginLoading.set(true);
    errorMessage = null;
    try {
      const ok = await loginWithPasskey();
      submitted.set(true);
      checked.set(true);
      if (ok) {
        correct.set(true);
        goto('/');
      } else {
        correct.set(false);
      }
    } catch (err) {
      correct.set(false);
      submitted.set(true);
      checked.set(true);
      errorMessage = err instanceof Error ? err.message : 'Passkey login failed';
    } finally {
      loginLoading.set(false);
    }
  };
</script>

<div class="flex min-h-screen w-full">
  <div class="flex w-full flex-col items-center justify-center bg-base-100 px-6 py-12">
    <div class="w-full max-w-sm" class:animate-[shake_0.5s_ease-in-out]={shakeError}>
      <div class="mb-8 flex flex-col">
        <span class="mb-2 text-3xl font-semibold tracking-tight text-base-content capitalize">
          {$_('admin.login')}
        </span>
        <span class="text-sm leading-relaxed text-base-content/60">
          {$_('admin.welcome_to_admin_panel')}
        </span>
      </div>

      <form class="space-y-5" onsubmit={submit}>
        <div class="form-control">
          <label for="password" class="label py-1.5">
            <span class="label-text text-sm font-medium capitalize">
              {$_('admin.enter_password')}
            </span>
          </label>
          <div class="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              name="password"
              id="password"
              bind:value={password}
              class="input input-bordered h-11 w-full pr-11"
              required
            />
            <button
              type="button"
              class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-base-content/40 transition-colors duration-150 hover:text-base-content focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={showPassword ? $_('admin.hide_password') : $_('admin.show_password')}
              onclick={() => (showPassword = !showPassword)}
            >
              <span class="text-xs capitalize">
                {showPassword ? $_('admin.hide') : $_('admin.show')}
              </span>
            </button>
          </div>
        </div>

        {#if $submitted && $checked && !$correct}
          <div class="alert alert-error py-2.5" role="alert" aria-live="polite">
            <span class="text-sm">
              {errorMessage ?? $_('admin.password_incorrect')}
            </span>
          </div>
        {/if}

        <button
          type="submit"
          class="btn btn-primary h-11 w-full gap-2"
          disabled={$loginLoading || !password}
        >
          {#if $loginLoading}
            <span class="loading loading-spinner loading-sm"></span>
            <span class="text-sm capitalize">{$_('admin.loading')}...</span>
          {:else}
            <span class="text-sm font-medium capitalize">{$_('admin.login')}</span>
          {/if}
        </button>
      </form>

      <div class="divider text-xs text-base-content/50">{$_('admin.or')}</div>

      <button
        type="button"
        class="btn btn-ghost h-11 w-full gap-2 border border-base-300"
        disabled={$loginLoading}
        onclick={submitPasskey}
      >
        <span class="text-sm font-medium capitalize">{$_('admin.login_with_passkey')}</span>
      </button>

      <div class="mt-8 border-t border-base-300 pt-6">
        <span class="block text-center text-xs text-base-content/40">
          {$_('admin.login_footer')}
        </span>
      </div>
    </div>
  </div>
</div>

<style>
  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    10%,
    30%,
    50%,
    70%,
    90% {
      transform: translateX(-4px);
    }
    20%,
    40%,
    60%,
    80% {
      transform: translateX(4px);
    }
  }
</style>
