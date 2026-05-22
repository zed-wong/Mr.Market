<script lang="ts">
  import { openMockWallet, walletIsConnected, walletNamespaceLabel, walletShortAddress } from '$lib/stores/wallet';
</script>

<section class="flex min-h-screen items-center justify-center bg-base-200 px-4" data-testid="mock-login">
  <div class="card w-full max-w-md border border-base-300 bg-base-100 shadow-sm">
    <div class="card-body gap-4 text-center">
      <span class="text-2xl font-bold text-base-content">Mock Reown sign-in</span>
      <span class="text-base-content/70">This prototype uses local deterministic wallet state and does not call authentication endpoints.</span>
      {#if $walletIsConnected}
        <span class="badge badge-outline mx-auto">{$walletNamespaceLabel} · {$walletShortAddress}</span>
      {/if}
      <button class="btn btn-primary" onclick={openMockWallet}>Open mocked wallet controls</button>
      <a href="/" class="btn btn-ghost">Continue to shell</a>
    </div>
  </div>
</section>
