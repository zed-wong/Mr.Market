import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import { accountBalances } from '$lib/helpers/mock-web3';
import {
  applyFundingDeltas,
  completeMockDeposit,
  fundingActivityForAccount,
  resetFundingSession,
  restoreFundingSession,
  sessionFundingActivity,
  submitMockWithdrawal,
  validateMockDeposit,
  validateMockWithdrawal,
} from './funding';

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

describe('deterministic funding flows', () => {
  beforeEach(() => {
    resetFundingSession();
  });

  it('validates deposits and credits balances plus activity deterministically', () => {
    const usdc = accountBalances('evm-primary').find((balance) => balance.symbol === 'USDC');
    expect(usdc).toBeDefined();
    if (!usdc) return;

    expect(validateMockDeposit({ balance: usdc, amount: '0' })).toMatchObject({
      amount: 'Deposit amount must be greater than zero.',
    });
    expect(validateMockDeposit({ balance: usdc, amount: '250.1234567' })).toMatchObject({
      amount: 'USDC supports up to 6 decimal places.',
    });

    const result = completeMockDeposit('evm-primary', usdc, '250.50');
    const updatedBalance = applyFundingDeltas('evm-primary', accountBalances('evm-primary')).find(
      (balance) => balance.symbol === 'USDC'
    );
    const activity = fundingActivityForAccount('evm-primary', 'evm', get(sessionFundingActivity));

    expect(result).toMatchObject({
      id: 'DEP-EVM-0001',
      status: 'credited',
      amount: '250.5',
      timestamp: '2026-05-23 09:15',
    });
    expect(result.timeline.map((step) => step.state)).toEqual(['complete', 'complete', 'complete', 'complete']);
    expect(updatedBalance).toMatchObject({
      amount: '13090.50',
      usdValue: '13090.50',
    });
    expect(activity[0]).toMatchObject({
      label: 'Deposit',
      detail: 'USDC · EVM · USD Coin · credited · 2026-05-23 09:15 · amount 250.5',
      href: '/app/deposit',
    });
  });

  it('validates withdrawals and separates pending amounts from available balances', () => {
    const eth = accountBalances('evm-primary').find((balance) => balance.symbol === 'ETH');
    expect(eth).toBeDefined();
    if (!eth) return;

    expect(
      validateMockWithdrawal({
        namespace: 'evm',
        balance: eth,
        destination: 'not-an-address',
        amount: '0.001',
      })
    ).toMatchObject({
      destination: 'Enter a valid EVM address with 0x followed by 40 hexadecimal characters.',
      amount: 'Minimum mocked withdrawal is 0.01 ETH.',
    });
    expect(() =>
      submitMockWithdrawal('evm-primary', eth, '100', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e')
    ).toThrow('Amount exceeds available balance of 4.2500 ETH.');

    const result = submitMockWithdrawal(
      'evm-primary',
      eth,
      '0.50',
      '0x742d35Cc6634C0532925a3b844Bc454e4438f44e'
    );
    const updatedBalance = applyFundingDeltas('evm-primary', accountBalances('evm-primary')).find(
      (balance) => balance.symbol === 'ETH'
    );
    const activity = fundingActivityForAccount('evm-primary', 'evm', get(sessionFundingActivity));

    expect(result).toMatchObject({
      id: 'WDR-EVM-0001',
      status: 'reviewing',
      amount: '0.5',
      timestamp: '2026-05-23 09:15',
    });
    expect(result.timeline.map((step) => step.state)).toEqual(['complete', 'complete', 'current', 'pending']);
    expect(updatedBalance).toMatchObject({
      amount: '3.7500',
      usdValue: '13500.00',
      pendingAmount: '0.5000',
    });
    expect(activity[0]).toMatchObject({
      label: 'Withdraw',
      detail: 'ETH · EVM · 0x742d...f44e · reviewing · 2026-05-23 09:15 · amount 0.5',
      href: '/app/withdraw',
    });
  });

  it('restores malformed parseable funding snapshots with safe defaults', () => {
    const storage = installSessionStorageMock();
    storage['mrm-web3-funding-session'] = JSON.stringify({
      fundingSequence: 'not-a-number',
      creditedDeposits: { accountId: 'evm-primary', asset: 'usdc', amount: '250' },
      pendingWithdrawals: [
        null,
        { accountId: 'evm-primary', asset: 'ethereum', amount: '0.5' },
        { accountId: 42, asset: 'usdc', amount: '100' },
      ],
      sessionFundingActivity: { id: 'activity-bad' },
    });

    expect(() => restoreFundingSession()).not.toThrow();

    const updatedEth = applyFundingDeltas('evm-primary', accountBalances('evm-primary')).find(
      (balance) => balance.symbol === 'ETH'
    );
    expect(updatedEth).toMatchObject({
      amount: '3.7500',
      pendingAmount: '0.5000',
    });
    expect(get(sessionFundingActivity)).toEqual([]);

    const usdc = accountBalances('evm-primary').find((balance) => balance.symbol === 'USDC');
    expect(usdc).toBeDefined();
    if (!usdc) return;
    expect(completeMockDeposit('evm-primary', usdc, '250.50')).toMatchObject({
      id: 'DEP-EVM-0001',
    });
  });
});
