<script lang="ts">
  import { primaryDepositAddress } from '$lib/helpers/mock-web3';
  import {
    openMockWallet,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespace,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  let copied = $state(false);
  let depositAddress = $derived($walletNamespace ? primaryDepositAddress($walletNamespace) : '');

  const copyVaultAddress = () => {
    if (depositAddress) {
      navigator.clipboard.writeText(depositAddress);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };
</script>

<section class="space-y-4" data-testid="web3-deposit">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold text-base-content">Deposit</span>
      <span class="text-base-content/70">Mocked funding instructions for EVM and Solana. No server endpoint or wallet transaction is required.</span>
    </div>
  </div>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <div class="alert alert-info" data-testid="deposit-connect-gate">
      <span>Connect a mocked Reown wallet before generating deposit instructions.</span>
      <button class="btn btn-sm btn-primary" onclick={openMockWallet}>Connect Wallet</button>
    </div>
  {:else if $walletIsUnsupported}
    <div class="alert alert-warning" data-testid="deposit-unsupported-gate">
      <span>Unsupported chain selected. Deposit continuation is blocked until EVM or Solana is selected.</span>
    </div>
  {/if}

  {#if $walletIsConnected}
    <div class="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div class="card border border-base-300 bg-base-100 shadow-sm">
        <div class="card-body gap-3">
          <span class="font-semibold">Account context</span>
          <span class="badge badge-outline w-fit">{$walletNamespaceLabel}</span>
          <span class="text-base-content/70">{$walletNetwork} · {$walletShortAddress}</span>
          <select class="select select-bordered w-full" data-testid="deposit-asset-select">
            <option>{$walletNamespace === 'evm' ? 'ETH' : 'SOL'}</option>
            <option>USDC</option>
          </select>
        </div>
      </div>

      <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="deposit-instructions">
        <div class="card-body gap-3">
          <span class="text-sm font-medium text-base-content/60">Deposit address</span>
          <div class="flex items-center gap-2">
            <code class="flex-1 rounded bg-base-200 px-3 py-2 text-sm break-all">{depositAddress}</code>
            <button class="btn btn-sm btn-outline" onclick={copyVaultAddress}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <span class="text-sm text-base-content/60">
            {$walletNamespace === 'evm'
              ? 'Send ETH or USDC on the selected EVM network. The mock timeline shows generated, detected, pending, and credited states.'
              : 'Send SOL or SPL USDC on Solana. This address and all status updates are deterministic mock data.'}
          </span>
        </div>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="deposit-timeline">
      <div class="card-body gap-3">
        <span class="font-semibold">Mocked deposit timeline</span>
        <ul class="steps steps-vertical lg:steps-horizontal">
          <li class="step step-primary">Address generated</li>
          <li class="step step-primary">Deposit detected</li>
          <li class="step step-primary">Pending confirmations</li>
          <li class="step">Credited</li>
        </ul>
      </div>
    </div>
  {/if}
</section>
