<script>
  import { onMount } from "svelte";
  import { _ } from "svelte-i18n";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { correct } from "$lib/stores/admin";
  import Login from "$lib/components/admin/login.svelte";
  import { autoCheckPassword } from "$lib/helpers/mrm/admin";
  import { exit } from "$lib/helpers/mrm/admin";
  import SideBar from "$lib/components/admin/dashboard/sideBar.svelte";

  onMount(() => {
    autoCheckPassword($page.url.pathname);
  });
</script>

<main class="!px-0 !py-0 h-[100vh]">
  {#if $correct}
    <SideBar />
    <div class="lg:hidden sticky top-0 z-30 border-b border-base-200 bg-base-100/95 backdrop-blur px-3 py-2">
      <div class="flex items-center justify-between gap-2">
        <button class="btn btn-ghost btn-sm" on:click={() => goto('/manage')}>
          {$_("admin")}
        </button>
        <div class="flex items-center gap-2">
          <button class="btn btn-ghost btn-sm" on:click={() => goto('/manage/settings')}>
            {$_("settings")}
          </button>
          <button class="btn btn-ghost btn-sm text-error" on:click={() => exit()}>
            {$_("exit")}
          </button>
        </div>
      </div>
    </div>
    <div class="min-h-screen lg:ml-64">
      <slot />
    </div>
  {:else}
    <div class="h-[100vh] flex justify-center items-center">
      <Login />
    </div>
  {/if}
</main>
