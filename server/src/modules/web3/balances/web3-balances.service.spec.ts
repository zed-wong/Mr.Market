import { Web3BalancesService } from './web3-balances.service';

describe('Web3BalancesService', () => {
  const buildService = () => {
    const orderBalanceRepository = {
      find: jest.fn(),
    };
    const ledgerEntryRepository = {
      find: jest.fn(),
    };
    const userOrdersService = {
      findMarketMakingByUserId: jest.fn(),
    };
    const service = new Web3BalancesService(
      orderBalanceRepository as never,
      ledgerEntryRepository as never,
      userOrdersService as never,
    );

    return {
      service,
      orderBalanceRepository,
      ledgerEntryRepository,
      userOrdersService,
    };
  };

  it('returns ledger-derived wallet balances and order-scoped market-making funds grouped by asset', async () => {
    const {
      service,
      orderBalanceRepository,
      ledgerEntryRepository,
      userOrdersService,
    } = buildService();

    userOrdersService.findMarketMakingByUserId.mockResolvedValueOnce([
      { orderId: 'order-1', userId: 'user-1', source: 'payment_flow' },
      { orderId: 'order-2', userId: 'user-1', source: 'payment_flow' },
      { orderId: 'admin-order', userId: 'user-1', source: 'admin_direct' },
    ]);
    orderBalanceRepository.find
      .mockResolvedValueOnce([
        {
          orderId: 'web3:wallet:user-1',
          userId: 'user-1',
          assetId: 'asset-usdc',
          available: '12.5',
          locked: '0',
          total: '12.5',
          initialDeposit: '12.5',
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-06-01T00:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce([
        {
          orderId: 'order-1',
          userId: 'user-1',
          assetId: 'asset-usdc',
          available: '0.1',
          locked: '0.2',
          total: '0.3',
          initialDeposit: '0.3',
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-06-01T00:01:00.000Z',
        },
        {
          orderId: 'order-2',
          userId: 'user-1',
          assetId: 'asset-usdc',
          available: '1.4',
          locked: '2.6',
          total: '4',
          initialDeposit: '4',
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-06-01T00:02:00.000Z',
        },
        {
          orderId: 'order-2',
          userId: 'user-1',
          assetId: 'asset-weth',
          available: '3',
          locked: '4',
          total: '7',
          initialDeposit: '7',
          realizedDelta: '0',
          feePaid: '0',
          updatedAt: '2026-06-01T00:03:00.000Z',
        },
      ]);
    ledgerEntryRepository.find.mockResolvedValueOnce([]);

    const result = await service.getBalances('user-1');

    expect(orderBalanceRepository.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          orderId: 'web3:wallet:user-1',
          userId: 'user-1',
        },
      }),
    );
    expect(result.available).toEqual([
      expect.objectContaining({
        orderId: 'web3:wallet:user-1',
        assetId: 'asset-usdc',
        available: '12.5',
        total: '12.5',
      }),
    ]);
    expect(result.inMarketMaking).toEqual([
      expect.objectContaining({
        assetId: 'asset-usdc',
        available: '1.5',
        locked: '2.8',
        total: '4.3',
        orders: [
          expect.objectContaining({
            orderId: 'order-1',
            assetId: 'asset-usdc',
          }),
          expect.objectContaining({
            orderId: 'order-2',
            assetId: 'asset-usdc',
          }),
        ],
      }),
      expect.objectContaining({
        assetId: 'asset-weth',
        available: '3',
        locked: '4',
        total: '7',
        orders: [
          expect.objectContaining({
            orderId: 'order-2',
            assetId: 'asset-weth',
          }),
        ],
      }),
    ]);
    expect(result.lockedInOrders).toEqual(result.inMarketMaking);
  });

  it('returns persisted deposit and withdraw ledger activity', async () => {
    const {
      service,
      orderBalanceRepository,
      ledgerEntryRepository,
      userOrdersService,
    } = buildService();

    orderBalanceRepository.find.mockResolvedValue([]);
    userOrdersService.findMarketMakingByUserId.mockResolvedValueOnce([]);
    ledgerEntryRepository.find.mockResolvedValueOnce([
      {
        entryId: 'entry-deposit',
        orderId: 'web3:wallet:user-1',
        userId: 'user-1',
        assetId: 'asset-usdc',
        amount: '10',
        type: 'deposit_credit',
        refType: 'web3_wallet_deposit',
        refId: '0xdeposit',
        idempotencyKey: 'deposit-key',
        createdAt: '2026-06-01T00:00:00.000Z',
      },
      {
        entryId: 'entry-withdraw',
        orderId: 'order-1',
        userId: 'user-1',
        assetId: 'asset-usdc',
        amount: '-2.5',
        type: 'withdraw_debit',
        refType: 'web3_order_withdrawal',
        refId: 'withdraw-key',
        idempotencyKey: 'withdraw-key',
        createdAt: '2026-06-01T00:01:00.000Z',
      },
    ]);

    const result = await service.getBalances('user-1');

    expect(ledgerEntryRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1' }),
        order: { createdAt: 'DESC', entryId: 'DESC' },
      }),
    );
    expect(result.activity).toEqual([
      expect.objectContaining({
        activityId: 'entry-deposit',
        direction: 'deposit',
        scope: 'wallet',
        amount: '10',
        signedAmount: '10',
      }),
      expect.objectContaining({
        activityId: 'entry-withdraw',
        direction: 'withdrawal',
        scope: 'market_making_order',
        amount: '2.5',
        signedAmount: '-2.5',
      }),
    ]);
  });
});
