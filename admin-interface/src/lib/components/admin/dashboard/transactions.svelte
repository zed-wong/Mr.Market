<script lang="ts">
  import { _ } from "svelte-i18n";

  const txs = [
    {
      snapshot: "61164483-18e0-480f-a2c4-a153ca244b9d",
      timestamp: "2024-02-29",
      amount: 23351,
      type: "spot_buy",
    },
  ];
</script>

<div class="w-full grid grid-cols-1 gap-4">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body p-4 sm:p-5 md:p-6">
      <div class="mb-4 flex items-start justify-between gap-3">
        <div class="space-y-1">
          <span class="block text-lg font-semibold text-base-content">{$_("latest_orders")}</span>
          <span class="block text-sm text-base-content/60">{$_("latest_transactions_description")}</span>
        </div>
      <div class="flex-shrink-0">
        <a
          href="/manage/orders"
          class="btn btn-ghost btn-sm normal-case"
          >{$_("view_all")}</a
        >
      </div>
    </div>

    <div class="flex flex-col mt-4">
      <div class="overflow-x-auto rounded-box border border-base-300">
        <div class="align-middle inline-block min-w-full">
          <div class="overflow-hidden">
            <table class="table table-sm md:table-md min-w-full">
              <thead class="bg-base-200/60 text-base-content/70">
                <tr>
                  <th scope="col" class="capitalize text-xs font-semibold">
                    {$_("transaction")}
                  </th>
                  <th scope="col" class="capitalize text-xs font-semibold">
                    {$_("date_time")}
                  </th>
                  <th scope="col" class="capitalize text-xs font-semibold">
                    {$_("amount")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {#each txs as tx}
                  <tr>
                    <td class="whitespace-nowrap text-sm text-base-content">
                      {tx.snapshot}
                    </td>
                    <td class="whitespace-nowrap text-sm text-base-content/60">
                      {tx.timestamp}
                    </td>
                    <td class="whitespace-nowrap text-sm font-semibold text-base-content">
                      {tx.amount}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
</div>
