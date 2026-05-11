<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
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
  let canvas = $state<HTMLCanvasElement>();
  let animationFrame = 0;
  let bids: { price: number; size: number }[] = [];
  let asks: { price: number; size: number }[] = [];

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

  const generateDepthData = () => {
    const basePrice = 67432.5;
    bids = [];
    asks = [];

    let bidPrice = basePrice;
    let askPrice = basePrice;
    for (let i = 0; i < 20; i += 1) {
      bidPrice -= Math.random() * 50 + 10;
      askPrice += Math.random() * 50 + 10;
      bids.push({ price: bidPrice, size: Math.random() * 2 + 0.1 });
      asks.push({ price: askPrice, size: Math.random() * 2 + 0.1 });
    }
  };

  const drawDepth = () => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const sideWidth = rect.width / 2;
    const centerY = rect.height / 2;
    const rowHeight = rect.height / 40;
    const maxSize = 2.5;

    bids.forEach((bid, i) => {
      const barWidth = (bid.size / maxSize) * (sideWidth * 0.9);
      const topY = centerY - (i + 1) * rowHeight;
      const bottomY = centerY + i * rowHeight;
      ctx.fillStyle = bid.size > 1.5 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.08)';
      ctx.fillRect(sideWidth - barWidth, topY, barWidth, rowHeight - 1);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.06)';
      ctx.fillRect(sideWidth - barWidth, bottomY, barWidth, rowHeight - 1);
    });

    asks.forEach((ask, i) => {
      const barWidth = (ask.size / maxSize) * (sideWidth * 0.9);
      const topY = centerY - (i + 1) * rowHeight;
      const bottomY = centerY + i * rowHeight;
      ctx.fillStyle = ask.size > 1.5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(239, 68, 68, 0.08)';
      ctx.fillRect(sideWidth, topY, barWidth, rowHeight - 1);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.06)';
      ctx.fillRect(sideWidth, bottomY, barWidth, rowHeight - 1);
    });

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.beginPath();
    ctx.moveTo(sideWidth, 0);
    ctx.lineTo(sideWidth, rect.height);
    ctx.stroke();
  };

  const animateDepth = () => {
    [...bids, ...asks].forEach((level) => {
      level.size = Math.max(0.01, level.size + (Math.random() - 0.5) * 0.08);
    });
    drawDepth();
    animationFrame = window.setTimeout(animateDepth, 140);
  };

  onMount(() => {
    generateDepthData();
    animateDepth();
    return () => window.clearTimeout(animationFrame);
  });
</script>

<div class="flex min-h-screen w-full" data-testid="old-admin-login-layout">
  <div class="relative hidden overflow-hidden bg-base-200 lg:flex lg:w-1/2">
    <canvas
      bind:this={canvas}
      class="absolute inset-0 h-full w-full"
      data-testid="old-admin-market-depth"
    ></canvas>
    <div class="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-base-200 via-base-200/70 to-transparent"></div>
    <div class="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-base-200 via-base-200/70 to-transparent"></div>
    <div class="absolute inset-x-0 top-0 h-1/5 bg-gradient-to-b from-base-200 via-base-200/70 to-transparent"></div>
    <div class="absolute inset-x-0 bottom-0 h-1/5 bg-gradient-to-t from-base-200 via-base-200/70 to-transparent"></div>

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

  <div class="flex w-full flex-col items-center justify-center bg-base-100 px-6 py-12 lg:w-1/2">
    <div class="mb-12 flex items-center gap-3 lg:hidden">
      <img src="/mr-market-logo-transparent.svg" alt="Mr.Market" class="h-10 w-10" />
      <div class="flex flex-col">
        <span class="text-lg font-semibold tracking-tight text-base-content">Mr.Market</span>
        <span class="text-xs text-base-content/50">Market Making Engine</span>
      </div>
    </div>

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
