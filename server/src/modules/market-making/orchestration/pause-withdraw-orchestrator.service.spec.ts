import { PauseWithdrawOrchestratorService } from './pause-withdraw-orchestrator.service';

describe('PauseWithdrawOrchestratorService', () => {
  it('pauses strategy and debits ledger before withdrawal execution', async () => {
    const strategyService = {
      stopStrategyForUser: jest.fn().mockResolvedValue(undefined),
    };
    const balanceLedgerService = {
      unlockFunds: jest.fn().mockResolvedValue({ applied: true }),
      debitWithdrawal: jest.fn().mockResolvedValue({ applied: true }),
    };
    const withdrawalService = {
      executeWithdrawal: jest.fn().mockResolvedValue({ trace_id: 'tx-1' }),
    };
    const exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    const exchangeConnectorAdapterService = {
      cancelOrder: jest.fn().mockResolvedValue(undefined),
    };

    const service = new PauseWithdrawOrchestratorService(
      strategyService as any,
      balanceLedgerService as any,
      withdrawalService as any,
      exchangeOrderTrackerService as any,
      exchangeConnectorAdapterService as any,
    );

    await service.pauseAndWithdraw({
      userId: 'u1',
      clientId: 'c1',
      strategyType: 'pureMarketMaking',
      assetId: 'asset-usdt',
      amount: '10',
      destination: '0xabc',
      destinationTag: '',
    });

    expect(strategyService.stopStrategyForUser).toHaveBeenCalledWith(
      'u1',
      'c1',
      'pureMarketMaking',
    );
    expect(balanceLedgerService.unlockFunds).toHaveBeenCalledTimes(1);
    expect(balanceLedgerService.debitWithdrawal).toHaveBeenCalledTimes(1);
    expect(withdrawalService.executeWithdrawal).toHaveBeenCalledTimes(1);
  });

  it('rejects withdraw flow when strategy still has open orders', async () => {
    const strategyService = {
      stopStrategyForUser: jest.fn().mockResolvedValue(undefined),
    };
    const balanceLedgerService = {
      unlockFunds: jest.fn().mockResolvedValue({ applied: true }),
      debitWithdrawal: jest.fn().mockResolvedValue({ applied: true }),
    };
    const withdrawalService = {
      executeWithdrawal: jest.fn().mockResolvedValue({ trace_id: 'tx-1' }),
    };
    const exchangeOrderTrackerService = {
      getOpenOrders: jest.fn().mockReturnValue([{ exchangeOrderId: 'ex-1' }]),
    };
    const exchangeConnectorAdapterService = {
      cancelOrder: jest.fn().mockResolvedValue(undefined),
    };

    const service = new PauseWithdrawOrchestratorService(
      strategyService as any,
      balanceLedgerService as any,
      withdrawalService as any,
      exchangeOrderTrackerService as any,
      exchangeConnectorAdapterService as any,
    );

    await expect(
      service.pauseAndWithdraw({
        userId: 'u1',
        clientId: 'c1',
        strategyType: 'pureMarketMaking',
        assetId: 'asset-usdt',
        amount: '10',
        destination: '0xabc',
        destinationTag: '',
      }),
    ).rejects.toThrow('Open orders not drained');

    expect(balanceLedgerService.unlockFunds).not.toHaveBeenCalled();
    expect(withdrawalService.executeWithdrawal).not.toHaveBeenCalled();
  });

  it('actively cancels open orders and proceeds once drained', async () => {
    const strategyService = {
      stopStrategyForUser: jest.fn().mockResolvedValue(undefined),
    };
    const balanceLedgerService = {
      unlockFunds: jest.fn().mockResolvedValue({ applied: true }),
      debitWithdrawal: jest.fn().mockResolvedValue({ applied: true }),
    };
    const withdrawalService = {
      executeWithdrawal: jest.fn().mockResolvedValue({ trace_id: 'tx-1' }),
    };
    const exchangeOrderTrackerService = {
      getOpenOrders: jest
        .fn()
        .mockReturnValueOnce([
          {
            exchangeOrderId: 'ex-1',
            exchange: 'binance',
            pair: 'BTC/USDT',
          },
        ])
        .mockReturnValueOnce([]),
    };
    const exchangeConnectorAdapterService = {
      cancelOrder: jest.fn().mockResolvedValue(undefined),
    };

    const service = new PauseWithdrawOrchestratorService(
      strategyService as any,
      balanceLedgerService as any,
      withdrawalService as any,
      exchangeOrderTrackerService as any,
      exchangeConnectorAdapterService as any,
    );

    await service.pauseAndWithdraw({
      userId: 'u1',
      clientId: 'c1',
      strategyType: 'pureMarketMaking',
      assetId: 'asset-usdt',
      amount: '10',
      destination: '0xabc',
      destinationTag: '',
    });

    expect(exchangeConnectorAdapterService.cancelOrder).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      'ex-1',
    );
    expect(withdrawalService.executeWithdrawal).toHaveBeenCalledTimes(1);
  });
});
