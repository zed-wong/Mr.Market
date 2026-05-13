<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { loginLoading } from '$lib/stores/auth';
  import { walletIsConnected, walletAddress, walletChainId, walletShortAddress } from '$lib/stores/wallet';
  import { signInWithEthereum } from '$lib/helpers/siwe/siwe';
  import { initAppKit } from '$lib/helpers/wallet/appkit';
  import { getChainById } from '$lib/helpers/utils';

  let error = $state<string | null>(null);

  const handleConnectAndSignIn = async () => {
    try {
      error = null;
      if (!$walletIsConnected) {
        const appKit = initAppKit();
        if (appKit) {
          appKit.open();
        }
        return;
      }
      $loginLoading = true;
      await signInWithEthereum();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Sign-in failed';
    } finally {
      $loginLoading = false;
    }
  };

  let chainInfo = $derived($walletChainId ? getChainById($walletChainId) : null);
</script>

<section class="flex min-h-screen items-center justify-center bg-base-200 px-4">
  <div class="card w-full max-w-md bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-4">
      <div class="text-center">
        <span class="text-2xl font-bold text-base-content capitalize">{$_('app_name')}</span>
        <p class="mt-2 text-base-content/70">{$_('sign_in_message')}</p>
      </div>

      {#if error}
        <div class="alert alert-error">
          <span class="text-sm">{error}</span>
        </div>
      {/if}

      {#if $walletIsConnected}
        <div class="text-center">
          <span class="badge badge-outline capitalize">{$_('connect_wallet')}:</span>
          <span class="ml-1 text-sm text-base-content/70">{$walletShortAddress}</span>
          {#if chainInfo}
            <span class="ml-1 badge badge-ghost badge-sm">{chainInfo.name}</span>
          {/if}
        </div>

        <button
          class="btn btn-primary w-full capitalize"
          onclick={handleConnectAndSignIn}
          disabled={$loginLoading}
        >
          {#if $loginLoading}
            <span class="loading loading-spinner loading-sm"></span>
            {$_('signing')}
          {:else}
            {$_('sign_in_button')}
          {/if}
        </button>
      {:else}
        <button
          class="btn btn-primary w-full capitalize"
          onclick={handleConnectAndSignIn}
        >
          {$_('connect_wallet')}
        </button>
      {/if}

      <p class="text-center text-xs text-base-content/50 capitalize">{$_('sign_in_prompt')}</p>
    </div>
  </div>
</section>