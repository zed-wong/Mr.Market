import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import {
  connectDemoWallet,
  disconnectWallet,
  walletAccount,
  walletAddress,
  walletChainId,
  walletHasAccount,
  walletIsConnected,
  walletIsUnsupported,
  walletNamespace,
  walletNetwork,
  walletStatus,
} from './wallet';

const resetWalletStores = () => {
  walletStatus.set('disconnected');
  walletAddress.set(null);
  walletNamespace.set(null);
  walletChainId.set(null);
  walletNetwork.set(null);
};

describe('deterministic demo wallet controls', () => {
  afterEach(() => {
    resetWalletStores();
    vi.unstubAllGlobals();
  });

  it('connects a supported deterministic EVM account without an external wallet', () => {
    connectDemoWallet('evm');

    expect(get(walletStatus)).toBe('connected');
    expect(get(walletIsConnected)).toBe(true);
    expect(get(walletIsUnsupported)).toBe(false);
    expect(get(walletAccount)).toMatchObject({
      id: 'evm-primary',
      namespace: 'evm',
      chainId: 1,
      network: 'Ethereum',
    });
  });

  it('connects a deterministic wrong-network account for browser validation', () => {
    connectDemoWallet('wrong-network');

    expect(get(walletStatus)).toBe('unsupported');
    expect(get(walletIsConnected)).toBe(false);
    expect(get(walletHasAccount)).toBe(true);
    expect(get(walletIsUnsupported)).toBe(true);
    expect(get(walletAccount)).toMatchObject({
      id: 'unsupported-polygon',
      namespace: 'evm',
      chainId: 137,
      network: 'Polygon (unsupported)',
      unsupported: true,
    });
  });

  it('clears deterministic demo wallet state without requiring AppKit', async () => {
    connectDemoWallet('solana');

    await disconnectWallet();

    expect(get(walletStatus)).toBe('disconnected');
    expect(get(walletAddress)).toBeNull();
    expect(get(walletAccount)).toBeNull();
  });

  it('persists demo wallet presets in session storage for route reloads', async () => {
    const values = new Map<string, string>();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });

    connectDemoWallet('wrong-network');
    expect(values.get('mrmarket-web3-demo-wallet')).toBe('wrong-network');

    await disconnectWallet();
    expect(values.has('mrmarket-web3-demo-wallet')).toBe(false);
  });
});
