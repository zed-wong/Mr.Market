<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Section from '$lib/components/common/Section.svelte';
  import StatRow from '$lib/components/common/StatRow.svelte';
  import { getWithdrawStatus, submitWithdraw, verifyWithdrawRequest } from '$lib/helpers/api/web3';
  import { getEthereumRouterAddress } from '$lib/helpers/constants';
  import { fundingActivity, refreshBalances, web3Balances } from '$lib/stores/balances';
  import {
    openNetworkModal,
    openMockWallet,
    requestWithdrawalWithWallet,
    walletAddress,
    walletIsConnected,
    walletIsUnsupported,
    walletNamespaceLabel,
    walletNetwork,
  } from '$lib/stores/wallet';
  import type { Web3SerializedBalance } from '$lib/types/balances';
  import type { WithdrawResponse } from '$lib/types/withdraw';

  type OrderWithdrawBalance = Web3SerializedBalance & {
    key: string;
    chainId: number | null;
    tokenAddress: string | null;
    symbol: string;
    decimals: number;
  };

  let selectedKey = $state('');
  let amount = $state('');
  let step = $state<'form' | 'confirm' | 'submitted'>('form');
  let withdrawResult = $state<WithdrawResponse | null>(null);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let pollTimer: ReturnType<typeof setTimeout> | null = null;

  const parseAssetId = (assetId: string) => {
    const [, chainId, tokenAddress] = assetId.split(':');
    return {
      chainId: Number(chainId) || null,
      tokenAddress: tokenAddress ? `0x${tokenAddress.replace(/^0x/, '')}` : null,
    };
  };

  const symbolForAsset = (assetId: string): string => {
    const lower = assetId.toLowerCase();
    if (lower.includes('usdc')) return 'USDC';
    if (lower.includes('usdt')) return 'USDT';
    if (lower.includes('weth')) return 'WETH';
    const token = assetId.split(':').pop() || assetId;
    return token.length > 10 ? `${token.slice(0, 6)}…${token.slice(-4)}` : token.toUpperCase();
  };

  const withdrawableBalances = $derived.by<OrderWithdrawBalance[]>(() => {
    const groups = $web3Balances?.inMarketMaking ?? [];
    return groups.flatMap((group) =>
      group.orders
        .filter((order) => Number(order.available || 0) > 0)
        .map((order) => {
          const parsed = parseAssetId(order.assetId);
          const symbol = symbolForAsset(order.assetId);
          return {
            ...order,
            key: `${order.orderId}:${order.assetId}`,
            chainId: parsed.chainId,
            tokenAddress: parsed.tokenAddress,
            symbol,
            decimals: symbol === 'WETH' ? 18 : 6,
          };
        })
    );
  });
  const selectedBalance = $derived(
    withdrawableBalances.find((balance) => balance.key === selectedKey) ?? null
  );
  const validationErrors = $derived(validateWithdrawal(selectedBalance, amount));
  const formIsValid = $derived(
    Boolean($walletIsConnected && !$walletIsUnsupported && selectedBalance && Object.keys(validationErrors).length === 0 && !submitting)
  );

  function validateWithdrawal(balance: OrderWithdrawBalance | null | undefined, amountInput: string): Record<string, string> {
    const errors: Record<string, string> = {};
    if (!balance) {
      errors.amount = 'Select an order-attributed balance before preparing a withdrawal.';
      return errors;
    }
    if (!balance.chainId || !balance.tokenAddress) {
      errors.asset = 'Selected order balance is missing EVM token metadata.';
    }
    const trimmed = amountInput.trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isFinite(parsed)) {
      errors.amount = 'Enter a numeric withdrawal amount.';
    } else if (parsed <= 0) {
      errors.amount = 'Withdrawal amount must be greater than zero.';
    } else if ((trimmed.split('.')[1]?.length ?? 0) > balance.decimals) {
      errors.amount = `${balance.symbol} supports up to ${balance.decimals} decimals.`;
    } else if (parsed > Number(balance.available || 0)) {
      errors.amount = `Amount exceeds order available balance of ${balance.available} ${balance.symbol}.`;
    }
    return errors;
  }

  $effect(() => {
    const keys = withdrawableBalances.map((balance) => balance.key);
    if (!keys.includes(selectedKey)) {
      selectedKey = withdrawableBalances[0]?.key ?? '';
      step = 'form';
      withdrawResult = null;
    }
  });

  onMount(() => {
    if ($walletIsConnected && !$walletIsUnsupported) {
      void refreshBalances();
    }
  });

  onDestroy(() => {
    if (pollTimer) clearTimeout(pollTimer);
  });

  const reviewWithdrawal = () => {
    if (!formIsValid) return;
    step = 'confirm';
  };

  const pollWithdrawal = (withdrawalId: string) => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        const status = await getWithdrawStatus(withdrawalId);
        withdrawResult = status;
        if (['created', 'onchain_seen', 'processing'].includes(status.status)) {
          pollWithdrawal(withdrawalId);
        } else {
          await refreshBalances();
        }
      } catch (error) {
        submitError = error instanceof Error ? error.message : 'Unable to refresh withdrawal status';
      }
    }, 2500);
  };

  const submitWithdrawal = async () => {
    if (!selectedBalance?.chainId || !selectedBalance.tokenAddress || !formIsValid || !$walletAddress) return;
    const routerAddress = getEthereumRouterAddress();
    if (!routerAddress) {
      submitError = 'Router address is not configured for web3-interface.';
      return;
    }

    submitting = true;
    submitError = null;
    try {
      const prepared = await submitWithdraw({
        orderId: selectedBalance.orderId,
        chainId: selectedBalance.chainId,
        routerAddress,
        tokenAddress: selectedBalance.tokenAddress,
        amount: amount.trim(),
        recipientAddress: $walletAddress,
        idempotencyKey: `withdraw:${selectedBalance.orderId}:${selectedBalance.assetId}:${amount.trim()}:${Date.now()}`,
      });
      const routerCall = prepared.routerCall;
      if (!routerCall) {
        throw new Error('Withdrawal request did not include Router call parameters.');
      }
      const txHash = await requestWithdrawalWithWallet(routerCall);
      withdrawResult = await verifyWithdrawRequest(prepared.withdrawalId, { txHash });
      step = 'submitted';
      await refreshBalances();
      if (['created', 'onchain_seen', 'processing'].includes(withdrawResult.status)) {
        pollWithdrawal(withdrawResult.withdrawalId);
      }
    } catch (error) {
      submitError = error instanceof Error ? error.message : 'Unable to submit withdrawal';
    } finally {
      submitting = false;
    }
  };
