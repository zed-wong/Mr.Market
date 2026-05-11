<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import { login, loginWithPasskey } from '$lib/helpers/api/auth';
  import {
    correct,
    checked,
    submitted,
    loginLoading,
  } from '$lib/stores/auth';

  type Mode = 'password' | 'passkey';
  type Bar = {
    leftWidth: number;
    rightWidth: number;
    leftAlpha: number;
    rightAlpha: number;
  };

  const BAR_COUNT = 38;
  const TICK_MS = 220;
  const BARS_PER_TICK = 5;

  let mode = $state<Mode>('password');
  let password = $state('');
  let showPassword = $state(false);
  let shakeError = $state(false);
  let errorMessage = $state<string | null>(null);
  let bars = $state<Bar[]>([]);
  let tickHandle = 0;

  const triggerShake = () => {
    shakeError = true;
    setTimeout(() => (shakeError = false), 500);
  };

  const submitPassword = async (event?: SubmitEvent) => {
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
        triggerShake();
      }
    } catch (err) {
      correct.set(false);
      submitted.set(true);
      checked.set(true);
      errorMessage = err instanceof Error ? err.message : 'Login failed';
      triggerShake();
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

  const randomBar = (): Bar => {
    const bias = Math.random();
    return {
      leftWidth: 0.08 + Math.random() * 0.92,
      rightWidth: 0.08 + Math.random() * 0.92,
      leftAlpha: bias > 0.85 ? 0.45 + Math.random() * 0.25 : 0.08 + Math.random() * 0.3,
      rightAlpha: bias < 0.15 ? 0.45 + Math.random() * 0.25 : 0.08 + Math.random() * 0.3,
    };
  };

  const tick = () => {
    const next = bars.slice();
    for (let i = 0; i < BARS_PER_TICK; i += 1) {
      const idx = Math.floor(Math.random() * next.length);
      next[idx] = randomBar();
    }
    bars = next;
    tickHandle = window.setTimeout(tick, TICK_MS);
  };

  onMount(() => {
    bars = Array.from({ length: BAR_COUNT }, randomBar);
    tickHandle = window.setTimeout(tick, TICK_MS);
  });

  onDestroy(() => {
    if (tickHandle) window.clearTimeout(tickHandle);
  });

  const switchMode = (next: Mode) => {
    if (mode === next) return;
    mode = next;
    errorMessage = null;
    submitted.set(false);
    checked.set(false);
  };
</script>

<div class="flex min-h-screen w-full bg-base-100" data-testid="old-admin-login-layout">
  <!-- Left visual panel -->
  <div class="relative hidden overflow-hidden bg-base-200 lg:flex lg:w-1/2">
    <div
      class="absolute inset-0 flex flex-col justify-center gap-2 px-10 py-16"
      data-testid="old-admin-market-depth"
      aria-hidden="true"
    >
      {#each bars as bar, i (i)}
        <div class="flex h-3 items-stretch">
          <div class="flex flex-1 justify-end">
            <div
              class="h-full rounded-l-sm transition-[width,background-color] duration-700 ease-out"
              style="width: {bar.leftWidth * 100}%; background-color: rgba(16, 185, 129, {bar.leftAlpha});"
            ></div>
          </div>
          <div class="flex flex-1 justify-start">
            <div
              class="h-full rounded-r-sm transition-[width,background-color] duration-700 ease-out"
              style="width: {bar.rightWidth * 100}%; background-color: rgba(239, 68, 68, {bar.rightAlpha});"
            ></div>
          </div>
        </div>
      {/each}
    </div>

    <div class="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-base-200 to-transparent"></div>
    <div class="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-base-200 to-transparent"></div>

    <div class="absolute bottom-8 left-8 flex items-center gap-3">
      <img
        src="/mr-market-logo-transparent.svg"
        alt="Mr.Market"
        class="h-12 w-12 drop-shadow-sm"
      />
      <div class="flex flex-col">
        <span class="text-xl font-semibold tracking-tight text-base-content">Mr.Market</span>
        <span class="text-sm text-base-content/50">Market Making Engine</span>
      </div>
    </div>
  </div>

  <!-- Right form panel -->
  <div class="flex w-full flex-col items-center justify-center bg-base-100 px-6 py-12 lg:w-1/2">
    <div class="mb-12 flex items-center gap-3 lg:hidden">
      <img src="/mr-market-logo-transparent.svg" alt="Mr.Market" class="h-10 w-10" />
      <div class="flex flex-col">
        <span class="text-lg font-semibold tracking-tight text-base-content">Mr.Market</span>
        <span class="text-xs text-base-content/50">Market Making Engine</span>
      </div>
    </div>

    <div class="w-full max-w-sm" class:animate-[shake_0.5s_ease-in-out]={shakeError}>
      <div class="mb-8 flex flex-col items-center text-center">
        <div class="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-base-300 bg-base-100 shadow-sm">
          <svg
            class="h-5 w-5 text-base-content"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="4 7 9 12 4 17"></polyline>
            <line x1="12" y1="19" x2="20" y2="19"></line>
          </svg>
        </div>
        <span class="text-3xl font-semibold tracking-tight text-base-content capitalize">
          {$_('admin.welcome_back')}
        </span>
        <span class="mt-2 text-sm leading-relaxed text-base-content/60">
          {$_('admin.enter_credentials')}
        </span>
      </div>

      <!-- Mode toggle -->
      <div
        class="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-base-300 bg-base-200/60 p-1"
        role="tablist"
        aria-label={$_('admin.login_method')}
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'password'}
          class="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
          class:bg-base-content={mode === 'password'}
          class:text-base-100={mode === 'password'}
          class:text-base-content={mode !== 'password'}
          class:opacity-70={mode !== 'password'}
          onclick={() => switchMode('password')}
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="9" cy="9" r="4"></circle>
            <path d="M21 21l-9-9"></path>
            <path d="M17 17l2 2"></path>
            <path d="M14 14l2 2"></path>
          </svg>
          <span>{$_('admin.password')}</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={mode === 'passkey'}
          class="flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium capitalize transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40"
          class:bg-base-content={mode === 'passkey'}
          class:text-base-100={mode === 'passkey'}
          class:text-base-content={mode !== 'passkey'}
          class:opacity-70={mode !== 'passkey'}
          onclick={() => switchMode('passkey')}
        >
          <svg
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 11c-1.7 0-3 1.3-3 3v3"></path>
            <path d="M16 13v3a4 4 0 01-4 4"></path>
            <path d="M5 11a7 7 0 0114 0v2"></path>
            <path d="M8 14v3"></path>
            <path d="M12 17v4"></path>
          </svg>
          <span>{$_('admin.passkey')}</span>
        </button>
      </div>

      {#if mode === 'password'}
        <form class="space-y-5" onsubmit={submitPassword}>
          <div class="form-control">
            <label for="password" class="label py-1.5">
              <span class="label-text text-xs font-semibold tracking-wider text-base-content/60 capitalize">
                {$_('admin.password_label')}
              </span>
            </label>
            <div class="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                name="password"
                id="password"
                bind:value={password}
                placeholder={$_('admin.enter_password_placeholder')}
                aria-label={$_('admin.enter_password')}
                class="input input-bordered h-12 w-full pr-12"
                required
              />
              <button
                type="button"
                class="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-base-content/40 transition-colors duration-150 hover:text-base-content focus:outline-none focus:ring-2 focus:ring-primary/40"
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
            class="btn btn-neutral h-12 w-full gap-2"
            disabled={$loginLoading || !password}
            aria-label={$_('admin.login')}
          >
            {#if $loginLoading}
              <span class="loading loading-spinner loading-sm"></span>
              <span class="text-sm capitalize">{$_('admin.loading')}...</span>
            {:else}
              <span class="text-sm font-medium capitalize">{$_('admin.continue')}</span>
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            {/if}
          </button>
        </form>
      {:else}
        <div class="space-y-5">
          <div class="rounded-xl border border-base-300 bg-base-200/60 px-5 py-6 text-center">
            <div class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-base-300 bg-base-100">
              <svg
                class="h-5 w-5 text-base-content/70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M12 11c-1.7 0-3 1.3-3 3v3"></path>
                <path d="M16 13v3a4 4 0 01-4 4"></path>
                <path d="M5 11a7 7 0 0114 0v2"></path>
                <path d="M8 14v3"></path>
                <path d="M12 17v4"></path>
              </svg>
            </div>
            <span class="block text-sm font-semibold capitalize text-base-content">
              {$_('admin.use_saved_passkey')}
            </span>
            <span class="mt-1 block text-xs leading-relaxed text-base-content/60">
              {$_('admin.passkey_hint')}
            </span>
          </div>

          {#if $submitted && $checked && !$correct}
            <div class="alert alert-error py-2.5" role="alert" aria-live="polite">
              <span class="text-sm">
                {errorMessage ?? $_('admin.password_incorrect')}
              </span>
            </div>
          {/if}

          <button
            type="button"
            class="btn btn-neutral h-12 w-full gap-2"
            disabled={$loginLoading}
            onclick={submitPasskey}
            aria-label={$_('admin.login_with_passkey')}
          >
            {#if $loginLoading}
              <span class="loading loading-spinner loading-sm"></span>
              <span class="text-sm capitalize">{$_('admin.loading')}...</span>
            {:else}
              <span class="text-sm font-medium capitalize">{$_('admin.continue_with_passkey')}</span>
              <svg
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            {/if}
          </button>
        </div>
      {/if}

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
