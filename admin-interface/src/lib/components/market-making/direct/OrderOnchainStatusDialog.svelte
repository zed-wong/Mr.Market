<script lang="ts">
    import { _ } from "svelte-i18n";
    import OrderDetailSubShell from "$lib/components/market-making/direct/OrderDetailSubShell.svelte";
    import type { DirectOrderStatus } from "$lib/types/hufi/admin-direct-market-making";

    export let data: DirectOrderStatus;
    export let onBack: () => void;
    export let onClose: () => void;

    const statusTone: Record<string, string> = {
        created: "bg-warning/10 text-warning",
        submitted: "bg-info/10 text-info",
        confirmed: "bg-success/10 text-success",
        active: "bg-success/10 text-success",
        failed: "bg-error/10 text-error",
        reverted: "bg-error/10 text-error",
        manual_review: "bg-error/10 text-error",
        out_of_range: "bg-warning/10 text-warning",
        closed: "bg-base-content/5 text-base-content/60",
    };

    const labelize = (value?: string | null) =>
        (value || $_("admin_direct_mm_na")).replaceAll("_", " ");

    const formatTime = (value?: string | null) => {
        if (!value) return $_("admin_direct_mm_na");
        const date = new Date(value);
        if (!Number.isFinite(date.getTime())) return value;
        return date.toLocaleString(undefined, {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
    };

    const shortId = (value?: string | null) => {
        if (!value) return $_("admin_direct_mm_na");
        if (value.length <= 16) return value;
        return `${value.slice(0, 8)}...${value.slice(-6)}`;
    };

    $: runtime = data.dexRuntime;
</script>

<OrderDetailSubShell
    title={$_("admin_direct_mm_onchain_status")}
    {onBack}
    {onClose}
>
    {#if !runtime}
        <div class="rounded-xl border border-base-300 p-5 text-center">
            <span class="text-xs text-base-content/50"
                >{$_("admin_direct_mm_onchain_empty")}</span
            >
        </div>
    {:else}
        <div class="flex flex-col gap-4">
            <div class="grid grid-cols-2 gap-3">
                <div class="rounded-xl border border-base-300 p-3">
                    <span class="block text-[10px] font-semibold text-base-content/40"
                        >{$_("admin_direct_mm_connector")}</span
                    >
                    <span class="block truncate text-sm font-bold text-base-content"
                        >{runtime.connectorId || $_("admin_direct_mm_na")}</span
                    >
                </div>
                <div class="rounded-xl border border-base-300 p-3">
                    <span class="block text-[10px] font-semibold text-base-content/40"
                        >{$_("admin_direct_mm_chain")}</span
                    >
                    <span class="block text-sm font-bold text-base-content"
                        >{runtime.chainId || $_("admin_direct_mm_na")}</span
                    >
                </div>
                <div class="rounded-xl border border-base-300 p-3">
                    <span class="block text-[10px] font-semibold text-base-content/40"
                        >{$_("admin_direct_mm_dex_account")}</span
                    >
                    <span
                        class="block truncate font-mono text-[11px] text-base-content"
                        title={runtime.tradingAccountId || ""}
                        >{shortId(runtime.tradingAccountId)}</span
                    >
                </div>
                <div class="rounded-xl border border-base-300 p-3">
                    <span class="block text-[10px] font-semibold text-base-content/40"
                        >{$_("admin_direct_mm_gas_scope")}</span
                    >
                    <span
                        class="block truncate font-mono text-[11px] text-base-content"
                        title={runtime.gasSponsorLedgerOrderId || ""}
                        >{shortId(runtime.gasSponsorLedgerOrderId)}</span
                    >
                </div>
            </div>

            <div class="rounded-xl border border-base-300 p-3">
                <div class="mb-2 flex items-center justify-between gap-2">
                    <span class="text-xs font-bold text-base-content"
                        >{$_("admin_direct_mm_preflight")}</span
                    >
                    <span
                        class="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize"
                        class:bg-success={runtime.preflight.staticSetupValidated}
                        class:text-base-100={runtime.preflight.staticSetupValidated}
                        class:bg-warning={!runtime.preflight.staticSetupValidated}
                        class:text-base-content={!runtime.preflight.staticSetupValidated}
                    >
                        {runtime.preflight.staticSetupValidated
                            ? $_("admin_direct_mm_validated")
                            : $_("admin_direct_mm_attention")}
                    </span>
                </div>
                <div class="flex flex-wrap gap-1.5">
                    {#each runtime.preflight.runtimeChecks as check}
                        <span
                            class="rounded-full border border-base-300 px-2 py-0.5 text-[10px] capitalize text-base-content/60"
                            >{labelize(check)}</span
                        >
                    {/each}
                </div>
            </div>

            {#if runtime.reservationBlocks.length > 0}
                <div class="rounded-xl border border-error/30 bg-error/5 p-3">
                    <span class="mb-2 block text-xs font-bold text-error"
                        >{$_("admin_direct_mm_reconciliation_blocks")}</span
                    >
                    <div class="flex flex-col gap-2">
                        {#each runtime.reservationBlocks as block}
                            <div class="flex items-center justify-between gap-3">
                                <span class="text-xs text-base-content"
                                    >{block.assetId}</span
                                >
                                <span
                                    class="truncate font-mono text-[10px] text-base-content/50"
                                    title={block.orderId}>{shortId(block.orderId)}</span
                                >
                            </div>
                        {/each}
                    </div>
                </div>
            {/if}

            <div class="rounded-xl border border-base-300">
                <div class="border-b border-base-300 px-3 py-2">
                    <span class="text-xs font-bold text-base-content"
                        >{$_("admin_direct_mm_evm_executions")}</span
                    >
                </div>
                {#if runtime.evmExecutions.length === 0}
                    <div class="px-3 py-5 text-center">
                        <span class="text-xs text-base-content/40"
                            >{$_("admin_direct_mm_no_evm_executions")}</span
                        >
                    </div>
                {:else}
                    {#each runtime.evmExecutions as execution}
                        <div class="border-b border-base-300/60 px-3 py-3 last:border-0">
                            <div class="flex items-center justify-between gap-3">
                                <span class="text-xs font-semibold capitalize text-base-content"
                                    >{labelize(execution.executionType)}</span
                                >
                                <span
                                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize {statusTone[
                                        execution.status
                                    ] || 'bg-base-content/5 text-base-content/60'}"
                                    >{labelize(execution.status)}</span
                                >
                            </div>
                            <div
                                class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-base-content/55"
                            >
                                <span>{$_("admin_direct_mm_nonce")}: {execution.nonce}</span>
                                <span>{$_("admin_direct_mm_updated")}: {formatTime(execution.updatedAt)}</span>
                                <span>{$_("admin_direct_mm_confirmations")}: {execution.confirmationCount || 0}/{execution.requiredConfirmations}</span>
                                <span>{$_("admin_direct_mm_gas")}: {execution.effectiveGasCost || $_("admin_direct_mm_na")}</span>
                                <span class="col-span-2 font-mono" title={execution.txHash || ""}
                                    >tx: {shortId(execution.txHash)}</span
                                >
                                {#if execution.manualReviewReason}
                                    <span class="col-span-2 text-error"
                                        >{labelize(execution.manualReviewReason)}</span
                                    >
                                {/if}
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>

            <div class="rounded-xl border border-base-300">
                <div class="border-b border-base-300 px-3 py-2">
                    <span class="text-xs font-bold text-base-content"
                        >{$_("admin_direct_mm_lp_positions")}</span
                    >
                </div>
                {#if runtime.lpPositions.length === 0}
                    <div class="px-3 py-5 text-center">
                        <span class="text-xs text-base-content/40"
                            >{$_("admin_direct_mm_no_lp_positions")}</span
                        >
                    </div>
                {:else}
                    {#each runtime.lpPositions as position}
                        <div class="border-b border-base-300/60 px-3 py-3 last:border-0">
                            <div class="flex items-center justify-between gap-3">
                                <span
                                    class="truncate font-mono text-[11px] text-base-content"
                                    title={position.positionTokenId}
                                    >#{position.positionTokenId}</span
                                >
                                <span
                                    class="rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize {statusTone[
                                        position.status
                                    ] || 'bg-base-content/5 text-base-content/60'}"
                                    >{labelize(position.status)}</span
                                >
                            </div>
                            <div
                                class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-base-content/55"
                            >
                                <span>{$_("admin_direct_mm_liquidity")}: {position.liquidity}</span>
                                <span>{$_("admin_direct_mm_fee_tier")}: {position.feeTier}</span>
                                <span>{$_("admin_direct_mm_tick_range")}: {position.tickLower} / {position.tickUpper}</span>
                                <span>{$_("admin_direct_mm_updated")}: {formatTime(position.updatedAt)}</span>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>

            <div class="rounded-xl border border-base-300">
                <div class="border-b border-base-300 px-3 py-2">
                    <span class="text-xs font-bold text-base-content"
                        >{$_("admin_direct_mm_ledger_facts")}</span
                    >
                </div>
                {#if runtime.ledgerFacts.length === 0}
                    <div class="px-3 py-5 text-center">
                        <span class="text-xs text-base-content/40"
                            >{$_("admin_direct_mm_no_ledger_facts")}</span
                        >
                    </div>
                {:else}
                    {#each runtime.ledgerFacts as fact}
                        <div
                            class="flex items-center justify-between gap-3 border-b border-base-300/60 px-3 py-2.5 last:border-0"
                        >
                            <div class="min-w-0">
                                <span class="block text-xs font-semibold capitalize text-base-content"
                                    >{labelize(fact.type)}</span
                                >
                                <span class="block truncate text-[10px] text-base-content/45"
                                    >{fact.assetId} / {labelize(fact.refType)}</span
                                >
                            </div>
                            <span class="shrink-0 font-mono text-[11px] text-base-content"
                                >{fact.amount}</span
                            >
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    {/if}
</OrderDetailSubShell>
