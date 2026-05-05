import { FillSettlementService } from './fill-settlement.service';

describe('FillSettlementService', () => {
  const balanceLedgerService = {
    adjust: jest.fn().mockResolvedValue({ applied: true }),
    debitFee: jest.fn().mockResolvedValue({ applied: true }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    balanceLedgerService.adjust.mockResolvedValue({ applied: true });
    balanceLedgerService.debitFee.mockResolvedValue({ applied: true });
  });

  it('settles fill base and quote movement through the order-scoped ledger', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    await expect(
      service.settleFill({
        strategyKey: 'strategy-1',
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'BTC/USDT',
        fill: {
          exchangeOrderId: 'ex-1',
          clientOrderId: 'order-1:0',
          side: 'buy',
          price: '100',
          qty: '0.5',
        },
      }),
    ).resolves.toBe(true);

    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(1, {
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'BTC',
      amount: '0.5',
      idempotencyKey:
        'mm-fill:strategy-1:ex-1:order-1:0:buy:100:0.5:base',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
    expect(balanceLedgerService.adjust).toHaveBeenNthCalledWith(2, {
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'USDT',
      amount: '-50',
      idempotencyKey:
        'mm-fill:strategy-1:ex-1:order-1:0:buy:100:0.5:quote',
      refType: 'market_making_fill',
      refId: 'ex-1',
    });
  });

  it('settles actual fill fees through fee_debit when present', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);

    await service.settleFill({
      strategyKey: 'strategy-1',
      orderId: 'order-1',
      userId: 'user-1',
      pair: 'BTC/USDT',
      fill: {
        exchangeOrderId: 'ex-1',
        fillId: 'fill-1',
        side: 'buy',
        price: '100',
        qty: '0.5',
        feeAmount: '0.0005',
        feeAsset: 'BTC',
      },
    });

    expect(balanceLedgerService.debitFee).toHaveBeenCalledWith({
      orderId: 'order-1',
      userId: 'user-1',
      assetId: 'BTC',
      amount: '0.0005',
      idempotencyKey: 'mm-fill:strategy-1:fill-1:fee:BTC',
      refType: 'market_making_fee',
      refId: 'ex-1',
    });
  });

  it('does not throw when actual fill fee debit requires manual review', async () => {
    const service = new FillSettlementService(balanceLedgerService as any);
    const logger = Reflect.get(service, 'logger') as {
      warn: jest.Mock | ((message: string) => void);
    };
    const warnSpy = jest
      .spyOn(logger, 'warn')
      .mockImplementation(() => undefined);

    balanceLedgerService.debitFee.mockRejectedValue(
      new Error('insufficient available balance'),
    );

    await expect(
      service.settleFill({
        strategyKey: 'strategy-1',
        orderId: 'order-1',
        userId: 'user-1',
        pair: 'BTC/USDT',
        fill: {
          exchangeOrderId: 'ex-1',
          fillId: 'fill-1',
          side: 'buy',
          price: '100',
          qty: '0.5',
          feeAmount: '0.0005',
          feeAsset: 'BTC',
        },
      }),
    ).resolves.toBe(true);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Fill fee debit requires manual review'),
    );
  });
});
