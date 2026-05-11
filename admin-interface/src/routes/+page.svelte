<script lang="ts">
  import { _ } from 'svelte-i18n';
</script>

<section class="space-y-4" data-testid="admin-dashboard-shell">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-3 p-5 md:p-6">
      <span class="text-base-content/60 text-sm capitalize">{$_('admin.nav.dashboard')}</span>
      <span class="text-2xl font-bold text-base-content md:text-3xl capitalize">
        {$_('admin.dashboard_overview')}
      </span>
      <span class="text-base-content/70">
        {$_('admin.dashboard_subtitle')}
      </span>
    </div>
  </div>
</section>
