import { BigNumber } from 'ethers';

import { WalletBalanceReconciliationRunner } from './wallet-balance-reconciliation-runner.service';

describe('WalletBalanceReconciliationRunner', () => {
  it('compares wallet balances against aggregated ledger balances', async () => {
    const provider = {
      getBalance: jest.fn().mockResolvedValue(BigNumber.from('900000000000000000')),
    };
    const balanceLedgerService = {
      findBalancesByTradingAccount: jest.fn().mockResolvedValue([
        {
          assetId: 'asset-eth',
          available: '1',
          locked: '0',
          externalLocked: '0',
        },
      ]),
    };
    const tokenRegistryService = {
      resolveToken: jest.fn().mockResolvedValue({
        assetId: 'asset-eth',
        contractAddress: '0x0000000000000000000000000000000000000000',
        decimals: 18,
        isNative: true,
      }),
    };
    const tradingAccountService = {
      getSigner: jest.fn().mockResolvedValue({
        provider,
        getAddress: jest
          .fn()
          .mockResolvedValue('0x0000000000000000000000000000000000000009'),
      }),
    };
    const runner = new WalletBalanceReconciliationRunner(
      balanceLedgerService as any,
      tokenRegistryService as any,
      tradingAccountService as any,
    );

    const result = await runner.reconcileWallet({
      tradingAccountId: 'account-1',
      chainId: 1,
      assetIds: ['asset-eth'],
    });

    expect(result).toEqual({
      tradingAccountId: 'account-1',
      chainId: 1,
      matches: false,
      mismatches: [
        {
          assetId: 'asset-eth',
          ledgerAmount: '1',
          walletAmount: '0.9',
        },
      ],
    });
  });
});
