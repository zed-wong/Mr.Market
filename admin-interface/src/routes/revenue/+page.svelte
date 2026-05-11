<script lang="ts">
  import { _ } from "svelte-i18n";
</script>

<div class="p-4 sm:p-6 lg:p-8">
  <div class="card bg-base-100 border border-base-300 shadow-sm" data-testid="revenue-route-content">
    <div class="card-body gap-4">
      <span class="text-2xl font-bold text-base-content">{$_("revenue")}</span>
      <span class="text-base-content/60">
        {$_("revenue_route_description")}
      </span>
      <div class="stats stats-vertical sm:stats-horizontal bg-base-100 border border-base-300">
        <div class="stat">
          <span class="stat-title">{$_("total")}</span>
          <span class="stat-value text-base-content">0</span>
          <span class="stat-desc">{$_("no_result_found")}</span>
        </div>
      </div>
    </div>
  </div>
</div>
