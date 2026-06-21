import { EvmExecution } from 'src/common/entities/market-making/evm-execution.entity';

import { EvmExecutionService } from './evm-execution.service';

describe('EvmExecutionService', () => {
  const rows = new Map<string, EvmExecution>();
  const repository = {
    create: jest.fn((value: EvmExecution) => value),
    save: jest.fn(async (value: EvmExecution) => {
      rows.set(value.id, value);

      return value;
    }),
    findOneBy: jest.fn(async (where: Partial<EvmExecution>) => {
      return (
        [...rows.values()].find((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof EvmExecution] === value,
          ),
        ) || null
      );
    }),
    findOne: jest.fn(async ({ where }: { where: Partial<EvmExecution> }) => {
      return (
        [...rows.values()].find((row) =>
          Object.entries(where).every(
            ([key, value]) => row[key as keyof EvmExecution] === value,
          ),
        ) || null
      );
    }),
    find: jest.fn(async () => [...rows.values()]),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({ maxNonce: 7 })),
    })),
  };

  beforeEach(() => {
    rows.clear();
    jest.clearAllMocks();
  });

  it('creates, submits, and confirms EVM executions', async () => {
    const service = new EvmExecutionService(repository as any);
    const execution = await service.createCreated({
      executionType: 'swap',
      userOrderId: 'user-order-1',
      ledgerOrderId: 'ledger-order-1',
      intentId: 'intent-1',
      connectorId: 'uniswapV3',
      exchangeType: 'amm',
      chainId: 1,
      tradingAccountId: 'account-1',
      nonce: 4,
      requiredConfirmations: 12,
    });

    expect(execution).toMatchObject({
      executionType: 'swap',
      status: 'created',
      nonce: 4,
      requiredConfirmations: 12,
    });

    await service.markSubmitted(execution.id, '0xtx');
    const confirmed = await service.markConfirmed(execution.id, {
      blockNumber: 100,
      confirmationCount: 12,
      receipt: { transactionHash: '0xtx', status: 1 },
      gasUsed: '21000',
      gasPrice: '100',
      effectiveGasCost: '2100000',
    });

    expect(confirmed).toMatchObject({
      status: 'confirmed',
      txHash: '0xtx',
      blockNumber: 100,
      confirmationCount: 12,
      gasUsed: '21000',
      gasPrice: '100',
      effectiveGasCost: '2100000',
    });
    expect(confirmed.receiptContentHash).toHaveLength(64);
  });

  it('records manual review reason and pending block observations', async () => {
    const service = new EvmExecutionService(repository as any);
    const execution = await service.createCreated({
      executionType: 'swap',
      userOrderId: 'user-order-1',
      ledgerOrderId: 'ledger-order-1',
      intentId: 'intent-1',
      connectorId: 'uniswapV3',
      exchangeType: 'amm',
      chainId: 1,
      tradingAccountId: 'account-1',
      nonce: 4,
      requiredConfirmations: 12,
    });

    await service.recordPendingObservation(execution.id, 100);
    const observed = await service.recordPendingObservation(execution.id, 105);

    expect(observed.firstPendingBlockNumber).toBe(100);
    expect(observed.lastCheckedBlockNumber).toBe(105);

    const manualReview = await service.markManualReview(
      execution.id,
      'stuck_pending',
    );

    expect(manualReview).toMatchObject({
      status: 'manual_review',
      manualReviewReason: 'stuck_pending',
    });
  });
});
