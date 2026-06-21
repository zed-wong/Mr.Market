/* eslint-disable @typescript-eslint/no-explicit-any */
import { EvmDexConnector } from './evm-dex-connector';

describe('EvmDexConnector', () => {
  const adapterRegistry = {
    get: jest.fn().mockReturnValue({ id: 'uniswapV3' }),
  };
  const tradingAccountService = {
    getSigner: jest.fn().mockResolvedValue({ address: '0xwallet' }),
  };
  const tokenRegistryService = {
    resolveAssetId: jest.fn().mockResolvedValue('asset-id'),
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
      tokenIn: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      tokenOut: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates EVM DEX adapter, signer, and token registry before returning explicit phase boundary', async () => {
    const connector = new EvmDexConnector(
      adapterRegistry as any,
      tradingAccountService as any,
      tokenRegistryService as any,
    );

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
    expect(result).toEqual({
      status: 'not_supported',
      details: {
        reason: 'evm_execution_lifecycle_not_implemented_until_phase_4',
        connectorId: 'uniswapV3',
        chainId: 1,
        intentType: 'EXECUTE_AMM_SWAP',
      },
    });
  });

  it('returns explicit not_supported for on-chain cancel', async () => {
    const connector = new EvmDexConnector(
      adapterRegistry as any,
      tradingAccountService as any,
      tokenRegistryService as any,
    );

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
