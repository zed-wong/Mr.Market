<script lang="ts">
  import { _ } from "svelte-i18n";
  import { goto } from "$app/navigation";

  const columns = ["symbol", "asset_id", "exchange_name", "minimum_balance"];
</script>

<div
  class="card bg-base-100 border border-base-300 shadow-sm"
  data-testid="rebalance-minimum-balance-content"
>
  <div class="card-body gap-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div class="flex flex-col gap-2">
        <span class="text-2xl font-bold text-base-content">
          {$_("minimum_balance_settings")}
        </span>
        <span class="text-sm text-base-content/60">
          {$_("rebalance_minimum_balance_description")}
        </span>
      </div>
      <button
        class="btn btn-sm btn-primary"
        on:click={() => {
          goto("/rebalance/new");
        }}
      >
        <span>{$_("create_new_minimum_balance_record")}</span>
      </button>
    </div>

    <div class="overflow-x-auto">
      <table class="table">
        <thead>
          <tr>
            {#each columns as column}
              <th>{$_(column)}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colspan={columns.length} class="text-center">
              <span class="text-base-content/60">
                {$_("no_result_found")}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
