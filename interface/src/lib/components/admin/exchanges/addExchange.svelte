<script lang="ts">
  import clsx from "clsx";
  import { _ } from "svelte-i18n";
  import { toast } from "svelte-sonner";
  import { invalidate } from "$app/navigation";
  import {
    addExchange,
    getCcxtExchangeDetails,
  } from "$lib/helpers/mrm/admin/growdata";

  export let allCcxtExchanges: string[] = [];
  export let existingExchanges: {
    exchange_id: string;
    name: string;
    icon_url?: string;
    enable: boolean;
  }[] = [];

  let AddNewName = "";
  let AddNewExchangeId = "";
  let AddNewIconUrl = "";

  let addDialogEl: HTMLDialogElement | null = null;
  let isAdding = false;
  let isDropdownOpen = false;

  $: existingExchangeIds = new Set(
    existingExchanges.map((exchange) => exchange.exchange_id.toLowerCase()),
  );

  async function AddExchange(
    name: string,
    exchangeId: string,
    iconUrl: string,
  ) {
    if (!name || !exchangeId) return;
    if (existingExchangeIds.has(exchangeId.toLowerCase())) {
      toast.error($_("exchange_already_added"));
      return;
    }
    isAdding = true;
    const token = localStorage.getItem("admin-access-token");
    if (!token) {
      isAdding = false;
      return;
    }
    await addExchange(
      { name, exchange_id: exchangeId, icon_url: iconUrl },
      token,
    );
    setTimeout(() => {
      invalidate("admin:settings:exchanges").finally(() => {
        isAdding = false;
        closeDialog();
      });
    }, getRandomDelay());
  }

  const cleanUpStates = () => {
    isAdding = false;
    isDropdownOpen = false;
    AddNewName = "";
    AddNewExchangeId = "";
    AddNewIconUrl = "";
  };

  function openDialog() {
    addDialogEl?.showModal();
  }

  function closeDialog() {
    addDialogEl?.close();
  }

  function getRandomDelay() {
    return Math.floor(Math.random() * (3000 - 2000 + 1)) + 2000;
  }

  function handleClickOutside(event: MouseEvent) {
    if (isDropdownOpen) {
      const target = event.target as HTMLElement;
      if (!target.closest(".dropdown")) {
        isDropdownOpen = false;
      }
    }
  }
</script>

<svelte:window on:click={handleClickOutside} />

<button
  type="button"
  class="btn btn-primary gap-2 shadow-lg hover:shadow-primary/20 transition-all"
  on:click={openDialog}
>
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="2"
      stroke="currentColor"
      class="w-4 h-4"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 4.5v15m7.5-7.5h-15"
      />
    </svg>
    {$_("add_exchange")}
  </button>

<dialog
  bind:this={addDialogEl}
  class="modal modal-bottom sm:modal-middle backdrop-blur-sm"
  on:close={cleanUpStates}
>
  <div
    class="modal-box w-full sm:max-w-[32rem] rounded-t-3xl sm:rounded-box space-y-3 pt-0 px-0 max-h-[88vh] overflow-y-auto"
  >
    <div class="sticky top-0 bg-base-100 z-10">
      <div class="mx-auto mt-2 mb-2 h-1 w-10 rounded-full bg-base-content/20 sm:hidden"></div>
      <div class="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-base-200">
        <h3 class="font-semibold text-base sm:text-lg">{$_("add_new_exchange")}</h3>
        <button
          type="button"
          class="btn btn-sm btn-circle btn-ghost"
          on:click={closeDialog}
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="px-4 sm:px-6 pb-5 flex flex-col gap-4">
      <div class="form-control w-full">
        <span class="label">
          <span class="label-text font-medium">{$_("exchange_id")}</span>
          <span class="label-text-alt text-base-content/60">(ccxt id)</span>
        </span>
        <div class="dropdown w-full" class:dropdown-open={isDropdownOpen}>
          <input
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            placeholder={$_("placeholder_exchange_id")}
            bind:value={AddNewExchangeId}
            on:focus={() => (isDropdownOpen = true)}
            on:input={() => (isDropdownOpen = true)}
          />
          {#if isDropdownOpen && allCcxtExchanges.filter((e) => e
                .toLowerCase()
                .includes(AddNewExchangeId.toLowerCase()) &&
                !existingExchangeIds.has(e.toLowerCase())).length > 0}
            <ul
              class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full max-h-60 overflow-y-auto block z-[50] mt-1 border border-base-200"
            >
              {#each allCcxtExchanges.filter((e) => e
                  .toLowerCase()
                  .includes(AddNewExchangeId.toLowerCase()) &&
                  !existingExchangeIds.has(e.toLowerCase())) as exchangeId}
                <li>
                  <button
                    type="button"
                    class="w-full text-left"
                    on:click={async () => {
                      AddNewExchangeId = exchangeId;
                      isDropdownOpen = false;

                      // Auto-fill name (Always override)
                      AddNewName =
                        AddNewExchangeId.charAt(0).toUpperCase() +
                        AddNewExchangeId.slice(1);

                      // Auto-fill icon (Always override)
                      try {
                        const token =
                          localStorage.getItem("admin-access-token");
                        if (token) {
                          const details = await getCcxtExchangeDetails(
                            AddNewExchangeId,
                            token,
                          );
                          if (details.urls && details.urls.logo) {
                            AddNewIconUrl = details.urls.logo;
                          }
                        }
                      } catch (e) {
                        console.error("Failed to load exchange details", e);
                      }
                    }}
                  >
                    {exchangeId}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
      <div class="form-control w-full">
        <span class="label">
          <span class="label-text font-medium">{$_("display_name")}</span>
        </span>
        <input
          type="text"
          class="input input-bordered w-full focus:input-primary transition-all"
          placeholder={$_("placeholder_exchange_name")}
          bind:value={AddNewName}
        />
      </div>
      <div class="form-control w-full">
        <span class="label">
          <span class="label-text font-medium">{$_("icon_url")}</span>
        </span>
        <input
          type="text"
          class="input input-bordered w-full focus:input-primary transition-all"
          placeholder={$_("placeholder_url")}
          bind:value={AddNewIconUrl}
        />
        {#if AddNewIconUrl}
          <div class="mt-2">
            <div class="rounded-xl">
              <img
                src={AddNewIconUrl}
                alt="Preview"
                on:error={(e) => {
                  const target = e.currentTarget;
                  if (target instanceof HTMLImageElement) {
                    target.style.display = "none";
                  }
                }}
                on:load={(e) => {
                  const target = e.currentTarget;
                  if (target instanceof HTMLImageElement) {
                    target.style.display = "block";
                  }
                }}
              />
            </div>
          </div>
        {/if}
      </div>
      <button
        class="btn btn-primary w-full mt-2"
        on:click={async () => {
          await AddExchange(AddNewName, AddNewExchangeId, AddNewIconUrl);
        }}
      >
        <span class={clsx(isAdding && "loading loading-spinner loading-sm")}>
          {$_("add_exchange")}
        </span>
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="Close">close</button>
  </form>
</dialog>
