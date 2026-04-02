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
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <path d="M22.0049 6.99979H23.0049V16.9998H22.0049V19.9998C22.0049 20.5521 21.5572 20.9998 21.0049 20.9998H3.00488C2.4526 20.9998 2.00488 20.5521 2.00488 19.9998V3.99979C2.00488 3.4475 2.4526 2.99979 3.00488 2.99979H21.0049C21.5572 2.99979 22.0049 3.4475 22.0049 3.99979V6.99979ZM20.0049 16.9998H14.0049C11.2435 16.9998 9.00488 14.7612 9.00488 11.9998C9.00488 9.23836 11.2435 6.99979 14.0049 6.99979H20.0049V4.99979H4.00488V18.9998H20.0049V16.9998ZM21.0049 14.9998V8.99979H14.0049C12.348 8.99979 11.0049 10.3429 11.0049 11.9998C11.0049 13.6566 12.348 14.9998 14.0049 14.9998H21.0049ZM14.0049 10.9998H17.0049V12.9998H14.0049V10.9998Z"></path>
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

  <div class="flex items-center gap-2 text-xs text-base-content/60 lg:justify-end">
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
