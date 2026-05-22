import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  mockAccountActivityForNamespace,
  mockFundingActivityForNamespace,
  mockOrdersForNamespace,
} from '$lib/helpers/mock-web3';
import {
  connectMockWallet,
  selectedMockAccountId,
  setUnsupportedChain,
  setWalletDisconnected,
  switchMockAccount,
  walletAddress,
  walletIsConnected,
  walletIsUnsupported,
  walletNamespaceLabel,
  walletStatus,
} from './wallet';
import { balances, totalBalanceUsd } from './balances';

describe('mock wallet store', () => {
  afterEach(() => {
    vi.useRealTimers();
    setWalletDisconnected();
  });

  it('starts fresh contexts disconnected', () => {
    setWalletDisconnected();

    expect(get(walletStatus)).toBe('disconnected');
    expect(get(walletAddress)).toBeNull();
    expect(get(walletIsConnected)).toBe(false);
    expect(get(balances)).toEqual([]);
  });

  it('shows connecting before resolving to an EVM account', async () => {
    vi.useFakeTimers();
    const pending = connectMockWallet('evm-primary', 500);

    expect(get(walletStatus)).toBe('connecting');
    expect(get(selectedMockAccountId)).toBe('evm-primary');

    await vi.advanceTimersByTimeAsync(500);
    await pending;

    expect(get(walletStatus)).toBe('connected');
    expect(get(walletNamespaceLabel)).toBe('EVM');
    expect(get(walletAddress)).toMatch(/^0x/);
    expect(get(totalBalanceUsd)).toBe('28140.00');
  });

  it('switches deterministically between Solana, EVM, unsupported, and disconnected states', async () => {
    await connectMockWallet('solana-primary', 0);
    expect(get(walletNamespaceLabel)).toBe('Solana / SVM');
    expect(get(walletAddress)).toMatch(/^So/);
    expect(get(balances).map((balance) => balance.symbol)).toEqual(['SOL', 'USDC']);

    switchMockAccount('evm-secondary');
    expect(get(walletNamespaceLabel)).toBe('EVM');
    expect(get(walletAddress)).toMatch(/^0xB0B/);
    expect(get(totalBalanceUsd)).toBe('10500.00');

    setUnsupportedChain();
    expect(get(walletIsUnsupported)).toBe(true);
    expect(get(balances)).toEqual([]);

    setWalletDisconnected();
    expect(get(walletStatus)).toBe('disconnected');
    expect(get(walletAddress)).toBeNull();
  });

  it('does not expose account-scoped activity or orders without a supported namespace', () => {
    expect(mockOrdersForNamespace(null)).toEqual([]);
    expect(mockFundingActivityForNamespace(null)).toEqual([]);
    expect(mockAccountActivityForNamespace(null)).toEqual([]);

    expect(mockOrdersForNamespace('evm').map((order) => order.id)).toEqual(['MM-1001', 'MM-1002', 'MM-1003']);
    expect(mockOrdersForNamespace('solana').map((order) => order.id)).toEqual(['MM-2001', 'MM-2002', 'MM-2003']);
    expect(mockAccountActivityForNamespace('evm').some((entry) => entry.detail.includes('MM-2001'))).toBe(false);
    expect(mockAccountActivityForNamespace('solana').some((entry) => entry.detail.includes('MM-1001'))).toBe(false);
  });
});
