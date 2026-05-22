<script lang="ts">
  import { namespaceLabel, type MockCampaign, type WalletNamespace } from '$lib/helpers/mock-web3';
  import { createMockCampaign, validateCampaignCreation, type CampaignCreationInput } from '$lib/stores/market-making';
  import { openMockWallet, walletIsConnected, walletIsUnsupported, walletNamespace, walletNamespaceLabel } from '$lib/stores/wallet';

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
    createdCampaign = createMockCampaign(form);
  };
</script>

<section class="space-y-6" data-testid="campaign-create">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold">Create mocked campaign</span>
      <span class="text-base-content/70">Create a UI-only campaign with deterministic validation and success state.</span>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-4">
      {#if !$walletIsConnected && !$walletIsUnsupported}
        <div class="alert alert-info" data-testid="campaign-create-connect-gate">
          <span>Connect a mocked wallet before campaign creation.</span>
          <button class="btn btn-sm btn-primary" onclick={openMockWallet}>Connect Wallet</button>
        </div>
      {:else if $walletIsUnsupported}
        <div class="alert {$walletIsUnsupported ? 'alert-warning' : 'alert-info'}">
          <span>Unsupported chain blocks campaign creation.</span>
        </div>
      {/if}
      <label class="form-control">
        <span class="label-text mb-1">Campaign name</span>
        <input class="input input-bordered" bind:value={form.name} placeholder="New liquidity campaign" data-testid="campaign-name-input" />
        {#if attemptedSubmit && errors.name}<span class="label-text-alt mt-1 text-error">{errors.name}</span>{/if}
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Supported chain namespace</span>
        <select class="select select-bordered" bind:value={form.namespace} data-testid="campaign-namespace-select">
          <option value="">Choose namespace</option>
          <option value="evm">EVM</option>
          <option value="solana">Solana / SVM</option>
        </select>
        <span class="label-text-alt mt-1 text-base-content/60">Current wallet: {$walletNamespaceLabel}</span>
        {#if attemptedSubmit && errors.namespace}<span class="label-text-alt mt-1 text-error">{errors.namespace}</span>{/if}
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Supported assets</span>
        <input class="input input-bordered" bind:value={form.assets} placeholder="USDC, ETH" data-testid="campaign-assets-input" />
        {#if attemptedSubmit && errors.assets}<span class="label-text-alt mt-1 text-error">{errors.assets}</span>{/if}
      </label>
      <div class="grid gap-4 md:grid-cols-2">
        <label class="form-control">
          <span class="label-text mb-1">Minimum contribution (USD)</span>
          <input class="input input-bordered" bind:value={form.minimumContribution} placeholder="500" data-testid="campaign-minimum-input" />
          {#if attemptedSubmit && errors.minimumContribution}<span class="label-text-alt mt-1 text-error">{errors.minimumContribution}</span>{/if}
        </label>
        <label class="form-control">
          <span class="label-text mb-1">Timing / duration</span>
          <input class="input input-bordered" bind:value={form.duration} placeholder="Jun 1, 2026 → Jul 1, 2026" data-testid="campaign-duration-input" />
          {#if attemptedSubmit && errors.duration}<span class="label-text-alt mt-1 text-error">{errors.duration}</span>{/if}
        </label>
        <label class="form-control">
          <span class="label-text mb-1">Lifecycle status</span>
          <select class="select select-bordered" bind:value={form.status} data-testid="campaign-status-select">
            <option value="open">Open</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
          </select>
        </label>
        <label class="form-control">
          <span class="label-text mb-1">Liquidity target (USD)</span>
          <input class="input input-bordered" bind:value={form.liquidityTarget} placeholder="1000000" data-testid="campaign-liquidity-input" />
          {#if attemptedSubmit && errors.liquidityTarget}<span class="label-text-alt mt-1 text-error">{errors.liquidityTarget}</span>{/if}
        </label>
        <label class="form-control md:col-span-2">
          <span class="label-text mb-1">Volume target (USD)</span>
          <input class="input input-bordered" bind:value={form.volumeTarget} placeholder="5000000" data-testid="campaign-volume-input" />
          {#if attemptedSubmit && errors.volumeTarget}<span class="label-text-alt mt-1 text-error">{errors.volumeTarget}</span>{/if}
        </label>
      </div>
      <label class="form-control">
        <span class="label-text mb-1">Terms / requirements</span>
        <textarea class="textarea textarea-bordered min-h-28" bind:value={form.terms} placeholder="Contribute only funded inventory. Rewards accrue from mocked filled volume." data-testid="campaign-terms-input"></textarea>
        {#if attemptedSubmit && errors.terms}<span class="label-text-alt mt-1 text-error">{errors.terms}</span>{/if}
      </label>
      {#if attemptedSubmit && !$walletIsConnected}
        <span class="text-sm text-error">Wallet connection is required before mocked campaign submission.</span>
      {:else if attemptedSubmit && $walletIsUnsupported}
        <span class="text-sm text-error">Switch to a supported EVM or Solana wallet before submission.</span>
      {/if}
      <button class="btn btn-primary" onclick={submitCampaign} disabled={!$walletIsConnected || $walletIsUnsupported} data-testid="campaign-create-submit">Create mocked campaign</button>
    </div>
  </div>

  {#if createdCampaign}
    <div class="alert alert-success" data-testid="campaign-create-success">
      <span>
        Created {createdCampaign.name} for {createdCampaign.chains.map(namespaceLabel).join(', ')} · {createdCampaign.assets.join(', ')} · {createdCampaign.status}.
      </span>
      <a class="btn btn-sm btn-primary" href="/market-making">View My Campaigns</a>
      <a class="btn btn-sm btn-outline" href="/market-making/campaign/{createdCampaign.id}">Open detail</a>
    </div>
  {/if}
</section>
