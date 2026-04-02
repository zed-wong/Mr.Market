<script lang="ts">
  import ExchangeIcon from "$lib/components/common/exchangeIcon.svelte";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";

  export let apiKeys: AdminSingleKey[] = [];
</script>

<div class="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200/50 flex flex-col h-full">
  <div class="flex items-center justify-between mb-2">
    <h2 class="text-[1.1rem] font-bold text-base-content">
      Exchange API Keys
    </h2>
    <div
      class="text-[#4F39F6] cursor-pointer bg-transparent hover:bg-[#F1F0FF] p-2 rounded-lg transition-colors"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        ><path d="m9 18 6-6-6-6" /><path d="m15 18-6-6 6-6" /></svg
      >
    </div>
  </div>

  <div class="flex flex-col gap-3 flex-grow mt-2">
    {#each apiKeys as apiKey, i}
      {#if i < 3}
        <div
          class="flex items-center justify-between p-4 rounded-xl bg-[#FCFCFD] border border-[#F1F1F5]"
        >
          <div class="flex items-center gap-4">
            <div
              class="w-10 h-10 bg-white rounded-full shadow-sm flex items-center justify-center border border-gray-100"
            >
              <ExchangeIcon
                exchangeName={apiKey.exchange}
                clazz="w-5 h-5"
              />
            </div>
            <div class="flex flex-col">
              <span class="font-bold text-sm text-base-content"
                >{apiKey.exchange} {apiKey.name}</span
              >
              <span class="text-xs text-base-content/50">
                {#if i === 0}
                  Trading Active • 4 Pairs
                {:else if i === 1}
                  Last sync 2m ago
                {:else}
                  Key expired
                {/if}
              </span>
            </div>
          </div>
          <div>
            {#if i === 2}
              <div
                class="bg-[#FFEFEF] text-[#D83232] text-[10px] font-bold px-3 py-1 rounded border border-[#FFDADA] tracking-wide uppercase"
              >
                Disconnected
              </div>
            {:else}
              <div
                class="bg-[#E5F9E3] text-[#1CAD48] text-[10px] font-bold px-3 py-1 rounded border border-[#CFF0CF] tracking-wide uppercase"
              >
                Connected
              </div>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
    {#if apiKeys.length === 0}
      <div class="text-center text-sm text-base-content/50 my-auto">
        No API keys found
      </div>
    {/if}
  </div>

  <button
    class="w-full mt-4 py-3 rounded-xl bg-[#F4F2FF] text-[#4F39F6] font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#EAE7FF] transition-colors border-none"
    on:click={() => window.open("/manage/settings/api-keys", "_blank")}
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
      ><path d="M5 12h14" /><path d="M12 5v14" /></svg
    >
    Manage API Connections
  </button>
</div>
