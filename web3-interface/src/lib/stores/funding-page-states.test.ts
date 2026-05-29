import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('funding and dashboard page state previews', () => {
  it('exposes loaded, loading, empty, and error states on wallet and home surfaces', () => {
    const walletSource = source('../../routes/app/wallet/+page.svelte');
    const homeSource = source('../../routes/app/+page.svelte');

    for (const pageSource of [walletSource, homeSource]) {
      expect(pageSource).toContain("= 'loaded'");
      expect(pageSource).toContain("'loading'");
      expect(pageSource).toContain("'empty'");
      expect(pageSource).toContain("'error'");
    }

    expect(walletSource).toContain('wallet-state-select');
    expect(walletSource).toContain('wallet-loading-state');
    expect(walletSource).toContain('wallet-empty-state');
    expect(walletSource).toContain('wallet-error-state');

    expect(homeSource).toContain('home-state-select');
    expect(homeSource).toContain('home-loading-state');
    expect(homeSource).toContain('home-empty-state');
    expect(homeSource).toContain('home-error-state');
  });

  it('keeps order detail loading, error, gating, and not-found states discoverable', () => {
    const orderDetailSource = source('../../routes/app/market-making/order/[id]/+page.svelte');

    expect(orderDetailSource).toContain('order-loading-state');
    expect(orderDetailSource).toContain('order-error-state');
    expect(orderDetailSource).toContain('order-detail-retry');
    expect(orderDetailSource).toContain('order-detail-connect-gate');
    expect(orderDetailSource).toContain('order-detail-unsupported-gate');
    expect(orderDetailSource).toContain('order-not-found');
  });
});
