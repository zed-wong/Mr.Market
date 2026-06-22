import { OrderLpPosition } from 'src/common/entities/market-making/order-lp-position.entity';

import { OrderLpPositionService } from './order-lp-position.service';

describe('OrderLpPositionService', () => {
  const rows = new Map<string, OrderLpPosition>();
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      rows.set(value.id, value);

      return value;
    }),
    findOneBy: jest.fn(async (where) => {
      return (
        [...rows.values()].find((row) =>
          Object.entries(where).every(([key, value]) => row[key] === value),
        ) || null
      );
    }),
    find: jest.fn(async ({ where }) => {
      const clauses = Array.isArray(where) ? where : [where];

      return [...rows.values()].filter((row) =>
        clauses.some((clause) =>
          Object.entries(clause).every(([key, value]) => row[key] === value),
        ),
      );
    }),
  };

  beforeEach(() => {
    rows.clear();
    jest.clearAllMocks();
  });

  it('creates and updates order-attributed LP positions', async () => {
    const service = new OrderLpPositionService(repository as any);
    const position = await service.createOpening({
      userOrderId: 'user-order-1',
      ledgerOrderId: 'ledger-order-1',
      connectorId: 'uniswapV3',
      chainId: 1,
      tradingAccountId: 'account-1',
      positionTokenId: '123',
      poolAddress: '0xpool',
      token0: '0xtoken0',
      token1: '0xtoken1',
      feeTier: 3000,
      tickLower: -120,
      tickUpper: 120,
      liquidity: '100',
      openedByIntentId: 'intent-open',
    });

    expect(position).toMatchObject({
      status: 'opening',
      userOrderId: 'user-order-1',
      ledgerOrderId: 'ledger-order-1',
    });

    const updated = await service.updateStatus(position.id, {
      status: 'active',
      lastConfirmedBlock: 100,
      uncollectedFees0: '1',
    });

    expect(updated).toMatchObject({
      status: 'active',
      lastConfirmedBlock: 100,
      uncollectedFees0: '1',
    });
    await expect(service.findActiveByUserOrderId('user-order-1')).resolves.toHaveLength(1);
  });
});
