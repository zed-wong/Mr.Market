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

  let mode = $state<Mode>('password');
  let password = $state('');
  let showPassword = $state(false);
  let shakeError = $state(false);
  let errorMessage = $state<string | null>(null);

  // Market depth visualization state
  let canvas = $state<HTMLCanvasElement | undefined>();
  let ctx: CanvasRenderingContext2D | null = null;
  let animationId = 0;
  let bids: { price: number; size: number }[] = [];
  let asks: { price: number; size: number }[] = [];

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

  // Generate synthetic market depth data
  const generateDepthData = () => {
    const basePrice = 67432.5;
    bids = [];
    asks = [];

    let bidPrice = basePrice;
    for (let i = 0; i < 20; i += 1) {
      bidPrice -= Math.random() * 50 + 10;
      bids.push({ price: bidPrice, size: Math.random() * 2 + 0.1 });
    }

    let askPrice = basePrice;
    for (let i = 0; i < 20; i += 1) {
      askPrice += Math.random() * 50 + 10;
      asks.push({ price: askPrice, size: Math.random() * 2 + 0.1 });
    }
  };

  // Update a single level (simulate live order book)
  const updateLevel = () => {
    const isBid = Math.random() > 0.5;
    const arr = isBid ? bids : asks;
    const idx = Math.floor(Math.random() * arr.length);
    if (arr[idx]) {
      arr[idx].size = Math.max(
        0.01,
        arr[idx].size + (Math.random() - 0.5) * 0.5,
      );
    }
  };

  // Draw the market depth visualization
  const drawDepth = () => {
    if (!ctx || !canvas) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerY = height / 2;
    const rowHeight = height / 40;
    const maxSize = 2.5;
    const sideWidth = width / 2;

    // Draw bids (left side, green)
    bids.forEach((bid, i) => {
      const y = centerY - (i + 1) * rowHeight;
      const barWidth = (bid.size / maxSize) * (sideWidth * 0.9);

      ctx!.fillStyle = 'rgba(16, 185, 129, 0.08)';
      ctx!.fillRect(sideWidth - barWidth, y, barWidth, rowHeight - 1);

      if (bid.size > 1.5) {
        ctx!.fillStyle = 'rgba(16, 185, 129, 0.15)';
        ctx!.fillRect(sideWidth - barWidth, y, barWidth, rowHeight - 1);
      }
    });

    // Draw asks (right side, red)
    asks.forEach((ask, i) => {
      const y = centerY - (i + 1) * rowHeight;
      const barWidth = (ask.size / maxSize) * (sideWidth * 0.9);

      ctx!.fillStyle = 'rgba(239, 68, 68, 0.08)';
      ctx!.fillRect(sideWidth, y, barWidth, rowHeight - 1);

      if (ask.size > 1.5) {
        ctx!.fillStyle = 'rgba(239, 68, 68, 0.15)';
        ctx!.fillRect(sideWidth, y, barWidth, rowHeight - 1);
      }
    });

    // Draw mirror below center
    bids.forEach((bid, i) => {
      const y = centerY + i * rowHeight;
      const barWidth = (bid.size / maxSize) * (sideWidth * 0.9);

      ctx!.fillStyle = 'rgba(16, 185, 129, 0.06)';
      ctx!.fillRect(sideWidth - barWidth, y, barWidth, rowHeight - 1);
    });

    asks.forEach((ask, i) => {
      const y = centerY + i * rowHeight;
      const barWidth = (ask.size / maxSize) * (sideWidth * 0.9);

      ctx!.fillStyle = 'rgba(239, 68, 68, 0.06)';
      ctx!.fillRect(sideWidth, y, barWidth, rowHeight - 1);
    });

    // Draw center spread line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sideWidth, 0);
    ctx.lineTo(sideWidth, height);
    ctx.stroke();
  };

  const animate = () => {
    updateLevel();
    drawDepth();
    animationId = requestAnimationFrame(() => {
      window.setTimeout(animate, 100);
    });
  };

  const setupCanvas = () => {
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    generateDepthData();
    drawDepth();
    animate();
  };

  onMount(() => {
    setupCanvas();
  });

  onDestroy(() => {
    if (animationId) cancelAnimationFrame(animationId);
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
  <!-- Left side: Market depth visualization -->
  <div class="relative hidden overflow-hidden bg-base-200 lg:flex lg:w-1/2">
    <canvas
      bind:this={canvas}
      class="absolute inset-0 h-full w-full"
      style="width: 100%; height: 100%;"
      data-testid="old-admin-market-depth"
      aria-hidden="true"
    ></canvas>

    <!-- Overlay gradient for depth fade -->
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-r from-base-200 via-transparent to-transparent"
      style="width: 30%;"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-l from-base-200 via-transparent to-transparent"
      style="left: 70%;"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-b from-base-200 via-transparent to-base-200"
      style="height: 15%; top: 0;"
    ></div>
    <div
      class="pointer-events-none absolute inset-0 bg-gradient-to-t from-base-200 via-transparent to-transparent"
      style="height: 15%; bottom: 0;"
    ></div>

    <div class="absolute bottom-8 left-8 flex items-center gap-3">
      <img
        src="/mr-market-logo-transparent.svg"
        alt="Mr.Market"
        class="h-12 w-12 drop-shadow-sm"
      />
      <div class="flex flex-col">
        <span class="text-xl font-semibold tracking-tight text-base-content">Mr.Market</span>
        <span class="text-sm text-base-content/50">{$_('market_making_engine')}</span>
      </div>
    </div>
  </div>

  <!-- Right form panel -->
  <div class="relative flex w-full flex-col items-center justify-center bg-base-100 px-6 py-12 lg:w-1/2">
    <div class="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-3 whitespace-nowrap lg:hidden">
      <img src="/mr-market-logo-transparent.svg" alt="Mr.Market" class="h-10 w-10" />
      <div class="flex flex-col">
        <span class="text-lg font-semibold tracking-tight text-base-content">Mr.Market</span>
        <span class="text-xs text-base-content/50">{$_('market_making_engine')}</span>
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
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1.000.43-1.563A6 6 0 1 1 21.75 8.25Z" />
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
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33" />
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
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 text-base-content/70"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M7.864 4.243A7.5 7.5 0 0 1 19.5 10.5c0 2.92-.556 5.709-1.568 8.268M5.742 6.364A7.465 7.465 0 0 0 4.5 10.5a7.464 7.464 0 0 1-1.15 3.993m1.989 3.559A11.209 11.209 0 0 0 8.25 10.5a3.75 3.75 0 1 1 7.5 0c0 .527-.021 1.049-.064 1.565M12 10.5a14.94 14.94 0 0 1-3.6 9.75m6.633-4.596a18.666 18.666 0 0 1-2.485 5.33" />
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
