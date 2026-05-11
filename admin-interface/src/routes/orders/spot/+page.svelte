<script lang="ts">
  import { _ } from "svelte-i18n";
</script>

<div class="p-4 sm:p-6 lg:p-8">
  <div class="card bg-base-100 border border-base-300 shadow-sm" data-testid="spot-orders-route-content">
    <div class="card-body gap-4">
      <span class="text-2xl font-bold text-base-content">{$_("spot_orders")}</span>
      <span class="text-base-content/60">
        {$_("spot_orders_route_description")}
      </span>
      <div class="overflow-x-auto">
        <table class="table">
          <thead>
            <tr>
              <th>{$_("order_id")}</th>
              <th>{$_("symbol")}</th>
              <th>{$_("status")}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="3" class="text-center">
                <span class="text-base-content/60">{$_("no_result_found")}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
