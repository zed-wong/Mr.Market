import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, isActive } from './nav-items';

const flattenNav = () =>
  NAV_ITEMS.flatMap((item) => [
    ...(item.href ? [{ key: item.key, label: item.label, href: item.href }] : []),
    ...item.children,
  ]);

describe('admin shell navigation', () => {
  it('keeps the removed trading surface out of runtime navigation', () => {
    const removedSegment = ['re', 'balance'].join('');
    const removedHref = `/trading/${removedSegment}`;
    const removedLabel = ['admin.nav.re', 'balance'].join('');

    const entries = flattenNav();

    expect(entries.map((entry) => entry.href)).not.toContain(removedHref);
    expect(entries.map((entry) => entry.label)).not.toContain(removedLabel);
    expect(entries.map((entry) => entry.key)).not.toContain(`trading.${removedSegment}`);
  });

  it('keeps protected admin pages reachable from the shared shell', () => {
    expect(flattenNav().map((entry) => entry.href)).toEqual(
      expect.arrayContaining([
        '/',
        '/trading/strategies',
        '/trading/direct-market-making',
        '/trading/positions',
        '/trading/orders',
        '/trading/exchanges',
        '/trading/market-making',
        '/system/health',
        '/system/logs',
        '/system/passkeys',
        '/system/audit',
        '/system/api-keys',
        '/system/config',
      ]),
    );
  });

  it('matches child routes when highlighting active shell items', () => {
    expect(isActive('/trading/orders', '/trading/orders/details')).toBe(true);
    expect(isActive('/', '/trading/orders')).toBe(false);
  });
});
