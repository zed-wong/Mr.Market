export interface NavChild {
  key: string;
  label: string;
  href: string;
}

export interface NavGroup {
  key: string;
  label: string;
  href?: string;
  children: NavChild[];
}

export const NAV_ITEMS: NavGroup[] = [
  {
    key: 'overview',
    label: 'admin.nav.overview',
    href: '/',
    children: [],
  },
  {
    key: 'trading',
    label: 'admin.nav.trading',
    children: [
      { key: 'trading.strategies', label: 'admin.nav.strategies', href: '/trading/strategies' },
      { key: 'trading.positions', label: 'admin.nav.positions', href: '/trading/positions' },
      { key: 'trading.orders', label: 'admin.nav.orders', href: '/trading/orders' },
      { key: 'trading.exchanges', label: 'admin.nav.exchanges', href: '/trading/exchanges' },
      { key: 'trading.rebalance', label: 'admin.nav.rebalance', href: '/trading/rebalance' },
    ],
  },
  {
    key: 'system',
    label: 'admin.nav.system',
    children: [
      { key: 'system.health', label: 'admin.nav.health', href: '/system/health' },
      { key: 'system.logs', label: 'admin.nav.logs', href: '/system/logs' },
      { key: 'system.users', label: 'admin.nav.users', href: '/system/users' },
      { key: 'system.audit', label: 'admin.nav.audit_log', href: '/system/audit' },
      { key: 'system.api_keys', label: 'admin.nav.api_keys', href: '/system/api-keys' },
      { key: 'system.config', label: 'admin.nav.system_config', href: '/system/config' },
    ],
  },
];

export const isActive = (href: string, pathname: string): boolean => {
  if (href === '/') return pathname === '/' || pathname === '';
  return pathname === href || pathname.startsWith(`${href}/`);
};
