<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { tick } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { getNonce, login } from '$lib/helpers/api/auth';
  import { buildSiweMessage } from '$lib/helpers/siwe/siwe';
  import { isAuthed, loginLoading } from '$lib/stores/auth';
  import {
    canUseValidationWallet,
    connectValidationWallet,
    openNetworkModal,
    openWalletModal,
    signWalletMessage,
    walletAddress,
    walletChainId,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  let authError = $state<string | null>(null);

  const nextPath = () => {
    const next = page.url.searchParams.get('next');
    if (!next || !next.startsWith('/app') || next.startsWith('//') || next === '/app/login') {
      return '/app';
    }
    return next;
  };

  const signIn = async () => {
    authError = null;

    if (!$walletIsUnsupported && !$walletIsConnected) {
      await openWalletModal();
      return;
    }
    if ($walletIsUnsupported) {
      await openNetworkModal();
      return;
    }
    if (!$walletAddress) {
      authError = $_('login_error_no_wallet');
      return;
    }

    loginLoading.set(true);
    try {
      const chainId = String($walletChainId ?? '0');
      const nonce = await getNonce($walletAddress, chainId);
      const message = buildSiweMessage(
        nonce.nonce,
        $walletAddress,
        Number(chainId) || 0,
        nonce.domain,
        nonce.uri,
        nonce.statement
      );
      const signature = await signWalletMessage(message);
      await login(message, signature);
      await goto(nextPath());
    } catch (error) {
      authError = error instanceof Error && error.message ? error.message : $_('login_error_generic');
    } finally {
      loginLoading.set(false);
    }
  };

  const signInWithValidationWallet = async () => {
    authError = null;
    try {
      await connectValidationWallet();
      await tick();
      await signIn();
    } catch (error) {
      authError = error instanceof Error && error.message ? error.message : $_('login_error_generic');
    }
  };
</script>

<section class="flex min-h-[70vh] flex-col justify-center" data-testid="web3-login">
  <div class="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
    <div class="max-w-xl">
      <span class="font-display text-5xl md:text-6xl tracking-tight text-base-content">{$_('login_title')}</span>
      <span class="mt-4 block text-base-content/60">
        {$_('login_subtitle')}
      </span>

      <div class="mt-10 flex flex-wrap items-center gap-3">
        <button class="btn-pill-primary" onclick={openWalletModal} data-testid="login-connect-wallet">{$_('connect_wallet')}</button>
        <button
          class="btn-pill-ghost"
          onclick={signIn}
          disabled={$loginLoading}
          data-testid="login-sign-message"
        >
          {$loginLoading ? $_('signing') : $_('sign_in_button')}
        </button>
        {#if canUseValidationWallet()}
          <button
            class="btn-pill-ghost"
            onclick={signInWithValidationWallet}
            disabled={$loginLoading}
            data-testid="login-validation-wallet"
          >
            {$_('login_validation_wallet')}
          </button>
        {/if}
      </div>

      {#if authError}
        <div class="mt-5 rounded-2xl border border-error/40 px-4 py-3 text-sm text-error" data-testid="login-auth-error">
          {authError}
        </div>
      {/if}
    </div>

    <div class="card-surface p-6" data-testid="login-session-card">
      <span class="eyebrow">{$_('login_session_state')}</span>
      {#if $isAuthed}
        <span class="mt-3 block text-lg font-semibold text-base-content">{$_('login_authenticated')}</span>
        <span class="mt-2 block text-sm text-base-content/60">
          {$_('login_authenticated_hint')}
        </span>
        <a href={nextPath()} class="btn-pill-primary mt-5 inline-flex" data-testid="login-open-dashboard">{$_('login_open_dashboard')} →</a>
      {:else if $walletIsConnected}
        <span class="mt-3 block text-lg font-semibold text-base-content">{$_('login_wallet_connected')}</span>
        <span class="mt-2 block text-sm text-base-content/60">
          {$walletNamespaceLabel} · {$walletNetwork ?? 'supported network'} · <span class="font-mono-num">{$walletShortAddress}</span>
        </span>
        <button class="btn-pill-primary mt-5" onclick={signIn} disabled={$loginLoading} data-testid="login-sign-message-card">
          {$loginLoading ? $_('signing') : $_('sign_in_button')}
        </button>
      {:else if $walletIsUnsupported}
        <span class="mt-3 block text-lg font-semibold text-base-content">{$_('login_wrong_network_title')}</span>
        <span class="mt-2 block text-sm text-base-content/60">
          {$_('login_wrong_network_message')}
        </span>
        <button class="btn-pill-primary mt-5" onclick={openNetworkModal} data-testid="login-switch-network">{$_('switch_network')}</button>
      {:else}
        <span class="mt-3 block text-lg font-semibold text-base-content">{$_('login_ready_title')}</span>
        <span class="mt-2 block text-sm text-base-content/60">
          {$_('login_ready_message')}
        </span>
      {/if}
    </div>
  </div>
</section>
