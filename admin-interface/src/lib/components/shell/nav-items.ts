// Single source of truth for the admin sidebar navigation. Mirrors the
// previous interface "manage" page sidebar: a single Settings section that
// groups all admin operations.
export interface NavChild {
  key: string;
  label: string;
  href: string;
}

export interface NavItem {
  key: string;
  label: string;
  href: string;
  children?: NavChild[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: 'settings',
    label: 'admin.nav.settings',
    href: '/settings',
    children: [
      { key: 'settings.exchanges', label: 'admin.nav.settings_exchanges', href: '/settings/exchanges' },
      { key: 'settings.spot_trading', label: 'admin.nav.settings_spot_trading', href: '/settings/spot-trading' },
      { key: 'settings.market_making', label: 'admin.nav.settings_market_making', href: '/settings/market-making' },
      { key: 'settings.fees', label: 'admin.nav.settings_fees', href: '/settings/fees' },
      { key: 'settings.api_keys', label: 'admin.nav.settings_api_keys', href: '/settings/api-keys' },
      { key: 'settings.strategies', label: 'admin.nav.settings_strategies', href: '/settings/strategies' },
      { key: 'settings.direct_market_making', label: 'admin.nav.settings_direct_market_making', href: '/market-making/direct' },
    ],
  },
];

export const isActive = (href: string, pathname: string): boolean => {
  if (href === '/') return pathname === '/' || pathname === '';
  return pathname === href || pathname.startsWith(`${href}/`);
};
