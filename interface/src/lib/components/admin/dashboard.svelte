<script lang="ts">
  import { _ } from "svelte-i18n";
  import Users from "$lib/components/admin/dashboard/users.svelte";
  import Stats from "$lib/components/admin/dashboard/stats.svelte";
  import Transactions from "$lib/components/admin/dashboard/transactions.svelte";

  const lastSync = "2m ago";
</script>

<div id="main-content" class="space-y-6" data-testid="admin-dashboard-shell">
  <section class="grid grid-cols-1 xl:grid-cols-12 gap-4">
    <div class="xl:col-span-8 card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-5 md:p-6 gap-4">
        <div class="flex flex-col gap-2">
          <span class="text-base-content/60 text-sm">{$_("dashboard")}</span>
          <span class="text-2xl md:text-3xl font-bold text-base-content">{$_("admin_dashboard_overview")}</span>
          <span class="text-base-content/70">{$_("admin_dashboard_subtitle")}</span>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <a href="/manage/settings" class="btn btn-primary btn-sm md:btn-md">{$_("settings")}</a>
          <a href="/manage/orders" class="btn btn-ghost btn-sm md:btn-md">{$_("orders")}</a>
          <a href="/manage/users" class="btn btn-ghost btn-sm md:btn-md">{$_("users")}</a>
        </div>
      </div>
    </div>

    <div class="xl:col-span-4 card bg-base-100 border border-base-300 shadow-sm">
      <div class="card-body p-5 md:p-6 gap-3">
        <span class="text-base-content/60 text-sm">{$_("admin_system_status")}</span>
        <div class="flex items-center justify-between gap-2">
          <span class="font-semibold text-base-content">{$_("admin_dashboard_live")}</span>
          <span class="badge badge-success badge-outline">{$_("online")}</span>
        </div>
        <div class="divider my-1"></div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-base-content/60">{$_("last_update")}</span>
          <span class="font-medium text-base-content">{lastSync}</span>
        </div>
      </div>
    </div>
  </section>

  <main class="space-y-6 pb-8">
    <div class="flex flex-col space-y-4">
      <Stats />

      <section class="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div class="xl:col-span-8">
          <Transactions />
        </div>
        <div class="xl:col-span-4">
          <Users />
        </div>
      </section>
    </div>
  </main>
</div>
