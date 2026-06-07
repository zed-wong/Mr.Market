import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { accountBalances, aggregateMockActivityEntries, mockAccountActivityForAccount, mockCampaigns } from '$lib/helpers/mock-web3';
import {
  completeMockDeposit,
  fundingActivityForAccount,
  resetFundingSession,
  restoreFundingSession,
  sessionFundingActivity,
  submitMockWithdrawal,
} from './funding';
import {
  allOrders,
  createMockOrder,
  marketMakingActivityForAccount,
  resetMarketMakingSession,
  restoreMarketMakingSession,
  sessionMarketMakingActivity,
  transitionOrderLifecycle,
} from './market-making';
import {
  connectDemoWallet,
  walletAccount,
  walletAddress,
  walletChainId,
  walletNamespace,
  walletNetwork,
  walletStatus,
} from './wallet';

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

const resetWallet = () => {
  walletStatus.set('disconnected');
  walletAddress.set(null);
  walletNamespace.set(null);
  walletChainId.set(null);
  walletNetwork.set(null);
};

const installSessionStorageMock = () => {
  const storage: Record<string, string> = {};
  const sessionStorageMock = {
    get length() {
      return Object.keys(storage).length;
    },
    clear: () => {
      for (const key of Object.keys(storage)) delete storage[key];
    },
    getItem: (key: string) => storage[key] ?? null,
    key: (index: number) => Object.keys(storage)[index] ?? null,
    removeItem: (key: string) => {
      delete storage[key];
    },
    setItem: (key: string, value: string) => {
      storage[key] = String(value);
    },
  } as Storage;

  Object.defineProperty(globalThis, 'sessionStorage', {
    value: sessionStorageMock,
    configurable: true,
  });

  return storage;
};

