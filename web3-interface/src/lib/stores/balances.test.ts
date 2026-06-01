import { afterEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { balances, fundingActivity, inMarketMakingBalances, totalBalanceUsd, web3Balances } from './balances';
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
    web3Balances.set(null);
    resetWallet();
  });

  const connectWallet = () => {
    walletStatus.set('connected');
    walletAddress.set('0x1234567890123456789012345678901234567890');
    walletNamespace.set('evm');
    walletChainId.set(11155111);
    walletNetwork.set('Sepolia');
  };

  it('maps backend wallet balances into account balance entries', () => {
    connectWallet();
    web3Balances.set({
      namespace: '/web3/balances',
      walletOrderId: 'web3:wallet:user-1',
      available: [
        {
          orderId: 'web3:wallet:user-1',
          assetId: 'evm:11155111:usdc',
          available: '42',
          locked: '0',
          total: '42',
          initialDeposit: '42',
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-06-01T00:00:00Z',
        },
      ],
      inMarketMaking: [],
      lockedInOrders: [],
      activity: [],
      summary: {
        availableAssetCount: 1,
        inMarketMakingAssetCount: 0,
        activityCount: 0,
      },
    });

    expect(get(balances)).toMatchObject([
      {
        asset: 'evm:11155111:usdc',
        symbol: 'USDC',
        amount: '42',
        usdValue: '42.00',
      },
    ]);
    expect(get(totalBalanceUsd)).toBe('42.00');
  });

  it('exposes server activity and market-making groups, and hides balances on unsupported wallets', () => {
    connectWallet();
    web3Balances.set({
      namespace: '/web3/balances',
      walletOrderId: 'web3:wallet:user-1',
      available: [],
      inMarketMaking: [
        {
          assetId: 'asset-usdc',
          available: '1',
          locked: '2',
          total: '3',
          orderCount: 1,
          orders: [],
        },
      ],
      lockedInOrders: [],
      activity: [
        {
          activityId: 'entry-1',
          direction: 'deposit',
          ledgerType: 'deposit_credit',
          scope: 'wallet',
          orderId: 'web3:wallet:user-1',
          assetId: 'asset-usdc',
          amount: '10',
          signedAmount: '10',
          refType: 'web3_wallet_deposit',
          refId: '0xabc',
          idempotencyKey: 'deposit-1',
          createdAt: '2026-06-01T00:00:00Z',
        },
      ],
      summary: {
        availableAssetCount: 0,
        inMarketMakingAssetCount: 1,
        activityCount: 1,
      },
    });

    expect(get(inMarketMakingBalances)[0]?.locked).toBe('2');
    expect(get(fundingActivity)[0]?.direction).toBe('deposit');

    walletStatus.set('unsupported');
    walletChainId.set(137);
    walletNetwork.set('Polygon');
    expect(get(balances)).toEqual([]);
  });
});
