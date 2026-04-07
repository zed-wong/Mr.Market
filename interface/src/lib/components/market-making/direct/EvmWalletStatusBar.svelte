<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";

  export let evmAddress = "";
  export let hasWalletConfigured = false;
  export let hint = "";

  function shortenAddress(address: string): string {
    if (!address) return "";
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  async function copyAddress() {
    if (!evmAddress) return;
    await navigator.clipboard.writeText(evmAddress);
    toast.success($_("copied"));
  }
</script>

<div
  class="bg-base-100 rounded-2xl border border-base-200/50 shadow-sm px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
>
  <div class="flex items-center gap-3 min-w-0">
    <div
      class="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
        />
      </svg>
    </div>

    <div class="flex items-center gap-3 min-w-0 flex-wrap">
      <span class="text-sm font-semibold text-base-content">
        {$_("admin_direct_mm_wallet_status_title")}
      </span>
      <span
        class="px-2 py-1 rounded-md text-[10px] font-bold border capitalize {hasWalletConfigured
          ? 'bg-success/10 text-success border-success/20'
          : 'bg-warning/10 text-warning border-warning/20'}"
      >
        {hasWalletConfigured
          ? $_("admin_direct_mm_wallet_status_loaded")
          : $_("admin_direct_mm_wallet_status_missing")}
      </span>

      {#if evmAddress}
        <button
          class="btn btn-ghost btn-sm h-8 min-h-8 px-2 rounded-lg gap-2 normal-case"
          on:click={copyAddress}
        >
          <span class="font-mono text-xs text-base-content">
            {shortenAddress(evmAddress)}
          </span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  <div
    class="flex items-center gap-2 text-xs text-base-content/60 lg:justify-end"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="shrink-0"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
    <span>{hint}</span>
  </div>
</div>
