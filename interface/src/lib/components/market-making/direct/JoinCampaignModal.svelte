<script lang="ts">
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
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
  $: campaignType = String(
    campaign.type || campaign.campaignType || "Market Making",
  );
  $: status = String(campaign.status || "active");
  $: exchange = String(
    campaign.exchange_name || campaign.exchange || $_("admin_direct_mm_na"),
  );

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

{#if show}
  <div class="modal modal-open bg-black/25 backdrop-blur-sm">
    <div
      class="modal-box max-w-[440px] overflow-hidden rounded-[28px] border border-base-200/60 bg-base-100 p-0 shadow-2xl"
    >
      <div class="bg-primary/5 px-7 pb-6 pt-7">
        <div class="flex items-start justify-between">
          <div
            class="flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M8.5 7A5.5 5.5 0 0 1 18 10.5" />
              <path d="M15.5 17A5.5 5.5 0 0 1 6 13.5" />
              <path d="M17 5.5v5h-5" />
              <path d="M7 18.5v-5h5" />
              <path d="M12 8.75v6.5" />
              <path d="M9.75 11h4.5" />
            </svg>
          </div>
          <button
            class="btn btn-ghost btn-sm btn-circle text-base-content/50"
            on:click={onCancel}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="h-4 w-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="mt-5 flex flex-col gap-2">
          <span class="text-[1.7rem] font-bold leading-tight text-base-content">
            {campaignName}
          </span>
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full {statusDot(status)}"></span>
            <span
              class="text-[11px] font-bold tracking-wider capitalize {statusColor(
                status,
              )}"
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
            : ""}. Please review the campaign parameters before proceeding.
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
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
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
              {#each apiKeys as apiKey}
                <option value={apiKey.key_id}>
                  <span>
                    {apiKey.name}
                  </span>
                  <span class="capitalize">
                    · {apiKey.exchange}
                  </span>
                </option>
              {/each}
            </select>
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
            {#if !isJoiningCampaign}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="h-4 w-4"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                />
              </svg>
            {/if}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
