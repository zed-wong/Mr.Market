<script lang="ts">
  import Section from '$lib/components/common/Section.svelte';
  import { namespaceLabel, type MockCampaign, type WalletNamespace } from '$lib/helpers/mock-web3';
  import { createMockCampaign, validateCampaignCreation, type CampaignCreationInput } from '$lib/stores/market-making';
  import { openMockWallet, openNetworkModal, walletAccount, walletIsConnected, walletIsUnsupported, walletNamespace, walletNamespaceLabel } from '$lib/stores/wallet';

  let form = $state<CampaignCreationInput>({
    name: '',
    namespace: '',
    assets: '',
    minimumContribution: '',
    duration: '',
    status: 'open',
    liquidityTarget: '',
    volumeTarget: '',
    terms: '',
  });
  let attemptedSubmit = $state(false);
  let createdCampaign = $state<MockCampaign | null>(null);
  let errors = $derived(validateCampaignCreation(form));
  let canSubmit = $derived(
    Boolean($walletIsConnected && !$walletIsUnsupported && Object.keys(errors).length === 0)
  );

  $effect(() => {
    if (!form.namespace && $walletNamespace) {
      form.namespace = $walletNamespace as WalletNamespace;
    }
  });

  const submitCampaign = () => {
    attemptedSubmit = true;
    createdCampaign = null;
    if (!canSubmit) return;
    createdCampaign = createMockCampaign(form, $walletAccount?.id);
  };

  const fieldClass = 'bg-transparent border-b border-base-300 px-0 py-2 focus:outline-none focus:border-base-content';
</script>

