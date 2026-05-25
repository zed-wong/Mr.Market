import { describe, expect, it } from 'vitest';
import { authMatchesWalletScope } from './wallet-scope';

describe('wallet-scoped web3 market-making auth', () => {
  it('accepts an auth session only when token, address, chain id, and expiry scope match', () => {
    expect(
      authMatchesWalletScope({
        auth: {
          token: 'jwt',
          address: '0xA11CE00000000000000000000000000000000001',
          chainId: '1',
          userId: null,
        },
        address: '0xa11ce00000000000000000000000000000000001',
        chainId: 1,
        hasUsableSession: true,
      })
    ).toBe(true);
  });

  it('rejects stale EVM auth when the active wallet switches to Solana', () => {
    expect(
      authMatchesWalletScope({
        auth: {
          token: 'evm-jwt',
          address: '0xA11CE00000000000000000000000000000000001',
          chainId: '1',
          userId: null,
        },
        address: 'So11111111111111111111111111111111111111112',
        chainId: '0',
        hasUsableSession: true,
      })
    ).toBe(false);
  });

  it('rejects matching wallet metadata when the local session is expired or missing a token', () => {
    expect(
      authMatchesWalletScope({
        auth: {
          token: 'jwt',
          address: 'So11111111111111111111111111111111111111112',
          chainId: '0',
          userId: null,
        },
        address: 'So11111111111111111111111111111111111111112',
        chainId: '0',
        hasUsableSession: false,
      })
    ).toBe(false);

    expect(
      authMatchesWalletScope({
        auth: {
          token: null,
          address: 'So11111111111111111111111111111111111111112',
          chainId: '0',
          userId: null,
        },
        address: 'So11111111111111111111111111111111111111112',
        chainId: '0',
        hasUsableSession: true,
      })
    ).toBe(false);
  });
});
