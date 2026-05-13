<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { walletAddress, walletChainId } from '$lib/stores/wallet';
  import { getChainById } from '$lib/helpers/utils';
  import { logout } from '$lib/helpers/api/auth';
  import { clearAuth } from '$lib/stores/auth';
  import { isAuthed } from '$lib/stores/auth';
  import { setWalletDisconnected } from '$lib/stores/wallet';
  import { goto } from '$app/navigation';

  let chainInfo = $derived($walletChainId ? getChainById($walletChainId) : null);

  const handleSignOut = async () => {
    try {
      await logout();
    } finally {
      clearAuth();
      setWalletDisconnected();
      isAuthed.set(false);
      goto('/login');
    }
  };
</script>

<section class="space-y-4" data-testid="web3-account">
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-3 p-5 md:p-6">
      <span class="text-lg font-bold text-base-content capitalize">{$_('account_title')}</span>
    </div>
  </div>

  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body gap-4 p-5 md:p-6">
      <div>
        <span class="text-sm text-base-content/60 capitalize">{$_('account_address')}</span>
        <div class="mt-1 font-mono text-base-content">{$walletAddress ?? '—'}</div>
      </div>

      <div>
        <span class="text-sm text-base-content/60 capitalize">{$_('account_chain')}</span>
        <div class="mt-1 text-base-content">
          {chainInfo?.name ?? '—'}
        </div>
      </div>

      <div class="divider"></div>

      <div>
        <span class="text-sm text-base-content/60 capitalize">{$_('account_link_mixin')}</span>
        <div class="mt-1">
          <span class="badge badge-ghost capitalize">{$_('account_link_mixin_stub')}</span>
        </div>
      </div>

      <div class="divider"></div>

      <button class="btn btn-error btn-outline w-full capitalize" onclick={handleSignOut}>
        {$_('account_sign_out')}
      </button>
    </div>
  </div>
</section>