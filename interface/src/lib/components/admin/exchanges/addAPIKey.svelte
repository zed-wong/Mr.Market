<script lang="ts">
  import clsx from "clsx";
  import { _ } from "svelte-i18n";
  import { invalidate } from "$app/navigation";
  import {
    addAPIKey,
    getEncryptionPublicKey,
  } from "$lib/helpers/mrm/admin/exchanges";
  import { getAllCcxtExchanges } from "$lib/helpers/mrm/admin/growdata";
  import { encryptSecret } from "$lib/helpers/encryption/crypto";
  import { onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import type { AdminSingleKey } from "$lib/types/hufi/admin";

  let allCcxtExchanges: string[] = [];
  export let existingKeys: AdminSingleKey[] = [];

  let AddNewExchange = "";
  let AddNewName = "";
  let AddNewApiKey = "";
  let AddNewApiSecret = "";
  let publicKey = "";
  let encryptionError = "";

  let addDialogEl: HTMLDialogElement | null = null;
  let isAdding = false;
  let isDropdownOpen = false;

  $: existingKeyPairs = new Set(
    existingKeys.map(
      (key) => `${key.exchange.toLowerCase()}:${key.api_key}`,
    ),
  );

  async function AddAPIKey(
    exchange: string,
    name: string,
    api_key: string,
    api_secret: string,
  ) {
    if (!exchange || !name || !api_key || !api_secret) return;
    if (existingKeyPairs.has(`${exchange.toLowerCase()}:${api_key}`)) {
      toast.error($_("api_key_already_added"));
      return;
    }
    isAdding = true;
    const token = localStorage.getItem("admin-access-token");
    if (!token) {
      isAdding = false;
      return;
    }

    if (!publicKey) {
      encryptionError = $_("encryption_key_error");
      isAdding = false;
      return;
    }

    try {
      const encryptedSecret = await encryptSecret(api_secret, publicKey);
      if (!encryptedSecret) {
        encryptionError = $_("encryption_failed");
        isAdding = false;
        return;
      }

      await addAPIKey(
        { exchange, name, api_key, api_secret: encryptedSecret },
        token,
      );
    } catch (e: any) {
      console.error(e);
      encryptionError = e.message || $_("add_key_failed");
      isAdding = false;
      return;
    }
    toast.success($_("success"));
    setTimeout(() => {
      invalidate("admin:settings:api-keys").finally(() => {
        isAdding = false;
        closeDialog();
      });
    }, getRandomDelay());
  }

  const cleanUpStates = () => {
    isAdding = false;
    isDropdownOpen = false;
    encryptionError = "";
    AddNewExchange = "";
    AddNewName = "";
    AddNewApiKey = "";
    AddNewApiSecret = "";
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

  onMount(async () => {
    const token = localStorage.getItem("admin-access-token");
    if (!token) return;
    try {
      allCcxtExchanges = await getAllCcxtExchanges(token);
      const res = await getEncryptionPublicKey(token);
      publicKey = res.publicKey;
    } catch (e) {
      console.error(e);
    }
  });
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
    {$_("add_api_key")}
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
        <h3 class="font-semibold text-base sm:text-lg">{$_("add_new_api_key")}</h3>
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
          <span class="label-text font-medium">{$_("exchange")}</span>
        </span>
        <div class="dropdown w-full" class:dropdown-open={isDropdownOpen}>
          <input
            type="text"
            class="input input-bordered w-full focus:input-primary transition-all"
            placeholder={$_("placeholder_exchange_id")}
            bind:value={AddNewExchange}
            on:focus={() => (isDropdownOpen = true)}
            on:input={() => (isDropdownOpen = true)}
          />
          {#if isDropdownOpen && allCcxtExchanges.filter((e) => e
                .toLowerCase()
                .includes(AddNewExchange.toLowerCase())).length > 0}
            <ul
              class="dropdown-content menu p-2 shadow bg-base-100 rounded-box w-full max-h-60 overflow-y-auto block z-[50] mt-1 border border-base-200"
            >
              {#each allCcxtExchanges.filter((e) => e
                  .toLowerCase()
                  .includes(AddNewExchange.toLowerCase())) as exchangeId}
                <li>
                  <button
                    type="button"
                    class="w-full text-left"
                    on:click={() => {
                      AddNewExchange = exchangeId;
                      isDropdownOpen = false;
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
          placeholder={$_("placeholder_key_name")}
          bind:value={AddNewName}
        />
      </div>
      <div class="form-control w-full">
        <span class="label">
          <span class="label-text font-medium">{$_("api_key")}</span>
        </span>
        <input
          type="text"
          class="input input-bordered w-full focus:input-primary transition-all"
          placeholder={$_("placeholder_api_key")}
          bind:value={AddNewApiKey}
        />
      </div>
      <div class="form-control w-full">
        <span class="label">
          <span class="label-text font-medium">{$_("api_secret")}</span>
        </span>
        <input
          type="password"
          class="input input-bordered w-full focus:input-primary transition-all"
          placeholder={$_("placeholder_api_secret")}
          bind:value={AddNewApiSecret}
        />
        <div class="label mt-2">
          <span class="label-text-alt text-base-content/60 text-xs">
            {$_("api_secret_note")}
          </span>
        </div>
      </div>

      {#if encryptionError}
        <div class="alert alert-error shadow-lg my-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span class="break-all">{encryptionError}</span>
        </div>
      {/if}
      <button
        class="btn btn-primary w-full mt-2"
        on:click={async () => {
          await AddAPIKey(
            AddNewExchange,
            AddNewName,
            AddNewApiKey,
            AddNewApiSecret,
          );
        }}
        disabled={isAdding}
      >
        <span class={clsx(isAdding && "loading loading-spinner loading-sm")}>
          {$_("add_api_key")}
        </span>
      </button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop">
    <button aria-label="Close">close</button>
  </form>
</dialog>
