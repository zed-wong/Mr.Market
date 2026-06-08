/* eslint-disable @typescript-eslint/no-explicit-any */
import { ReconciliationService } from './reconciliation.service';

describe('ReconciliationService', () => {
  it('reports zero violations when ledger balances are valid', async () => {
    const balanceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: 'u1',
          assetId: 'usdt',
          available: '70',
          locked: '30',
          total: '100',
        },
      ]),
    };
    const orderTracker = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    const service = new ReconciliationService(
      balanceRepo as any,
      orderTracker as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );

    const report = await service.reconcileLedgerInvariants();

    expect(report.violations).toBe(0);
  });

  it('detects ledger invariant violations', async () => {
    const balanceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          userId: 'u1',
          assetId: 'usdt',
          available: '60',
          locked: '30',
          total: '100',
        },
      ]),
    };
    const orderTracker = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    const service = new ReconciliationService(
      balanceRepo as any,
      orderTracker as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );

    const report = await service.reconcileLedgerInvariants();

    expect(report.violations).toBe(1);
  });

  it('detects locked balances on non-running market-making orders', async () => {
    const balanceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          orderId: 'order-stopped',
          userId: 'u1',
          assetId: 'usdt',
          available: '70',
          locked: '30',
          total: '100',
        },
      ]),
    };
    const orderTracker = {
      getOpenOrders: jest.fn().mockReturnValue([]),
    };
    const orderRepo = {
      find: jest
        .fn()
        .mockResolvedValue([{ orderId: 'order-stopped', state: 'stopped' }]),
    };
    const service = new ReconciliationService(
      balanceRepo as any,
      orderTracker as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      orderRepo as any,
    );

    const report = await service.reconcileLedgerInvariants();

    expect(report.violations).toBe(1);
  });

  it('allows locked balances on running market-making orders', async () => {
    const balanceRepo = {
      find: jest.fn().mockResolvedValue([
        {
          orderId: 'order-running',
          userId: 'u1',
          assetId: 'usdt',
          available: '70',
          locked: '30',
          total: '100',
        },
      ]),
    };
    const orderRepo = {
      find: jest
        .fn()
        .mockResolvedValue([{ orderId: 'order-running', state: 'running' }]),
    };
    const service = new ReconciliationService(
      balanceRepo as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      undefined,
      undefined,
      undefined,
      undefined,
      orderRepo as any,
    );

    const report = await service.reconcileLedgerInvariants();

    expect(report.violations).toBe(0);
  });

  it('accepts reward consistency when allocations, platform fee, and remainder equal reward amount', async () => {
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      {
        find: jest.fn().mockResolvedValue([
          {
            txHash: 'tx-balanced',
            amount: '100',
            platformFee: '10',
            undistributedRemainder: '5',
            campaignId: 'c1',
            dayIndex: 1,
          },
        ]),
      } as any,
      {
        find: jest.fn().mockResolvedValue([
          { rewardTxHash: 'tx-balanced', amount: '50' },
          { rewardTxHash: 'tx-balanced', amount: '35' },
        ]),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );

    const report = await service.reconcileRewardConsistency();

    expect(report.violations).toBe(0);
  });

  it('detects reward consistency mismatch when accounting does not equal reward amount', async () => {
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      {
        find: jest.fn().mockResolvedValue([
          {
            txHash: 'tx-1',
            amount: '100',
            platformFee: '10',
            undistributedRemainder: '0',
            campaignId: 'c1',
            dayIndex: 1,
          },
        ]),
      } as any,
      {
        find: jest.fn().mockResolvedValue([
          { rewardTxHash: 'tx-1', amount: '80' },
          { rewardTxHash: 'tx-1', amount: '30' },
        ]),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
    );

    const report = await service.reconcileRewardConsistency();

    expect(report.violations).toBe(1);
  });

  it('detects stale SENT intents without requiring DONE intents to have exchange order ids', async () => {
    const staleTs = '2026-01-01T00:00:00.000Z';
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        find: jest.fn().mockResolvedValue([
          {
            intentId: 'intent-1',
            type: 'CREATE_LIMIT_ORDER',
            status: 'DONE',
            mixinOrderId: null,
            createdAt: staleTs,
            updatedAt: staleTs,
          },
          {
            intentId: 'intent-2',
            type: 'CREATE_LIMIT_ORDER',
            status: 'SENT',
            mixinOrderId: null,
            createdAt: staleTs,
            updatedAt: staleTs,
          },
        ]),
      } as any,
    );

    const report = await service.reconcileIntentLifecycleConsistency();

    expect(report.violations).toBe(1);
  });

  it('flags estimated fee debits older than the reconciliation threshold', async () => {
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-05-04T00:20:00.000Z'));
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        find: jest.fn().mockResolvedValue([
          {
            entryId: 'estimated-fee-stale',
            type: 'fee_debit',
            refType: 'market_making_estimated_fee',
            createdAt: '2026-05-04T00:00:00.000Z',
          },
          {
            entryId: 'estimated-fee-fresh',
            type: 'fee_debit',
            refType: 'market_making_estimated_fee',
            createdAt: '2026-05-04T00:10:01.000Z',
          },
        ]),
      } as any,
    );

    const report = await service.reconcileEstimatedFeeAging();

    expect(report).toEqual({
      checked: 2,
      violations: 1,
    });
    nowSpy.mockRestore();
  });

  it('does not flag estimated fee debits after they are reversed', async () => {
    const nowSpy = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.parse('2026-05-04T00:20:00.000Z'));
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        find: jest.fn(async ({ where }: any) => {
          if (where.refType === 'market_making_estimated_fee') {
            return [
              {
                entryId: 'estimated-fee-reversed',
                type: 'fee_debit',
                refType: 'market_making_estimated_fee',
                createdAt: '2026-05-04T00:00:00.000Z',
              },
            ];
          }

          if (where.refType === 'market_making_estimated_fee_reversal') {
            return [
              {
                entryId: 'reversal-1',
                type: 'reversal',
                refType: 'market_making_estimated_fee_reversal',
                reversalOf: 'estimated-fee-reversed',
              },
            ];
          }

          return [];
        }),
      } as any,
    );

    const report = await service.reconcileEstimatedFeeAging();

    expect(report).toEqual({
      checked: 1,
      violations: 0,
    });
    nowSpy.mockRestore();
  });

  it('reverses estimated fee debit when actual fee exists for the same fill', async () => {
    const balanceLedgerService = {
      reverse: jest.fn().mockResolvedValue({ applied: true }),
    };
    const marketMakingEventBus = {
      emitReconciliationAudit: jest.fn(),
    };
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        find: jest.fn(async ({ where }: any) => {
          if (where.refType === 'market_making_estimated_fee') {
            return [
              {
                entryId: 'estimated-fee-1',
                orderId: 'order-1',
                userId: 'user-1',
                assetId: 'USDT',
                amount: '-0.1',
                type: 'fee_debit',
                refType: 'market_making_estimated_fee',
                refId: 'trade-1',
              },
            ];
          }

          if (where.refType === 'market_making_fee') {
            return [
              {
                entryId: 'actual-fee-1',
                orderId: 'order-1',
                userId: 'user-1',
                assetId: 'USDT',
                amount: '-0.07',
                type: 'fee_debit',
                refType: 'market_making_fee',
                refId: 'trade-1',
              },
            ];
          }

          return [];
        }),
      } as any,
      balanceLedgerService as any,
      marketMakingEventBus as any,
    );

    const report = await service.reconcileEstimatedFeeCorrections();

    expect(report).toEqual({
      checked: 1,
      violations: 0,
      corrected: 1,
    });
    expect(balanceLedgerService.reverse).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '0.1',
      idempotencyKey: 'estimated-fee-reversal:estimated-fee-1',
      refType: 'market_making_estimated_fee_reversal',
      refId: 'trade-1',
      reversalOf: 'estimated-fee-1',
    });
    expect(marketMakingEventBus.emitReconciliationAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        correctionType: 'estimated_fee_reversal',
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'USDT',
        amount: '0.1',
        refType: 'market_making_estimated_fee_reversal',
        refId: 'trade-1',
        reversalOf: 'estimated-fee-1',
      }),
    );
  });

  it('flags market-making fills that are missing attribution fields', async () => {
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      { getOpenOrders: jest.fn().mockReturnValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        find: jest.fn().mockResolvedValue([
          {
            entryId: 'fill-ok',
            orderId: 'order-1',
            userId: 'user-1',
            amount: '-100',
            type: 'fill_settle',
            refType: 'market_making_fill',
            refId: 'fill-1',
          },
          {
            entryId: 'fill-missing-order',
            orderId: '',
            userId: 'user-2',
            amount: '-50',
            type: 'fill_settle',
            refType: 'market_making_fill',
            refId: 'fill-2',
          },
          {
            entryId: 'fill-missing-ref',
            orderId: 'order-3',
            userId: 'user-3',
            amount: '-25',
            type: 'fill_settle',
            refType: 'market_making_fill',
            refId: '',
          },
        ]),
      } as any,
    );

    const report = await service.reconcileFillAttributionConsistency();

    expect(report).toEqual({
      checked: 3,
      violations: 2,
    });
  });

  it('reconciles fill ledger refs against exchange private trade evidence', async () => {
    const ledgerEntryRepository = {
      find: jest.fn().mockResolvedValue([
        {
          entryId: 'fill-backed',
          orderId: 'order-1',
          userId: 'user-1',
          amount: '-100',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'exchange-order-backed',
        },
        {
          entryId: 'fill-missing-exchange-trade',
          orderId: 'order-2',
          userId: 'user-2',
          amount: '-50',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'exchange-order-missing',
        },
        {
          entryId: 'fill-untracked',
          orderId: 'order-3',
          userId: 'user-3',
          amount: '-25',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'not-in-tracker',
        },
      ]),
    };
    const exchangeConnectorAdapterService = {
      fetchMyTrades: jest.fn().mockResolvedValue([
        {
          id: 'trade-1',
          order: 'exchange-order-backed',
        },
      ]),
    };
    const balanceLedgerService = {
      pauseReservations: jest.fn(),
    };
    const marketMakingEventBus = {
      emitReconciliationAudit: jest.fn(),
    };
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        getOpenOrders: jest.fn().mockReturnValue([]),
        getAllTrackedOrders: jest.fn().mockReturnValue([
          {
            exchange: 'binance',
            accountLabel: 'maker',
            pair: 'BTC/USDT',
            exchangeOrderId: 'exchange-order-backed',
          },
          {
            exchange: 'binance',
            accountLabel: 'maker',
            pair: 'BTC/USDT',
            exchangeOrderId: 'exchange-order-missing',
          },
        ]),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      ledgerEntryRepository as any,
      balanceLedgerService as any,
      marketMakingEventBus as any,
      exchangeConnectorAdapterService as any,
    );

    const report = await service.reconcileFillsAgainstExchangeTrades();

    expect(exchangeConnectorAdapterService.fetchMyTrades).toHaveBeenCalledWith(
      'binance',
      'BTC/USDT',
      undefined,
      1000,
      'maker',
    );
    expect(report).toEqual({
      checked: 3,
      violations: 2,
    });
    expect(balanceLedgerService.pauseReservations).not.toHaveBeenCalled();
    expect(
      marketMakingEventBus.emitReconciliationAudit,
    ).toHaveBeenCalledTimes(2);
    expect(
      marketMakingEventBus.emitReconciliationAudit,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-2',
        reason: 'missing_exchange_trade',
        refId: 'exchange-order-missing',
      }),
    );
  });

  it('tolerates small quote fill evidence differences without pausing reservations', async () => {
    const ledgerEntryRepository = {
      find: jest.fn().mockResolvedValue([
        {
          entryId: 'quote-fill-rounded',
          orderId: 'order-1:maker',
          userId: 'user-1',
          assetId: 'USDT',
          amount: '-5.386',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'exchange-order-1',
        },
      ]),
    };
    const exchangeConnectorAdapterService = {
      fetchMyTrades: jest.fn().mockResolvedValue([
        {
          id: 'trade-1',
          order: 'exchange-order-1',
          amount: '0.1',
          cost: '5.385',
        },
      ]),
    };
    const balanceLedgerService = {
      pauseReservations: jest.fn(),
    };
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        getOpenOrders: jest.fn().mockReturnValue([]),
        getAllTrackedOrders: jest.fn().mockReturnValue([
          {
            orderId: 'order-1:maker',
            exchange: 'binance',
            accountLabel: 'maker',
            pair: 'BTC/USDT',
            exchangeOrderId: 'exchange-order-1',
          },
        ]),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      ledgerEntryRepository as any,
      balanceLedgerService as any,
      { emitReconciliationAudit: jest.fn() } as any,
      exchangeConnectorAdapterService as any,
    );

    const report = await service.reconcileFillsAgainstExchangeTrades();

    expect(report).toEqual({ checked: 1, violations: 0 });
    expect(balanceLedgerService.pauseReservations).not.toHaveBeenCalled();
  });

  it('still pauses reservations for material quote fill evidence mismatches', async () => {
    const ledgerEntryRepository = {
      find: jest.fn().mockResolvedValue([
        {
          entryId: 'quote-fill-mismatch',
          orderId: 'order-1:maker',
          userId: 'user-1',
          assetId: 'USDT',
          amount: '-5.386',
          type: 'fill_settle',
          refType: 'market_making_fill',
          refId: 'exchange-order-1',
        },
      ]),
    };
    const exchangeConnectorAdapterService = {
      fetchMyTrades: jest.fn().mockResolvedValue([
        {
          id: 'trade-1',
          order: 'exchange-order-1',
          amount: '0.1',
          cost: '4',
        },
      ]),
    };
    const balanceLedgerService = {
      pauseReservations: jest.fn(),
    };
    const service = new ReconciliationService(
      { find: jest.fn().mockResolvedValue([]) } as any,
      {
        getOpenOrders: jest.fn().mockReturnValue([]),
        getAllTrackedOrders: jest.fn().mockReturnValue([
          {
            orderId: 'order-1:maker',
            exchange: 'binance',
            accountLabel: 'maker',
            pair: 'BTC/USDT',
            exchangeOrderId: 'exchange-order-1',
          },
        ]),
      } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      ledgerEntryRepository as any,
      balanceLedgerService as any,
      { emitReconciliationAudit: jest.fn() } as any,
      exchangeConnectorAdapterService as any,
    );

    const report = await service.reconcileFillsAgainstExchangeTrades();

    expect(report).toEqual({ checked: 1, violations: 1 });
    expect(balanceLedgerService.pauseReservations).toHaveBeenCalledWith(
      'order-1:maker',
      'USDT',
      expect.objectContaining({
        source: 'reconciliation',
        reason: 'fill_amount_mismatch',
        refId: 'exchange-order-1',
      }),
    );
  });
});