<div class="max-w-2xl" data-testid="campaign-create">
  <section class="pt-2">
    <span class="eyebrow">Market making · new pool</span>
    <span class="mt-3 block font-display text-5xl md:text-6xl tracking-tight text-base-content">Create campaign</span>
    <span class="mt-4 block text-base-content/60">
      UI-only campaign with deterministic validation and success state.
    </span>
  </section>

  {#if !$walletIsConnected && !$walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-base-300 px-5 py-4" data-testid="campaign-create-connect-gate">
      <span class="text-sm text-base-content/70">Connect a mocked wallet before campaign creation.</span>
      <button class="btn-pill-primary" onclick={openMockWallet}>Connect wallet</button>
    </section>
  {:else if $walletIsUnsupported}
    <section class="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warning/40 px-5 py-4 text-sm text-base-content/70" data-testid="campaign-create-unsupported-gate">
      <span>Wrong network selected. Campaign creation is blocked until Ethereum, Sepolia, or Solana is selected.</span>
      <button class="btn-pill-primary" onclick={openNetworkModal} data-testid="campaign-create-switch-network">Switch network</button>
    </section>
  {/if}

  <Section title="Campaign details" eyebrow="Configure">
    <div class="flex flex-col gap-8 border-t border-base-300 pt-6">
      <label class="flex flex-col gap-2">
        <span class="eyebrow">Name</span>
        <input class={fieldClass} bind:value={form.name} placeholder="New liquidity campaign" data-testid="campaign-name-input" />
        {#if attemptedSubmit && errors.name}<span class="text-xs text-error">{errors.name}</span>{/if}
      </label>

      <label class="flex flex-col gap-2">
        <span class="eyebrow">Chain namespace</span>
        <select class={fieldClass} bind:value={form.namespace} data-testid="campaign-namespace-select">
          <option value="">Choose namespace</option>
          <option value="evm">EVM</option>
          <option value="solana">Solana / SVM</option>
        </select>
        <span class="text-xs text-base-content/50">Current wallet: {$walletNamespaceLabel}</span>
        {#if attemptedSubmit && errors.namespace}<span class="text-xs text-error">{errors.namespace}</span>{/if}
      </label>

      <label class="flex flex-col gap-2">
        <span class="eyebrow">Supported assets</span>
        <input class={fieldClass} bind:value={form.assets} placeholder="USDC, ETH" data-testid="campaign-assets-input" />
        {#if attemptedSubmit && errors.assets}<span class="text-xs text-error">{errors.assets}</span>{/if}
      </label>

      <div class="grid gap-8 md:grid-cols-2">
        <label class="flex flex-col gap-2">
          <span class="eyebrow">Minimum (USD)</span>
          <input class={fieldClass + ' font-mono-num'} bind:value={form.minimumContribution} placeholder="500" data-testid="campaign-minimum-input" />
          {#if attemptedSubmit && errors.minimumContribution}<span class="text-xs text-error">{errors.minimumContribution}</span>{/if}
        </label>
        <label class="flex flex-col gap-2">
          <span class="eyebrow">Duration</span>
          <input class={fieldClass} bind:value={form.duration} placeholder="Jun 1 → Jul 1, 2026" data-testid="campaign-duration-input" />
          {#if attemptedSubmit && errors.duration}<span class="text-xs text-error">{errors.duration}</span>{/if}
        </label>
        <label class="flex flex-col gap-2">
          <span class="eyebrow">Status</span>
          <select class={fieldClass} bind:value={form.status} data-testid="campaign-status-select">
            <option value="open">Open</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        <label class="flex flex-col gap-2">
          <span class="eyebrow">Liquidity target (USD)</span>
          <input class={fieldClass + ' font-mono-num'} bind:value={form.liquidityTarget} placeholder="1000000" data-testid="campaign-liquidity-input" />
          {#if attemptedSubmit && errors.liquidityTarget}<span class="text-xs text-error">{errors.liquidityTarget}</span>{/if}
        </label>
        <label class="flex flex-col gap-2 md:col-span-2">
          <span class="eyebrow">Volume target (USD)</span>
          <input class={fieldClass + ' font-mono-num'} bind:value={form.volumeTarget} placeholder="5000000" data-testid="campaign-volume-input" />
          {#if attemptedSubmit && errors.volumeTarget}<span class="text-xs text-error">{errors.volumeTarget}</span>{/if}
        </label>
      </div>

      <label class="flex flex-col gap-2">
        <span class="eyebrow">Terms & requirements</span>
        <textarea
          class="bg-transparent border-b border-base-300 px-0 py-2 min-h-24 focus:outline-none focus:border-base-content resize-none"
          bind:value={form.terms}
          placeholder="Contribute only funded inventory. Rewards accrue from mocked filled volume."
          data-testid="campaign-terms-input"
        ></textarea>
        {#if attemptedSubmit && errors.terms}<span class="text-xs text-error">{errors.terms}</span>{/if}
      </label>

      {#if attemptedSubmit && !$walletIsConnected}
        <span class="text-xs text-error">Wallet connection is required before submission.</span>
      {:else if attemptedSubmit && $walletIsUnsupported}
        <span class="text-xs text-error">Switch to a supported EVM or Solana wallet before submission.</span>
      {/if}

      <button
        class="btn-pill-primary self-start disabled:opacity-40 disabled:cursor-not-allowed"
        onclick={submitCampaign}
        disabled={!$walletIsConnected || $walletIsUnsupported}
        data-testid="campaign-create-submit"
      >
        Create campaign
      </button>
    </div>
  </Section>

  {#if createdCampaign}
    <Section title="Created" eyebrow="Success">
      <div class="border-t border-base-300 pt-6" data-testid="campaign-create-success">
        <span class="block text-sm text-base-content/70">
          {createdCampaign.name} · {createdCampaign.chains.map(namespaceLabel).join(', ')} · {createdCampaign.assets.join(', ')} · {createdCampaign.status}
        </span>
        <div class="mt-6 flex flex-wrap gap-2">
          <a class="btn-pill-primary" href="/market-making">My campaigns</a>
          <a class="btn-pill-outline" href="/market-making/campaign/{createdCampaign.id}">Open detail →</a>
        </div>
      </div>
    </Section>
  {/if}
</div>
