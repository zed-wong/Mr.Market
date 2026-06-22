/* eslint-disable @typescript-eslint/no-explicit-any */
import { BigNumber } from 'ethers';

import { EvmDexConnector } from './evm-dex-connector';

jest.mock('./adapters/utils/erc20', () => ({
  readDecimals: jest.fn().mockResolvedValue(6),
}));

describe('EvmDexConnector', () => {
  const adapterRegistry = {
    get: jest.fn(),
  };
  const provider = {};
  const adapter = {
    id: 'uniswapV3',
    supportsChain: jest.fn().mockReturnValue(true),
    getPool: jest
      .fn()
      .mockResolvedValue('0x0000000000000000000000000000000000000010'),
    quoteExactInputSingle: jest.fn().mockResolvedValue({
      amountOut: BigNumber.from('2000000'),
    }),
    estimateGasExactInputSingle: jest.fn().mockResolvedValue(
      BigNumber.from('120000'),
    ),
    exactInputSingle: jest.fn().mockResolvedValue({ hash: '0xtx' }),
    mint: jest.fn().mockResolvedValue({ hash: '0xlpadd' }),
    decreaseLiquidity: jest.fn().mockResolvedValue({ hash: '0xlpremove' }),
    collect: jest.fn().mockResolvedValue({ hash: '0xlpcollect' }),
  };
  const tradingAccountService = {
    getSigner: jest.fn().mockResolvedValue({
      provider,
      getAddress: jest
        .fn()
        .mockResolvedValue('0x0000000000000000000000000000000000000009'),
    }),
  };
  const tokenRegistryService = {
    resolveAssetId: jest.fn().mockResolvedValue('asset-id'),
    resolveNativeAssetId: jest.fn().mockResolvedValue('asset-eth'),
    resolveToken: jest.fn().mockResolvedValue({ decimals: 18 }),
  };
  const nonceAllocatorService = {
    preAllocate: jest.fn().mockResolvedValue({
      id: 'execution-1',
      nonce: 7,
    }),
  };
  const evmExecutionService = {
    findById: jest.fn().mockResolvedValue(null),
    markSubmitted: jest.fn().mockResolvedValue({
      id: 'execution-1',
    }),
  };
  const gasPriceOracleService = {
    quoteGasPrice: jest.fn().mockResolvedValue({
      gasPrice: BigNumber.from('100'),
    }),
  };
  const evmReceiptConfirmerService = {
    getConfirmationPolicy: jest.fn().mockReturnValue({
      requiredConfirmations: 12,
      pollIntervalMs: 12000,
      stuckPendingBlocks: 25,
    }),
  };
  const orderReservationService = {
    reserveForAmmSwapTokenIn: jest.fn().mockResolvedValue({ applied: true }),
    reserveForGasSponsor: jest.fn().mockResolvedValue({ applied: true }),
  };
  const orderLpPositionService = {
    findById: jest.fn().mockResolvedValue(null),
  };
  const baseIntent = {
    type: 'EXECUTE_AMM_SWAP' as const,
    intentId: 'intent-1',
    runtimeInstanceKey: 'runtime-1',
    strategyKey: 'strategy-1',
    userId: 'user-1',
    clientId: 'order-1',
    exchange: 'uniswapV3',
    connectorId: 'uniswapV3',
    pair: 'USDC/WETH',
    side: 'buy' as const,
    price: '0',
    qty: '100',
    createdAt: '2026-06-21T00:00:00.000Z',
    status: 'NEW' as const,
    metadata: {
      chainId: 1,
      tradingAccountId: 'account-1',
      gasSponsorLedgerOrderId: 'gas-sponsor-order',
      feeTier: 3000,
      tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    adapterRegistry.get.mockReturnValue(adapter);
    adapter.supportsChain.mockReturnValue(true);
    adapter.getPool.mockResolvedValue(
      '0x0000000000000000000000000000000000000010',
    );
    adapter.quoteExactInputSingle.mockResolvedValue({
      amountOut: BigNumber.from('2000000'),
    });
    adapter.estimateGasExactInputSingle.mockResolvedValue(
      BigNumber.from('120000'),
    );
    adapter.exactInputSingle.mockResolvedValue({ hash: '0xtx' });
    adapter.mint.mockResolvedValue({ hash: '0xlpadd' });
    adapter.decreaseLiquidity.mockResolvedValue({ hash: '0xlpremove' });
    adapter.collect.mockResolvedValue({ hash: '0xlpcollect' });
    nonceAllocatorService.preAllocate.mockResolvedValue({
      id: 'execution-1',
      nonce: 7,
    });
    evmExecutionService.markSubmitted.mockResolvedValue({
      id: 'execution-1',
    });
    evmExecutionService.findById.mockResolvedValue(null);
    tokenRegistryService.resolveNativeAssetId.mockResolvedValue('asset-eth');
    tokenRegistryService.resolveToken.mockResolvedValue({ decimals: 18 });
    orderReservationService.reserveForAmmSwapTokenIn.mockResolvedValue({
      applied: true,
    });
    orderReservationService.reserveForGasSponsor.mockResolvedValue({
      applied: true,
    });
  });

  function createConnector() {
    return new EvmDexConnector(
      adapterRegistry as any,
      tradingAccountService as any,
      tokenRegistryService as any,
      nonceAllocatorService as any,
      evmExecutionService as any,
      gasPriceOracleService as any,
      evmReceiptConfirmerService as any,
      orderReservationService as any,
      orderLpPositionService as any,
    );
  }

  it('submits an AMM swap through a durable EVM execution record', async () => {
    const connector = createConnector();

    const result = await connector.submitAction(baseIntent);

    expect(adapterRegistry.get).toHaveBeenCalledWith('uniswapV3');
    expect(tradingAccountService.getSigner).toHaveBeenCalledWith(
      'account-1',
      1,
    );
    expect(tokenRegistryService.resolveAssetId).toHaveBeenCalledWith(
      1,
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    );
    expect(tokenRegistryService.resolveAssetId).toHaveBeenCalledWith(
      1,
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    );
    expect(nonceAllocatorService.preAllocate).toHaveBeenCalledWith(
      expect.objectContaining({
        executionType: 'swap',
        userOrderId: 'order-1',
        ledgerOrderId: 'order-1',
        connectorId: 'uniswapV3',
        chainId: 1,
        tradingAccountId: 'account-1',
        requiredConfirmations: 12,
      }),
    );
    expect(
      orderReservationService.reserveForAmmSwapTokenIn,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'order-1',
        userOrderId: 'order-1',
        userId: 'user-1',
        intentId: 'intent-1',
        assetId: 'asset-id',
        amount: '100.0',
      }),
    );
    expect(orderReservationService.reserveForGasSponsor).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: 'gas-sponsor-order',
        userOrderId: 'order-1',
        accountLabel: 'funding_operator',
        userId: 'user-1',
        intentId: 'intent-1',
        gasAssetId: 'asset-eth',
        estimatedGasCost: '0.000000000012',
      }),
    );
    expect(adapter.exactInputSingle).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      expect.objectContaining({
        tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        transaction: expect.objectContaining({
          nonce: 7,
          gasLimit: BigNumber.from('120000'),
          gasPrice: BigNumber.from('100'),
        }),
      }),
    );
    expect(evmExecutionService.markSubmitted).toHaveBeenCalledWith(
      'execution-1',
      '0xtx',
    );
    expect(result).toMatchObject({
      status: 'submitted',
      txHash: '0xtx',
      evmExecutionId: 'execution-1',
    });
  });

  it('returns explicit not_supported for on-chain cancel', async () => {
    const connector = createConnector();

    await expect(
      connector.cancelAction({
        ...baseIntent,
        type: 'CANCEL_ORDER',
      }),
    ).resolves.toMatchObject({
      status: 'not_supported',
      details: { reason: 'on_chain_tx_cannot_be_cancelled' },
    });
  });

  it('submits ADD_LIQUIDITY through a durable LP EVM execution', async () => {
    const connector = createConnector();

    const result = await connector.submitAction({
      ...baseIntent,
      type: 'ADD_LIQUIDITY',
      metadata: {
        chainId: 1,
        tradingAccountId: 'account-1',
        gasSponsorLedgerOrderId: 'gas-sponsor-order',
        token0: '0x0000000000000000000000000000000000000001',
        token1: '0x0000000000000000000000000000000000000002',
        amount0Desired: '1000',
        amount1Desired: '2000',
        feeTier: 3000,
        tickLower: -120,
        tickUpper: 120,
        gasLimit: '500000',
      },
    });

    expect(nonceAllocatorService.preAllocate).toHaveBeenCalledWith(
      expect.objectContaining({
        executionType: 'lp_add',
        exchangeType: 'clmm',
        connectorId: 'uniswapV3',
      }),
    );
    expect(adapter.mint).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      expect.objectContaining({
        token0: '0x0000000000000000000000000000000000000001',
        token1: '0x0000000000000000000000000000000000000002',
        amount0Desired: BigNumber.from('1000'),
        amount1Desired: BigNumber.from('2000'),
        transaction: expect.objectContaining({ nonce: 7 }),
      }),
    );
    expect(result).toMatchObject({
      status: 'submitted',
      txHash: '0xlpadd',
      evmExecutionId: 'execution-1',
    });
  });

  it('submits REMOVE_LIQUIDITY and COLLECT_FEES through LP EVM executions', async () => {
    const connector = createConnector();

    await connector.submitAction({
      ...baseIntent,
      type: 'REMOVE_LIQUIDITY',
      metadata: {
        chainId: 1,
        tradingAccountId: 'account-1',
        gasSponsorLedgerOrderId: 'gas-sponsor-order',
        positionTokenId: '123',
        liquidity: '500',
        gasLimit: '500000',
      },
    });
    await connector.submitAction({
      ...baseIntent,
      intentId: 'intent-collect',
      type: 'COLLECT_FEES',
      metadata: {
        chainId: 1,
        tradingAccountId: 'account-1',
        gasSponsorLedgerOrderId: 'gas-sponsor-order',
        positionTokenId: '123',
        gasLimit: '500000',
      },
    });

    expect(adapter.decreaseLiquidity).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      expect.objectContaining({
        tokenId: '123',
        liquidity: BigNumber.from('500'),
      }),
    );
    expect(adapter.collect).toHaveBeenCalledWith(
      expect.any(Object),
      1,
      expect.objectContaining({
        tokenId: '123',
      }),
    );
    expect(nonceAllocatorService.preAllocate).toHaveBeenCalledWith(
      expect.objectContaining({ executionType: 'lp_remove' }),
    );
    expect(nonceAllocatorService.preAllocate).toHaveBeenCalledWith(
      expect.objectContaining({ executionType: 'lp_collect' }),
    );
  });

  it('queries EVM execution and LP position state', async () => {
    const connector = createConnector();

    evmExecutionService.findById.mockResolvedValue({
      id: 'execution-1',
      status: 'confirmed',
    });
    orderLpPositionService.findById.mockResolvedValue({
      id: 'position-1',
      status: 'active',
    });

    await expect(
      connector.queryState({
        ...baseIntent,
        metadata: {
          evmExecutionId: 'execution-1',
          positionId: 'position-1',
        },
      }),
    ).resolves.toMatchObject({
      status: 'confirmed',
      details: {
        evmExecutionId: 'execution-1',
        positionId: 'position-1',
      },
    });
  });
});
