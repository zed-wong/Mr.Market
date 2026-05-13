<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<section class="space-y-4" data-testid="web3-market-making">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-3 p-5 md:p-6">
      <span class="text-lg font-bold text-base-content capitalize">{$_('market_making_title')}</span>
      <span class="text-base-content/70">{$_('market_making_campaigns')}</span>
    </div>
  </div>

  <div class="text-center py-12 text-base-content/50">
    <span class="capitalize">{$_('loading')}</span>
  </div>
</section>