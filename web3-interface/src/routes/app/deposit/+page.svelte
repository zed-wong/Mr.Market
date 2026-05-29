<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
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
    openNetworkModal,
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

<div data-testid="web3-deposit" class="max-w-2xl">
  <section class="pt-2">
    <span class="eyebrow">Funding</span>
    <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content">Deposit</span>
    <span class="mt-4 block text-base-content/60">
      Mocked instructions for EVM and Solana. No server endpoint or wallet transaction is required.
    </span>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="deposit-connect-gate">
      <span class="text-sm text-base-content/70">Connect a wallet before generating deposit instructions.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="deposit-unsupported-gate">
      <span>Wrong network selected. Deposit continuation is blocked until Ethereum, Sepolia, or Solana is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="deposit-switch-network">Switch network</button>
    </section>
  {/if}

  {#if $walletIsConnected}
    <Section title="New deposit" eyebrow="Account context" caption={`${$walletNamespaceLabel} · ${$walletNetwork} · ${$walletShortAddress}`}>
      <div class="flex flex-col gap-6 border-t border-base-300 pt-6">
        <label class="flex flex-col gap-2">
          <span class="eyebrow">Chain / asset</span>
          <select class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content" bind:value={selectedAsset} data-testid="deposit-asset-select">
            {#each $balances as balance}
              <option value={balance.asset}>
                {balance.chainNamespace === 'evm' ? 'EVM' : 'Solana / SVM'} · {balance.symbol} · {balance.name}
              </option>
            {/each}
          </select>
        </label>

        <label class="flex flex-col gap-2">
          <span class="eyebrow">Mock deposit amount</span>
          <input
            class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-2xl focus:outline-none focus:border-base-content"
            bind:value={depositAmount}
            data-testid="deposit-amount-input"
          />
          <span class="text-xs text-base-content/50">
            Minimum: {minimumDepositFor(selectedBalance)} {selectedBalance?.symbol ?? 'asset'}.
          </span>
          {#if depositValidationErrors.amount}
            <span class="text-xs text-error" data-testid="deposit-amount-error">{depositValidationErrors.amount}</span>
          {/if}
        </label>

        <button
          class="btn-pill-primary disabled:opacity-40 disabled:cursor-not-allowed self-start"
          disabled={simulationDisabled}
          onclick={simulateDeposit}
          data-testid="simulate-deposit-button"
        >
          Simulate deposit
        </button>

        {#if depositResult}
          <div class="rounded-2xl border border-base-300 px-4 py-3 text-sm text-base-content/70" data-testid="deposit-result-summary">
            <span class="font-mono-num">{depositResult.id}</span> credited {depositResult.amount} {depositResult.symbol} at {depositResult.timestamp}.
          </div>
        {/if}
      </div>
    </Section>

    <Section title="Vault address" eyebrow="Where to send">
      <div class="flex flex-col gap-3 border-t border-base-300 pt-6" data-testid="deposit-instructions">
        <div class="flex items-center gap-2">
          <code class="font-mono-num flex-1 rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">{depositAddress}</code>
          <button class="btn-pill-outline" onclick={copyVaultAddress}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <span class="text-sm text-base-content/55">{depositInstruction}</span>
      </div>
    </Section>

    <Section title="Timeline" eyebrow="Mocked progression">
      <div class="border-t border-base-300" data-testid="deposit-timeline">
        {#each timeline as step}
          <div class="flex items-start gap-4 border-b border-base-300 py-4">
            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full {step.state === 'pending' ? 'bg-base-300' : 'bg-primary'}"></span>
            <div class="flex flex-col">
              <span class="font-medium text-base-content">{step.label}</span>
              <span class="text-xs text-base-content/55">{step.detail}</span>
            </div>
          </div>
        {/each}
      </div>
    </Section>

    {#if fundingActivity.length > 0}
      <Section title="Funding activity" eyebrow="Updated by deposits">
        <div class="border-t border-base-300" data-testid="deposit-activity-preview">
          {#each fundingActivity as entry}
            <StatRow
              label={entry.label}
              sublabel={entry.detail}
              value="→"
              href={entry.href}
              testid="deposit-activity-link"
            />
          {/each}
        </div>
      </Section>
    {/if}
  {/if}
</div>
