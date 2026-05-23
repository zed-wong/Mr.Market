import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { balances, totalBalanceUsd } from './balances';
import { completeMockDeposit, resetFundingSession } from './funding';
import {
  walletAddress,
  walletChainId,
  walletNamespace,
  walletNetwork,
  walletStatus,
} from './wallet';

const resetWallet = () => {
  walletStatus.set('disconnected');
  walletAddress.set(null);
  walletNamespace.set(null);
  walletChainId.set(null);
  walletNetwork.set(null);
};

describe('deterministic account balance bridge', () => {
  afterEach(() => {
    resetFundingSession();
    resetWallet();
  });

  it('populates fixture balances for a connected supported EVM wallet', () => {
    walletStatus.set('connected');
    walletAddress.set('0x1234567890123456789012345678901234567890');
    walletNamespace.set('evm');
    walletChainId.set(1);
    walletNetwork.set('Ethereum');

    expect(get(balances).map((balance) => balance.symbol)).toEqual(['ETH', 'USDC']);
    expect(get(totalBalanceUsd)).toBe('28140.00');
  });

  it('hides balances for wrong-network wallets and applies funding deltas locally', () => {
    walletStatus.set('connected');
    walletAddress.set('0x1234567890123456789012345678901234567890');
    walletNamespace.set('evm');
    walletChainId.set(11155111);
    walletNetwork.set('Sepolia');

    const usdc = get(balances).find((balance) => balance.symbol === 'USDC');
    expect(usdc?.amount).toBe('4200.00');
    if (!usdc) return;
    completeMockDeposit('evm-secondary', usdc, '100');
    expect(get(balances).find((balance) => balance.symbol === 'USDC')?.amount).toBe('4300.00');

    walletStatus.set('unsupported');
    walletChainId.set(137);
    walletNetwork.set('Polygon');
    expect(get(balances)).toEqual([]);
  });
});
