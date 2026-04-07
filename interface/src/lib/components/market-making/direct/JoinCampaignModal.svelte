<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { formatCampaignType } from "./helpers";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";

  export let show = false;
  export let isJoiningCampaign = false;
  export let apiKeys: AdminSingleKey[] = [];
  export let campaign: Record<string, unknown> = {};

  export let joinCampaignApiKeyId = "";
  export let joinCampaignEvmAddress = "";

  export let onConfirm: () => void;
  export let onCancel: () => void;

  $: campaignName = String(
    campaign.symbol || campaign.name || $_("admin_direct_mm_title"),
  );
  $: campaignType = formatCampaignType(campaign.type || campaign.campaignType);
  $: status = String(campaign.status || "active");
  $: exchange = String(
    campaign.exchange_name || campaign.exchange || $_("admin_direct_mm_na"),
  );
  $: readOnlyKeys = apiKeys.filter(k => k.permissions === 'read');

  function statusColor(s: string): string {
    switch (s.toLowerCase()) {
      case "active":
        return "text-success";
      case "ended":
      case "closed":
        return "text-error";
      default:
        return "text-warning";
    }
  }

  function statusDot(s: string): string {
    switch (s.toLowerCase()) {
      case "active":
        return "bg-success";
      case "ended":
      case "closed":
        return "bg-error";
      default:
        return "bg-warning";
    }
  }

  async function copyAddress() {
    if (!joinCampaignEvmAddress) return;
    await navigator.clipboard.writeText(joinCampaignEvmAddress);
    toast.success($_("copied"));
  }
</script>

<svelte:window on:keydown={(e) => show && e.key === 'Escape' && onCancel()} />

{#if show}
  <div class="modal modal-open bg-black/25 backdrop-blur-sm">
    <div
      class="modal-box max-w-[440px] overflow-hidden rounded-[28px] border border-base-200/60 bg-base-100 p-0 shadow-2xl"
    >
      <div class="bg-primary/5 px-7 pb-6 pt-7">
        <div class="flex items-start justify-between">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              class="size-6"
            >
              <circle cx="12" cy="12" r="9" class="fill-primary" />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M12 9v6m3-3H9"
                class="stroke-base-100 fill-none"
              />
            </svg>
          </div>
          <button
            class="btn btn-ghost btn-sm btn-circle text-base-content/50"
            on:click={onCancel}>x</button
          >
        </div>

        <div class="mt-5 flex flex-col gap-2">
          <span class="text-[1.7rem] font-bold leading-tight text-base-content">
            {campaignName}
          </span>
          <div class="flex items-center gap-2">
            <span class={`h-2 w-2 rounded-full ${statusDot(status)}`}></span>
            <span
              class={`text-[11px] font-bold tracking-wider capitalize ${statusColor(status)}`}
            >
              {status}
            </span>
          </div>
        </div>
      </div>

      <div class="px-7 pb-7 pt-6">
        <span class="block text-sm leading-7 text-base-content/70">
          You are about to join
          <span class="font-semibold text-primary"
            >{campaignName} {campaignType}</span
          >
          campaign{exchange !== $_("admin_direct_mm_na")
            ? ` on ${exchange}`
            : ""}.
        </span>

        <div class="mt-6 flex flex-col gap-4">
          <label class="form-control w-full">
            <span class="mb-2 text-xs font-semibold text-base-content/70">
              {$_("admin_direct_mm_evm_address")}
            </span>
            <div
              class="flex min-h-[48px] items-center gap-2 rounded-xl bg-primary/5 px-4"
            >
              <span
                class="flex-1 truncate font-mono text-sm text-base-content/85"
              >
                {joinCampaignEvmAddress ||
                  $_("admin_direct_mm_evm_address_placeholder")}
              </span>
              {#if joinCampaignEvmAddress}
                <button
                  class="btn btn-ghost btn-sm btn-circle h-8 min-h-8 w-8 text-primary"
                  on:click={copyAddress}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="size-4"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                    />
                  </svg>
                </button>
              {/if}
            </div>
          </label>

          <label class="form-control w-full">
            <span class="mb-2 text-xs font-semibold text-base-content/70">
              {$_("admin_direct_mm_api_key")}
            </span>
            <select
              class="select select-bordered min-h-[40px] w-full bg-base-100 text-base-content focus:outline-none focus:border-primary"
              bind:value={joinCampaignApiKeyId}
            >
              <option value="">{$_("admin_direct_mm_select_api_key")}</option>
              {#each readOnlyKeys as apiKey}
                <option value={apiKey.key_id}>
                  {apiKey.name} · {apiKey.exchange}
                </option>
              {/each}
            </select>
            {#if readOnlyKeys.length === 0 && apiKeys.length > 0}
              <span class="mt-1 text-xs text-warning">
                {$_("no_read_only_keys_hint")}
              </span>
            {/if}
          </label>
        </div>

        <div class="mt-7 flex items-center justify-end gap-4">
          <button
            class="btn btn-ghost px-5 font-semibold text-base-content"
            on:click={onCancel}
          >
            {$_("admin_direct_mm_cancel")}
          </button>
          <button
            class="btn btn-primary gap-2 px-6 font-semibold text-white"
            disabled={isJoiningCampaign}
            on:click={onConfirm}
          >
            <span
              >{isJoiningCampaign
                ? $_("admin_direct_mm_joining")
                : $_("admin_direct_mm_join_now")}</span
            >
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