</script>

<div class="max-w-2xl" data-testid="web3-withdraw">
  <section class="pt-2">
    <span class="eyebrow">Funding</span>
    <span class="mt-3 block font-display text-4xl md:text-5xl tracking-tight text-base-content">Withdraw</span>
    <span class="mt-4 block text-base-content/60">
      Withdraw order-attributed ledger funds by first emitting a Router withdrawal request event. The server validates that event before paying out.
    </span>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="withdraw-connect-gate">
      <span class="text-sm text-base-content/70">Connect a wallet before preparing a withdrawal.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="withdraw-unsupported-gate">
      <span>Wrong network selected. Withdrawal submission is blocked until a supported EVM chain is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="withdraw-switch-network">Switch network</button>
    </section>
  {/if}

  <Section title="New withdrawal" eyebrow="Order funding context" caption={`${$walletNamespaceLabel} · ${$walletNetwork ?? 'not connected'}`}>
    <div class="flex flex-col gap-6 border-t border-base-300 pt-6">
      <label class="flex flex-col gap-2">
        <span class="eyebrow">Order balance</span>
        <select
          class="bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={selectedKey}
          disabled={!$walletIsConnected}
          data-testid="withdraw-asset-select"
        >
          <option value="">Select order balance</option>
          {#each withdrawableBalances as balance}
            <option value={balance.key}>
              {balance.symbol} · {balance.available} available · order {balance.orderId.slice(0, 8)}…
            </option>
          {/each}
        </select>
      </label>

      <div class="flex flex-col gap-2">
        <span class="eyebrow">Recipient</span>
        <code class="font-mono-num rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">{$walletAddress ?? 'Connect wallet'}</code>
        <span class="text-xs text-base-content/50">The Router event authorizes the server to pay this recipient.</span>
      </div>

      <label class="flex flex-col gap-2">
        <span class="eyebrow">Amount</span>
        <input
          class="bg-transparent border-b border-base-300 px-0 py-2 font-mono-num text-2xl focus:outline-none focus:border-base-content disabled:opacity-40"
          bind:value={amount}
          oninput={() => { step = 'form'; }}
          placeholder="0.00"
          disabled={!$walletIsConnected}
          data-testid="withdraw-amount-input"
        />
        <span class="text-xs text-base-content/50">
          Available: {selectedBalance?.available ?? '0'} {selectedBalance?.symbol ?? 'asset'} · order: {selectedBalance?.orderId ?? '—'}
        </span>
        {#if validationErrors.asset}
          <span class="text-xs text-error" data-testid="withdraw-asset-error">{validationErrors.asset}</span>
        {/if}
        {#if validationErrors.amount}
          <span class="text-xs text-error" data-testid="withdraw-amount-error">{validationErrors.amount}</span>
        {/if}
      </label>

      <button
        class="btn-pill-primary self-start disabled:opacity-40 disabled:cursor-not-allowed"
        disabled={!formIsValid}
        onclick={reviewWithdrawal}
        data-testid="withdraw-submit-button"
      >
        Review withdrawal
      </button>

      {#if submitError}
        <span class="text-xs text-error" data-testid="withdraw-submit-error">{submitError}</span>
      {/if}
    </div>
  </Section>

  {#if step === 'confirm' && selectedBalance}
    <Section title="Confirm withdrawal" eyebrow="Review">
      <div class="border-t border-base-300 pt-6" data-testid="withdraw-confirmation">
        <span class="block text-sm text-base-content/60">
          Your wallet will call Router `requestWithdrawal`. The server pays out only after the matching event is confirmed and ledger availability is validated.
        </span>

        <div class="mt-6">
          <StatRow label="Order" value={selectedBalance.orderId} />
          <StatRow label="Asset" value={selectedBalance.symbol} />
          <StatRow label="Amount" value={amount} />
          <StatRow label="Recipient" value={$walletAddress ?? '—'} />
        </div>

        <div class="mt-6 flex flex-wrap gap-2">
          <button class="btn-pill-outline" onclick={() => { step = 'form'; }} data-testid="withdraw-edit-button">Edit</button>
          <button class="btn-pill-primary" onclick={submitWithdrawal} disabled={submitting} data-testid="withdraw-confirm-button">{submitting ? 'Submitting…' : 'Emit request & submit'}</button>
        </div>
      </div>
    </Section>
  {/if}

  {#if step === 'submitted' && withdrawResult}
    <Section title="Submitted" eyebrow="Router event">
      <div class="border-t border-base-300 pt-6" data-testid="withdraw-submitted">
        <span class="block text-sm text-base-content/60">
          <span class="font-mono-num">{withdrawResult.withdrawalId}</span> is {withdrawResult.status} for {withdrawResult.withdrawal.amount} {selectedBalance?.symbol ?? 'token'}.
        </span>
        {#if withdrawResult.requestTxHash}
          <code class="mt-4 block font-mono-num rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">request: {withdrawResult.requestTxHash}</code>
        {/if}
        {#if withdrawResult.payoutTxHash}
          <code class="mt-4 block font-mono-num rounded-2xl border border-base-300 px-4 py-3 text-sm break-all">payout: {withdrawResult.payoutTxHash}</code>
        {/if}
        {#if withdrawResult.failureReason}
          <span class="mt-4 block text-xs text-error">{withdrawResult.failureReason}</span>
        {/if}
        <div class="mt-6" data-testid="withdraw-timeline">
          {#each [
            { label: 'Router requested', detail: withdrawResult.requestTxHash ?? 'Waiting for Router request event.', state: withdrawResult.requestTxHash ? 'complete' : 'pending' },
            { label: 'Ledger debited', detail: withdrawResult.withdrawal.ledgerEntryId ? `Ledger entry ${withdrawResult.withdrawal.ledgerEntryId}` : 'Ledger debit not recorded yet.', state: withdrawResult.withdrawal.ledgerEntryId ? 'complete' : 'pending' },
            { label: 'Server payout', detail: withdrawResult.payoutTxHash ?? withdrawResult.failureReason ?? 'Waiting for server payout evidence.', state: withdrawResult.status === 'submitted' || withdrawResult.status === 'paid' ? 'complete' : withdrawResult.status === 'blocked' || withdrawResult.status === 'failed' ? 'current' : 'pending' },
          ] as item}
            <div class="flex items-start gap-4 border-b border-base-300 py-4">
              <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full {item.state === 'pending' ? 'bg-base-300' : 'bg-primary'}"></span>
              <div class="flex flex-col">
                <span class="font-medium text-base-content">{item.label}</span>
                <span class="text-xs text-base-content/55">{item.detail}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </Section>
  {/if}

  {#if $walletIsConnected && $fundingActivity.length > 0}
    <Section title="Funding activity" eyebrow="After withdrawals">
      <div class="border-t border-base-300" data-testid="withdraw-activity-preview">
        {#each $fundingActivity as entry}
          <StatRow
            label={entry.direction}
            sublabel={`${entry.assetId} · ${entry.createdAt}`}
            value={entry.amount}
            testid="withdraw-activity-link"
          />
        {/each}
      </div>
    </Section>
  {/if}
</div>
