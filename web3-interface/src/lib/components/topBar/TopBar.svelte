<script lang="ts">
  import { mockAccounts } from '$lib/helpers/mock-web3';
  import {
    closeMockWallet,
    connectMockWallet,
    openMockWallet,
    setUnsupportedChain,
    setWalletDisconnected,
    switchMockAccount,
    walletAccount,
    walletIsConnected,
    walletIsUnsupported,
    walletModalOpen,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
    walletStatus,
  } from '$lib/stores/wallet';
  import ThemeToggle from './ThemeToggle.svelte';

  const connect = (accountId: string) => {
    void connectMockWallet(accountId);
  };
</script>

<header class="sticky top-0 z-40 border-b border-base-300 bg-base-100/95 backdrop-blur">
  <div class="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
    <div class="flex flex-col">
      <span class="text-lg font-bold text-base-content">Mr.Market Web3</span>
      <span class="text-xs text-base-content/60">Mock Reown/AppKit session · fresh contexts start disconnected</span>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-2" data-testid="top-controls">
      <div class="join" data-testid="chain-control">
        <button class="btn btn-sm join-item" onclick={() => switchMockAccount('evm-primary')}>EVM</button>
        <button class="btn btn-sm join-item" onclick={() => switchMockAccount('solana-primary')}>Solana</button>
        <button class="btn btn-sm join-item btn-warning" onclick={setUnsupportedChain}>Unsupported</button>
      </div>

      <div class="badge badge-outline gap-1" data-testid="session-state">
        <span>Session</span>
        <span>{$walletStatus}</span>
      </div>

      <div class="badge badge-ghost" data-testid="chain-state">
        {$walletNamespaceLabel} · {$walletNetwork ?? 'not selected'}
      </div>

      <ThemeToggle />

      {#if $walletIsConnected || $walletIsUnsupported}
        <button class="btn btn-sm btn-outline" onclick={openMockWallet} data-testid="wallet-menu-button">
          {$walletShortAddress}
        </button>
      {:else}
        <button class="btn btn-sm btn-primary" onclick={openMockWallet} data-testid="connect-wallet-button">
          Connect Wallet
        </button>
      {/if}
    </div>
  </div>
</header>

{#if $walletModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-base-content/30 p-4" data-testid="mock-reown-modal">
    <div class="card w-full max-w-xl border border-base-300 bg-base-100 shadow-xl">
      <div class="card-body gap-4">
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-col gap-1">
            <span class="text-lg font-bold text-base-content">Mock Reown AppKit</span>
            <span class="text-sm text-base-content/70">Choose a deterministic EVM or Solana account. No extension, signature, RPC, or project ID is required.</span>
          </div>
          <button class="btn btn-sm btn-ghost" onclick={closeMockWallet} aria-label="Close wallet modal">✕</button>
        </div>

        {#if $walletStatus === 'connecting'}
          <div class="alert alert-info" data-testid="wallet-connecting-state">
            <span class="loading loading-spinner loading-sm"></span>
            <span>Connecting mocked Reown wallet...</span>
          </div>
        {/if}

        <div class="grid gap-3 md:grid-cols-2">
          <button class="btn h-auto justify-start p-4 text-left" onclick={() => connect('evm-primary')} data-testid="connect-evm-wallet">
            <span class="flex flex-col">
              <span class="font-semibold">Connect EVM wallet</span>
              <span class="text-xs text-base-content/60">Ethereum · 0xA11C...0001</span>
            </span>
          </button>
          <button class="btn h-auto justify-start p-4 text-left" onclick={() => connect('solana-primary')} data-testid="connect-solana-wallet">
            <span class="flex flex-col">
              <span class="font-semibold">Connect Solana wallet</span>
              <span class="text-xs text-base-content/60">Solana / SVM · So11...1112</span>
            </span>
          </button>
        </div>

        <div class="rounded-box border border-base-300 bg-base-200 p-3" data-testid="account-switcher">
          <span class="text-sm font-semibold text-base-content">Switch account</span>
          <div class="mt-2 grid gap-2 md:grid-cols-2">
            {#each mockAccounts as account}
              <button
                class="btn btn-sm {account.id === $walletAccount?.id ? 'btn-primary' : 'btn-outline'}"
                onclick={() => switchMockAccount(account.id)}
              >
                {account.label}
              </button>
            {/each}
          </div>
        </div>

        {#if $walletIsConnected || $walletIsUnsupported}
          <button class="btn btn-error btn-outline" onclick={setWalletDisconnected} data-testid="disconnect-wallet-button">
            Disconnect
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}