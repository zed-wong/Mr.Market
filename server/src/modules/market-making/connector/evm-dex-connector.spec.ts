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
    nonceAllocatorService.preAllocate.mockResolvedValue({
      id: 'execution-1',
      nonce: 7,
    });
    evmExecutionService.markSubmitted.mockResolvedValue({
      id: 'execution-1',
    });
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
});
