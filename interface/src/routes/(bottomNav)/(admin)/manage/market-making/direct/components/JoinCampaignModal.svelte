<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";

  export let show = false;
  export let isJoiningCampaign = false;
  export let apiKeys: AdminSingleKey[] = [];

  export let joinCampaignApiKeyId = "";
  export let joinCampaignEvmAddress = "";

  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

{#if show}
  <div class="modal modal-open">
    <div class="modal-box">
      <div class="flex flex-col gap-3">
        <span class="text-lg font-semibold text-base-content"
          >{$_("admin_direct_mm_join_campaign_title")}</span
        >
        <label class="form-control w-full">
          <span class="label-text text-base-content"
            >{$_("admin_direct_mm_evm_address")}</span
          >
          <input
            class="input input-bordered"
            bind:value={joinCampaignEvmAddress}
          />
        </label>
        <label class="form-control w-full">
          <span class="label-text text-base-content"
            >{$_("admin_direct_mm_api_key")}</span
          >
          <select
            class="select select-bordered"
            bind:value={joinCampaignApiKeyId}
          >
            <option value="">{$_("admin_direct_mm_select_api_key")}</option>
            {#each apiKeys as apiKey}
              <option value={apiKey.key_id}
                >{apiKey.name} · {apiKey.exchange} · {apiKey.exchange_index}</option
              >
            {/each}
          </select>
        </label>
        <div class="modal-action">
          <button
            class="btn btn-ghost"
            on:click={onCancel}
          >
            <span>{$_("admin_direct_mm_cancel")}</span>
          </button>
          <button
            class="btn btn-primary"
            disabled={isJoiningCampaign}
            on:click={onConfirm}
          >
            <span
              >{isJoiningCampaign
                ? $_("admin_direct_mm_joining")
                : $_("admin_direct_mm_join")}</span
            >
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
