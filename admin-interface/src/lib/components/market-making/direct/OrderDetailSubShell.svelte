<script lang="ts">
    import { _ } from "svelte-i18n";

    export let title: string;
    export let onBack: () => void;
    export let onClose: () => void;
</script>

<div
    class="modal-box bg-base-100 p-0 rounded-2xl max-w-140 shadow-2xl border border-base-300 max-h-[90vh] overflow-y-auto"
>
    <div class="px-7 pt-6 pb-4 flex items-center justify-between gap-3">
        <button
            class="flex items-center gap-1.5 text-base-content/60 hover:text-base-content transition-colors"
            on:click={onBack}
            aria-label={$_("admin_direct_mm_back_to_overview")}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <path d="m15 18-6-6 6-6" />
            </svg>
            <span class="text-xs font-semibold capitalize"
                >{$_("admin_direct_mm_back_to_overview")}</span
            >
        </button>
        <span class="truncate text-sm font-bold text-base-content">{title}</span>
        <button
            class="btn btn-sm btn-circle btn-ghost text-base-content/50 hover:bg-base-200"
            on:click={onClose}
            aria-label={$_("admin_direct_mm_close")}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="w-5 h-5"
            >
                <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                />
            </svg>
        </button>
    </div>
    <div class="px-7 pb-7">
        <slot />
    </div>
</div>
