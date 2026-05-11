<script lang="ts">
    import type { AdminSingleKey } from "$lib/types/hufi/admin";
    import SingleApiKey from "$lib/components/admin/exchanges/singleAPIKey.svelte";
    import { createEventDispatcher } from "svelte";
    import { _ } from "svelte-i18n";

    export let keys: AdminSingleKey[] = [];

    const dispatch = createEventDispatcher();

    function handleDelete(event: CustomEvent<string>) {
        dispatch("delete", event.detail);
    }

    // Pagination
    let currentPage = 1;
    const itemsPerPage = 10;
    $: totalPages = Math.ceil(keys.length / itemsPerPage);
    $: if (currentPage > totalPages) {
        currentPage = Math.max(1, totalPages);
    }
    $: paginatedKeys = keys.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage,
    );

    function goToPage(page: number) {
        currentPage = page;
    }
</script>

<div class="overflow-x-auto">
    <table class="table table-lg">
        <thead class="bg-base-200/50 text-base-content/70">
            <tr>
                <th class="capitalize text-xs font-semibold"
                    >{$_("exchange")}</th
                >
                <th class="capitalize text-xs font-semibold"
                    >{$_("name")} / {$_("key_id")}</th
                >
                <th class="capitalize text-xs font-semibold"
                    >{$_("permissions")}</th
                >
                <th class="capitalize text-xs font-semibold">{$_("created")}</th
                >
                <th class="capitalize text-xs font-semibold">{$_("status")}</th>
                <th class="text-right capitalize text-xs font-semibold"
                    >{$_("actions")}</th
                >
            </tr>
        </thead>
        <tbody>
            {#if paginatedKeys.length === 0}
                <tr>
                    <td
                        colspan="6"
                        class="text-center py-8 text-base-content/60"
                    >
                        {$_("no_api_keys_found")}
                    </td>
                </tr>
            {:else}
                {#each paginatedKeys as key (key.key_id)}
                    <SingleApiKey {key} on:delete={handleDelete} />
                {/each}
            {/if}
        </tbody>
    </table>
</div>

<!-- Pagination -->
<div
    class="flex items-center justify-between px-6 py-4 border-t border-base-200 bg-base-100"
>
    <div class="text-sm text-base-content/60">
        {$_("showing")}
        <span class="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span>
        {$_("to")}
        <span class="font-medium"
            >{Math.min(currentPage * itemsPerPage, keys.length)}</span
        >
        {$_("of")} <span class="font-medium">{keys.length}</span>
        {$_("results")}
    </div>
    <div class="join">
        <button
            class="join-item btn btn-sm"
            disabled={currentPage === 1}
            on:click={() => goToPage(currentPage - 1)}
        >
            «
        </button>
        {#each Array.from({ length: totalPages }, (_, i) => i + 1) as pageNum (pageNum)}
            {#if totalPages <= 5 || pageNum === 1 || pageNum === totalPages || Math.abs(pageNum - currentPage) <= 1}
                <button
                    class="join-item btn btn-sm"
                    class:btn-active={currentPage === pageNum}
                    on:click={() => goToPage(pageNum)}
                >
                    {pageNum}
                </button>
            {:else if Math.abs(pageNum - currentPage) === 2}
                <button class="join-item btn btn-sm btn-disabled">...</button>
            {/if}
        {/each}
        <button
            class="join-item btn btn-sm"
            disabled={totalPages === 0 || currentPage === totalPages}
            on:click={() => goToPage(currentPage + 1)}
        >
            »
        </button>
    </div>
</div>
