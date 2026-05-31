import { describe, expect, it } from 'vitest';

import { NAV_ITEMS, getActiveNavLocation, isActive, isGroupActive } from './nav-items';

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
        '/setup',
        '/trading/strategies',
        '/trading/direct-market-making',
        '/trading/positions',
        '/trading/exchange-orders',
        '/trading/user-orders',
        '/system/connectivity/exchanges',
        '/trading/market-making',
        '/system/health',
        '/system/password',
        '/system/passkeys',
        '/system/audit',
        '/system/config',
      ]),
    );
  });

  it('matches child routes when highlighting active shell items', () => {
    expect(isActive('/trading/exchange-orders', '/trading/exchange-orders/details')).toBe(true);
    expect(isActive('/trading/exchange-orders', '/trading/user-orders')).toBe(false);
    expect(isActive('/trading/user-orders', '/trading/exchange-orders')).toBe(false);
    expect(isActive('/', '/trading/exchange-orders')).toBe(false);
  });

  it('groups setup, trading, connectivity, system, and diagnostics as first-class sections', () => {
    expect(NAV_ITEMS.map((item) => item.key)).toEqual(
      expect.arrayContaining(['setup', 'trading', 'connectivity', 'system', 'diagnostics']),
    );
    expect(NAV_ITEMS.find((item) => item.key === 'setup')?.children.map((entry) => entry.href)).toContain('/setup');
    expect(NAV_ITEMS.find((item) => item.key === 'trading')?.children.map((entry) => entry.href)).toEqual([
      '/trading/user-orders',
      '/trading/exchange-orders',
      '/trading/market-making',
      '/trading/strategies',
      '/trading/positions',
      '/trading/direct-market-making',
    ]);
    expect(NAV_ITEMS.find((item) => item.key === 'system')?.children.map((entry) => entry.href)).toEqual([
      '/system/health',
      '/system/config',
      '/system/password',
      '/system/passkeys',
    ]);
    expect(NAV_ITEMS.find((item) => item.key === 'connectivity')?.children.map((entry) => entry.href)).toEqual([
      '/system/connectivity/exchanges',
    ]);
    expect(NAV_ITEMS.find((item) => item.key === 'diagnostics')?.children.map((entry) => entry.href)).toEqual(
      ['/system/audit'],
    );
  });

  it('exposes active group and child location for collapsed or narrow shell labels', () => {
    const location = getActiveNavLocation('/system/connectivity/exchanges');

    expect(location?.group.key).toBe('connectivity');
    expect(location?.child?.href).toBe('/system/connectivity/exchanges');
    expect(isGroupActive(location!.group, '/system/connectivity/exchanges')).toBe(true);
  });
});
