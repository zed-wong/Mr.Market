<script lang="ts">
  import { _ } from "svelte-i18n";
  import { createEventDispatcher } from "svelte";

  export let show = false;
  export let types: string[] = [];
  export let filterType = "";
  export let sortField: "date" | "reward" = "date";
  export let sortOrder: "desc" | "asc" = "desc";

  const dispatch = createEventDispatcher();

  function apply() {
    dispatch("apply", { filterType, sortField, sortOrder });
    show = false;
  }

  function reset() {
    filterType = "";
    sortField = "date";
    sortOrder = "desc";
    dispatch("apply", { filterType, sortField, sortOrder });
    show = false;
  }
</script>

<svelte:window on:keydown={(e) => show && e.key === "Escape" && (show = false)} />

{#if show}
  <div class="modal modal-open bg-black/20 backdrop-blur-[2px]">
    <div
      class="modal-box bg-base-100 p-0 rounded-2xl max-w-sm shadow-2xl border border-base-200/50"
    >
      <div class="p-6 pb-0">
        <div class="flex items-center justify-between mb-1">
          <span class="text-xl font-bold text-base-content">{$_("hufi_filter_title")}</span>
          <button
            class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
            on:click={() => (show = false)}
          >x</button>
        </div>
      </div>

      <div class="flex flex-col gap-4 p-6">
        <div>
          <span class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize mb-1 block">
            {$_("hufi_filter_campaign_type")}
          </span>
          <select
            class="select select-bordered select-sm w-full bg-base-100 text-base-content text-sm capitalize"
            bind:value={filterType}
          >
            <option value="">{$_("hufi_filter_all_types")}</option>
            {#each types as t}
              <option value={t} class="capitalize">{t.replace(/_/g, " ").toLowerCase()}</option>
            {/each}
          </select>
        </div>

        <div>
          <span class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize mb-1 block">
            {$_("hufi_filter_sort_by")}
          </span>
          <select
            class="select select-bordered select-sm w-full bg-base-100 text-base-content text-sm"
            bind:value={sortField}
          >
            <option value="date">{$_("hufi_filter_sort_date")}</option>
            <option value="reward">{$_("hufi_filter_sort_reward")}</option>
          </select>
        </div>

        <div>
          <span class="text-[10px] font-semibold tracking-wider text-base-content/40 capitalize mb-1 block">
            {$_("hufi_filter_order")}
          </span>
          <select
            class="select select-bordered select-sm w-full bg-base-100 text-base-content text-sm"
            bind:value={sortOrder}
          >
            <option value="desc">{$_("hufi_filter_desc")}</option>
            <option value="asc">{$_("hufi_filter_asc")}</option>
          </select>
        </div>

        <div class="flex gap-3 mt-2">
          <button class="btn btn-sm btn-outline flex-1" on:click={reset}>{$_("hufi_filter_reset")}</button>
          <button class="btn btn-sm btn-primary text-base-100 flex-1" on:click={apply}>{$_("hufi_filter_apply")}</button>
        </div>
      </div>
    </div>
  </div>
{/if}
