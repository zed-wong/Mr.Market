<script lang="ts">
  import { balances } from '$lib/stores/balances';
  import {
    completeMockDeposit,
    depositAddressFor,
    depositInstructionFor,
    depositTimeline,
    fundingActivityForAccount,
    minimumDepositFor,
    sessionFundingActivity,
    suggestedDepositAmountFor,
    validateMockDeposit,
    type MockFundingResult,
  } from '$lib/stores/funding';
  import {
    openMockWallet,
    walletAccount,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
    walletShortAddress,
  } from '$lib/stores/wallet';

  let copied = $state(false);
  let selectedAsset = $state('');
  let depositAmount = $state('');
  let depositResult = $state<MockFundingResult | null>(null);

  let selectedBalance = $derived($balances.find((balance) => balance.asset === selectedAsset));
  let depositAddress = $derived(depositAddressFor(selectedBalance));
  let depositInstruction = $derived(depositInstructionFor(selectedBalance));
  let timeline = $derived(depositResult?.timeline ?? depositTimeline(false));
  let fundingActivity = $derived(
    $walletIsConnected && !$walletIsUnsupported
      ? fundingActivityForAccount($walletAccount?.id, $walletAccount?.namespace ?? null, $sessionFundingActivity)
      : []
  );
  let depositValidationErrors = $derived(
    validateMockDeposit({
      balance: selectedBalance,
      amount: depositAmount,
    })
  );
  let simulationDisabled = $derived(
    !$walletAccount || $walletIsUnsupported || !selectedBalance || Object.keys(depositValidationErrors).length > 0
  );

  $effect(() => {
    const availableAssets = $balances.map((balance) => balance.asset);
    if (!availableAssets.includes(selectedAsset)) {
      selectedAsset = $balances[0]?.asset ?? '';
      depositResult = null;
    }
    if (selectedBalance && !depositAmount) {
      depositAmount = suggestedDepositAmountFor(selectedBalance);
    }
  });

  const copyVaultAddress = () => {
    if (depositAddress) {
      navigator.clipboard.writeText(depositAddress);
      copied = true;
      setTimeout(() => { copied = false; }, 2000);
    }
  };

  const simulateDeposit = () => {
    if (!$walletAccount || !selectedBalance || simulationDisabled) return;
    depositResult = completeMockDeposit($walletAccount.id, selectedBalance, depositAmount);
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
          <label class="form-control">
            <span class="label-text mb-1">Chain / asset</span>
            <select class="select select-bordered w-full" bind:value={selectedAsset} data-testid="deposit-asset-select">
              {#each $balances as balance}
                <option value={balance.asset}>
                  {balance.chainNamespace === 'evm' ? 'EVM' : 'Solana / SVM'} · {balance.symbol} · {balance.name}
                </option>
              {/each}
            </select>
          </label>
          <label class="form-control">
            <span class="label-text mb-1">Mock deposit amount</span>
            <input class="input input-bordered" bind:value={depositAmount} data-testid="deposit-amount-input" />
            <span class="label-text-alt mt-1 text-base-content/60">
              Minimum note: {minimumDepositFor(selectedBalance)} {selectedBalance?.symbol ?? 'asset'} · available after simulation.
            </span>
            {#if depositValidationErrors.amount}
              <span class="label-text-alt mt-1 text-error" data-testid="deposit-amount-error">{depositValidationErrors.amount}</span>
            {/if}
          </label>
          <button class="btn btn-primary" disabled={simulationDisabled} onclick={simulateDeposit} data-testid="simulate-deposit-button">
            Simulate mocked deposit
          </button>
          {#if depositResult}
            <span class="rounded-box border border-base-300 bg-base-200 p-3 text-sm text-base-content/70" data-testid="deposit-result-summary">
              {depositResult.id} credited {depositResult.amount} {depositResult.symbol} at {depositResult.timestamp}.
            </span>
          {/if}
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
            {depositInstruction}
          </span>
        </div>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="deposit-timeline">
      <div class="card-body gap-3">
        <span class="font-semibold">Mocked deposit timeline</span>
        <ul class="steps steps-vertical lg:steps-horizontal">
          {#each timeline as step}
            <li class="step {step.state === 'pending' ? '' : 'step-primary'}">
              <span class="font-semibold">{step.label}</span>
              <span class="text-xs text-base-content/60">{step.detail}</span>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <div class="card border border-base-300 bg-base-100 shadow-sm" data-testid="deposit-activity-preview">
      <div class="card-body gap-3">
        <span class="font-semibold">Funding activity updated by deposits</span>
        {#each fundingActivity as entry}
          <a href={entry.href} class="rounded-box border border-base-300 bg-base-200 p-3 transition-colors hover:border-primary" data-testid="deposit-activity-link">
            <span class="font-semibold">{entry.label}</span>
            <span class="block text-sm text-base-content/60">{entry.detail}</span>
          </a>
        {/each}
      </div>
    </div>
  {/if}
</section>
