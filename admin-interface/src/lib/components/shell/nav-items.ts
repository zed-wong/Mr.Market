// Single source of truth for the admin sidebar navigation. Routes use the
// new prefix-less layout: the dashboard is mounted at "/", every other
// feature lives under its own top-level path.
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
  { key: 'dashboard', label: 'admin.nav.dashboard', href: '/' },
  { key: 'users', label: 'admin.nav.users', href: '/users' },
  { key: 'exchanges', label: 'admin.nav.exchanges', href: '/exchanges' },
  { key: 'health', label: 'admin.nav.health', href: '/health' },
  { key: 'message', label: 'admin.nav.message', href: '/message' },
  {
    key: 'orders',
    label: 'admin.nav.orders',
    href: '/orders',
    children: [
      { key: 'orders.spot', label: 'admin.nav.orders_spot', href: '/orders/spot' },
      { key: 'orders.swap', label: 'admin.nav.orders_swap', href: '/orders/swap' },
    ],
  },
  { key: 'revenue', label: 'admin.nav.revenue', href: '/revenue' },
  {
    key: 'market_making',
    label: 'admin.nav.market_making',
    href: '/market-making/direct',
  },
  {
    key: 'rebalance',
    label: 'admin.nav.rebalance',
    href: '/rebalance',
    children: [
      { key: 'rebalance.new', label: 'admin.nav.rebalance_new', href: '/rebalance/new' },
    ],
  },
  {
    key: 'settings',
    label: 'admin.nav.settings',
    href: '/settings',
    children: [
      { key: 'settings.api_keys', label: 'admin.nav.settings_api_keys', href: '/settings/api-keys' },
      { key: 'settings.exchanges', label: 'admin.nav.settings_exchanges', href: '/settings/exchanges' },
      { key: 'settings.fees', label: 'admin.nav.settings_fees', href: '/settings/fees' },
      { key: 'settings.spot_trading', label: 'admin.nav.settings_spot_trading', href: '/settings/spot-trading' },
      { key: 'settings.market_making', label: 'admin.nav.settings_market_making', href: '/settings/market-making' },
      { key: 'settings.strategies', label: 'admin.nav.settings_strategies', href: '/settings/strategies' },
    ],
  },
];

export const isActive = (href: string, pathname: string): boolean => {
  if (href === '/') return pathname === '/' || pathname === '';
  return pathname === href || pathname.startsWith(`${href}/`);
};