describe('responsive browser demo path contract', () => {
  beforeEach(() => {
    resetFundingSession();
    resetMarketMakingSession();
    resetWallet();
  });

  afterEach(() => {
    resetFundingSession();
    resetMarketMakingSession();
    resetWallet();
  });

  it('keeps shared chrome and rows responsive for narrow browser validation', () => {
    const topBarSource = source('../components/topBar/TopBar.svelte');
    const demoControlsSource = source('../components/topBar/DemoWalletControls.svelte');
    const connectButtonSource = source('../components/topBar/ConnectButton.svelte');
    const statRowSource = source('../components/common/StatRow.svelte');

    expect(topBarSource).toContain('flex-wrap');
    expect(topBarSource).toContain('flex-1');
    expect(demoControlsSource).toContain('sm:inline');
    expect(connectButtonSource).toContain('max-width');
    expect(connectButtonSource).toContain('hidden sm:inline');
    expect(statRowSource).toContain('sm:flex-row');
    expect(statRowSource).toContain('break-words');
  });

  it('exposes browser-stable test IDs across the complete responsive demo path', () => {
    const routeSources = [
      source('../../routes/app/+page.svelte'),
      source('../../routes/app/wallet/+page.svelte'),
      source('../../routes/app/market-making/+page.svelte'),
      source('../../routes/app/market-making/campaign/[id]/+page.svelte'),
      source('../../routes/app/market-making/order/new/+page.svelte'),
      source('../../routes/app/market-making/order/[id]/+page.svelte'),
      source('../../routes/app/deposit/+page.svelte'),
      source('../../routes/app/withdraw/+page.svelte'),
    ].join('\n');

    for (const testId of [
      'web3-home',
      'web3-wallet-funding',
      'web3-market-making',
      'legacy-detail-replaced',
      'order-create',
      'order-detail',
      'web3-deposit',
      'web3-withdraw',
      'market-making-create-order-cta',
      'order-review-button',
      'order-confirm-button',
      'order-pause-action',
      'order-resume-action',
      'deposit-create-order-link',
      'withdraw-submit-button',
    ]) {
      expect(routeSources).toContain(testId);
    }
  });

  it('reflects deposit, withdrawal, order creation, and lifecycle changes across local surfaces', () => {
    connectDemoWallet('evm');
    const account = get(walletAccount);
    expect(account?.id).toBe('evm-primary');
    if (!account) return;

    const startingBalances = accountBalances(account.id);
    const usdc = startingBalances.find((balance) => balance.symbol === 'USDC');
    const eth = startingBalances.find((balance) => balance.symbol === 'ETH');
    const campaign = mockCampaigns.find((item) => item.id === 'eth-usdc-depth');
    expect(usdc).toBeDefined();
    expect(eth).toBeDefined();
    expect(campaign).toBeDefined();
    if (!usdc || !eth || !campaign) return;

    completeMockDeposit(account.id, usdc, '250.50');
    expect(fundingActivityForAccount(account.id, 'evm', get(sessionFundingActivity))[0]).toMatchObject({
      label: 'Deposit',
      detail: expect.stringContaining('amount 250.5'),
    });

    const withdrawalSource = startingBalances.find((balance) => balance.symbol === 'ETH');
    expect(withdrawalSource).toBeDefined();
    if (!withdrawalSource) return;
    submitMockWithdrawal(account.id, withdrawalSource, '0.50', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e');
    expect(fundingActivityForAccount(account.id, 'evm', get(sessionFundingActivity))[0]).toMatchObject({
      label: 'Withdraw',
      detail: expect.stringContaining('amount 0.5'),
    });

    const order = createMockOrder(campaign, 'evm', '750', account.id);
    expect(transitionOrderLifecycle(order.id, 'pause')?.status).toBe('paused');
    expect(transitionOrderLifecycle(order.id, 'resume')?.status).toBe('active');

    const activity = aggregateMockActivityEntries(
      marketMakingActivityForAccount(account.id, 'evm', get(sessionMarketMakingActivity)),
      fundingActivityForAccount(account.id, 'evm', get(sessionFundingActivity)),
      mockAccountActivityForAccount(account.id, 'evm')
    );

    expect(activity.map((entry) => entry.label)).toEqual(
      expect.arrayContaining(['Placement resumed', 'Placement paused', 'Market-making order', 'Deposit', 'Withdraw'])
    );
    expect(activity[0]).toMatchObject({
      label: 'Placement resumed',
      href: `/app/market-making/order/${order.id}`,
    });
  });

  it('persists demo mutations in session storage for reload-tolerant browser validation', () => {
    const storage = installSessionStorageMock();
    connectDemoWallet('evm');
    const account = get(walletAccount);
    const usdc = account ? accountBalances(account.id).find((balance) => balance.symbol === 'USDC') : undefined;
    const campaign = mockCampaigns.find((item) => item.id === 'eth-usdc-depth');
    expect(account).toBeDefined();
    expect(usdc).toBeDefined();
    expect(campaign).toBeDefined();
    if (!account || !usdc || !campaign) return;

    completeMockDeposit(account.id, usdc, '250.50');
    const order = createMockOrder(campaign, 'evm', '750', account.id);
    transitionOrderLifecycle(order.id, 'pause');

    const fundingSnapshot = storage['mrm-web3-funding-session'];
    const marketMakingSnapshot = storage['mrm-web3-market-making-session'];
    expect(fundingSnapshot).toContain('DEP-EVM-0001');
    expect(marketMakingSnapshot).toContain(order.id);

    resetFundingSession();
    resetMarketMakingSession();
    expect(get(allOrders).find((item) => item.id === order.id)).toBeUndefined();

    storage['mrm-web3-funding-session'] = fundingSnapshot;
    storage['mrm-web3-market-making-session'] = marketMakingSnapshot;
    restoreFundingSession();
    restoreMarketMakingSession();

    expect(get(allOrders).find((item) => item.id === order.id)).toMatchObject({
      status: 'paused',
      accountId: account.id,
    });
    expect(fundingActivityForAccount(account.id, 'evm', get(sessionFundingActivity))[0]).toMatchObject({
      label: 'Deposit',
      href: '/app/deposit',
    });
  });
});
