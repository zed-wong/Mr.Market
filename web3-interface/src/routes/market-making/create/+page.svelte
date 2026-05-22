<script lang="ts">
  import { walletIsConnected, walletIsUnsupported, walletNamespaceLabel } from '$lib/stores/wallet';
</script>

<section class="space-y-6" data-testid="campaign-create">
  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-3">
      <span class="text-2xl font-bold">Create mocked campaign</span>
      <span class="text-base-content/70">Baseline campaign creation form for future mocked flow workers.</span>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-4">
      {#if !$walletIsConnected}
        <div class="alert {$walletIsUnsupported ? 'alert-warning' : 'alert-info'}">
          <span>{$walletIsUnsupported ? 'Unsupported chain blocks campaign creation.' : 'Connect a mocked wallet before campaign creation.'}</span>
        </div>
      {/if}
      <label class="form-control">
        <span class="label-text mb-1">Campaign name</span>
        <input class="input input-bordered" value="New liquidity campaign" disabled />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Supported namespace</span>
        <input class="input input-bordered" value={$walletNamespaceLabel} disabled />
      </label>
      <label class="form-control">
        <span class="label-text mb-1">Assets</span>
        <input class="input input-bordered" value="USDC, ETH or SOL" disabled />
      </label>
      <button class="btn btn-primary" disabled={!$walletIsConnected || $walletIsUnsupported}>Create mocked campaign</button>
    </div>
  </div>
</section>
