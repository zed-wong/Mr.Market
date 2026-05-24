<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { toast } from 'svelte-sonner';

  import PageHeader from '$lib/components/admin/shared/PageHeader.svelte';
  import {
    listPasskeys,
    deletePasskey,
    registerPasskey,
    type PasskeyCredential,
  } from '$lib/helpers/api/auth';

  let passkeys = $state<PasskeyCredential[]>([]);
  let loading = $state(true);
  let registering = $state(false);
  let revokingId = $state<string | null>(null);
  let error = $state<string | null>(null);

  const fmtDate = (iso: string) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  };

  const shortId = (id: string) =>
    id.length <= 14 ? id : `${id.slice(0, 6)}…${id.slice(-6)}`;

  async function refresh() {
    loading = true;
    error = null;
    try {
      passkeys = await listPasskeys();
    } catch (err) {
      console.error('Failed to load passkeys', err);
      error = String(err instanceof Error ? err.message : err);
    } finally {
      loading = false;
    }
  }

  async function handleRegister() {
    if (registering) return;
    registering = true;
    try {
      await registerPasskey();
      toast.success($_('admin.passkey_registration_success'));
      await refresh();
    } catch (err) {
      console.error('Passkey registration failed', err);
      toast.error($_('admin.passkey_registration_failed'));
    } finally {
      registering = false;
    }
  }

  async function handleRevoke(credentialId: string) {
    if (revokingId) return;
    if (!confirm($_('admin.passkey_revoke_confirm'))) return;
    revokingId = credentialId;
    try {
      await deletePasskey(credentialId);
      toast.success($_('admin.passkey_revoked'));
      await refresh();
    } catch (err) {
      console.error('Failed to revoke passkey', err);
      toast.error($_('admin.passkey_revoke_failed'));
    } finally {
      revokingId = null;
    }
  }

  async function copyId(id: string) {
    try {
      await navigator.clipboard.writeText(id);
      toast.success($_('admin.passkey_id_copied'));
    } catch {
      /* ignore */
    }
  }

  onMount(() => {
    void refresh();
  });

  let stats = $derived({
    total: passkeys.length,
    used: passkeys.filter((p) => p.counter > 0).length,
    platform: passkeys.filter((p) =>
      (p.transports || []).some((t) => t === 'internal' || t === 'hybrid'),
    ).length,
    security: passkeys.filter((p) =>
      (p.transports || []).some((t) => t === 'usb' || t === 'nfc' || t === 'ble'),
    ).length,
  });
</script>

<section class="space-y-6">
  <PageHeader
    eyebrow="system"
    title={$_('admin.nav.passkeys')}
    subtitle={$_('admin.passkeys_subtitle')}
  >
    {#snippet actions()}
      <button
        type="button"
        class="btn btn-ghost btn-sm rounded-full capitalize"
        onclick={() => void refresh()}
        disabled={loading}
      >
        {#if loading}
          <span class="loading loading-spinner loading-xs"></span>
        {/if}
        <span>{$_('refresh')}</span>
      </button>
    {/snippet}
  </PageHeader>

  <!-- KPI row -->
  <div class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin.passkey_kpi_total')}</span>
        <span class="font-mono text-2xl font-semibold">{stats.total}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin.passkey_kpi_used')}</span>
        <span class="font-mono text-2xl font-semibold text-success">{stats.used}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin.passkey_kpi_platform')}</span>
        <span class="font-mono text-2xl font-semibold">{stats.platform}</span>
      </div>
    </div>
    <div class="card border border-base-300 bg-base-100 shadow-none">
      <div class="card-body gap-1 p-4">
        <span class="text-xs text-base-content/60 capitalize">{$_('admin.passkey_kpi_security_keys')}</span>
        <span class="font-mono text-2xl font-semibold">{stats.security}</span>
      </div>
    </div>
  </div>

  <div class="card border border-base-300 bg-base-100 shadow-none">
    <div class="card-body gap-4 p-5">
      {#if error}
        <div class="rounded-md border border-error/40 bg-error/5 p-3 text-sm text-error">
          {error}
        </div>
      {/if}

      {#if loading && passkeys.length === 0}
        <div class="flex items-center justify-center py-12">
          <span class="loading loading-spinner loading-md"></span>
        </div>
      {:else if passkeys.length === 0}
        <div class="flex flex-col items-center gap-2 py-12 text-center">
          <span class="text-sm text-base-content/60">{$_('admin.passkey_empty')}</span>
          <button
            type="button"
            class="btn btn-ghost btn-sm rounded-full capitalize"
            onclick={handleRegister}
            disabled={registering}
          >
            <span>{$_('admin.register_passkey')}</span>
          </button>
        </div>
      {:else}
        <div class="overflow-x-auto">
          <table class="table table-sm">
            <thead>
              <tr class="border-b border-base-300 text-xs uppercase tracking-wide text-base-content/50">
                <th class="font-medium">{$_('admin.passkey_col_id')}</th>
                <th class="font-medium">{$_('admin.passkey_col_transports')}</th>
                <th class="font-medium text-right">{$_('admin.passkey_col_counter')}</th>
                <th class="font-medium">{$_('admin.passkey_col_created')}</th>
                <th class="font-medium">{$_('admin.passkey_col_last_used')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each passkeys as p (p.credentialId)}
                <tr class="border-b border-base-300 hover:bg-neutral">
                  <td>
                    <button
                      type="button"
                      class="font-mono text-xs text-base-content/80 hover:text-base-content"
                      onclick={() => void copyId(p.credentialId)}
                      title={p.credentialId}
                    >
                      {shortId(p.credentialId)}
                    </button>
                  </td>
                  <td>
                    <div class="flex flex-wrap items-center gap-1">
                      {#if p.transports && p.transports.length > 0}
                        {#each p.transports as t (t)}
                          <span class="rounded-full bg-base-200 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-base-content/70">
                            {t}
                          </span>
                        {/each}
                      {:else}
                        <span class="text-xs text-base-content/40">—</span>
                      {/if}
                    </div>
                  </td>
                  <td class="text-right font-mono text-sm text-base-content/80">{p.counter}</td>
                  <td class="font-mono text-xs text-base-content/70">{fmtDate(p.createdAt)}</td>
                  <td class="font-mono text-xs text-base-content/70">{fmtDate(p.updatedAt)}</td>
                  <td class="text-right">
                    <button
                      type="button"
                      class="btn btn-ghost btn-xs rounded-full text-error hover:bg-error/10"
                      onclick={() => void handleRevoke(p.credentialId)}
                      disabled={revokingId === p.credentialId}
                    >
                      {#if revokingId === p.credentialId}
                        <span class="loading loading-spinner loading-xs"></span>
                      {:else}
                        <span class="capitalize">{$_('admin.passkey_revoke')}</span>
                      {/if}
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</section>
