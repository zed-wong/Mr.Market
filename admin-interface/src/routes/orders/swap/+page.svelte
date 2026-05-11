<script lang="ts">
  import { _ } from "svelte-i18n";
</script>

<div class="p-4 sm:p-6 lg:p-8">
  <div
    class="card bg-base-100 border border-base-300 shadow-sm"
    data-testid="swap-orders-route-content"
  >
    <div class="card-body gap-5">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div class="flex flex-col gap-1">
          <span class="text-2xl font-bold text-base-content">{$_("swap_orders")}</span>
          <span class="text-base-content/60">
            {$_("swap_orders_route_description")}
          </span>
        </div>
        <button class="btn btn-outline btn-sm" disabled>{$_("refresh")}</button>
      </div>

      <div class="stats stats-vertical sm:stats-horizontal bg-base-100 border border-base-300">
        <div class="stat">
          <span class="stat-title">{$_("open_orders")}</span>
          <span class="stat-value text-base-content">0</span>
          <span class="stat-desc">{$_("swap_orders")}</span>
        </div>
        <div class="stat">
          <span class="stat-title">{$_("filled_orders")}</span>
          <span class="stat-value text-base-content">0</span>
          <span class="stat-desc">{$_("no_result_found")}</span>
        </div>
      </div>

      <div class="overflow-x-auto rounded-box border border-base-300">
        <table class="table">
          <thead>
            <tr>
              <th>{$_("order_id")}</th>
              <th>{$_("symbol")}</th>
              <th>{$_("route")}</th>
              <th>{$_("status")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="4" class="text-center">
                <div class="flex flex-col items-center gap-2 py-6">
                  <span class="badge badge-outline">{$_("empty")}</span>
                  <span class="text-base-content/60">{$_("no_result_found")}</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
