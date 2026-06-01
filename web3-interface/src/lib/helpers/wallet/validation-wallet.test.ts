import { describe, expect, it } from 'vitest';
import { connect, createConfig, http, signMessage } from '@wagmi/core';
import { mainnet, sepolia } from '@wagmi/core/chains';
import { verifyMessage } from 'viem';
import {
  createValidationWalletConnector,
  VALIDATION_WALLET_ADDRESS,
  VALIDATION_WALLET_CONNECTOR_ID,
} from './validation-wallet';

describe('validation wallet connector', () => {
  it('connects a deterministic EVM account and signs SIWE-compatible messages through wagmi', async () => {
    const validationConnector = createValidationWalletConnector();
    const config = createConfig({
      chains: [mainnet, sepolia],
      connectors: [validationConnector],
      transports: {
        [mainnet.id]: http(),
        [sepolia.id]: http(),
      },
    });

    const connector = config.connectors.find((candidate) => candidate.id === VALIDATION_WALLET_CONNECTOR_ID);
    expect(connector).toBeDefined();

    const connection = await connect(config, { connector: validationConnector });
    expect(connection.accounts).toEqual([VALIDATION_WALLET_ADDRESS]);
    expect(connection.chainId).toBe(mainnet.id);

    const message = 'Mr.Market validation SIWE message';
    const signature = await signMessage(config, {
      account: VALIDATION_WALLET_ADDRESS,
      message,
    });

    await expect(
      verifyMessage({
        address: VALIDATION_WALLET_ADDRESS,
        message,
        signature,
      })
    ).resolves.toBe(true);
  });
});
