<script>
  import { goto } from "$app/navigation";
  import { _ } from "svelte-i18n";
</script>

<div class="flex flex-col gap-4 justify-center items-center min-h-[calc(100vh-4rem)] px-4 text-center">
  <span class="text-2xl md:text-3xl font-bold">{$_("welcome_to_admin_panel")}</span>
  <button
    class="btn"
    on:click={() => {
      goto("/manage/settings");
    }}
    >
    {$_("settings")}
  </button>
</div>
