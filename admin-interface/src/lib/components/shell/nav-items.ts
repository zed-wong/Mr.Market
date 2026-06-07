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
    key: 'setup',
    label: 'admin.nav.setup',
    children: [
      { key: 'setup.guide', label: 'admin.nav.setup_guide', href: '/setup' },
    ],
  },
  {
    key: 'trading',
    label: 'admin.nav.trading',
    children: [
      { key: 'trading.user_orders', label: 'admin.nav.user_orders', href: '/trading/user-orders' },
      { key: 'trading.exchange_orders', label: 'admin.nav.exchange_orders', href: '/trading/exchange-orders' },
      { key: 'trading.market_making', label: 'admin.nav.market_making', href: '/trading/market-making' },
      { key: 'trading.strategies', label: 'admin.nav.strategies', href: '/trading/strategies' },
      { key: 'trading.positions', label: 'admin.nav.positions', href: '/trading/positions' },
      { key: 'trading.analytics', label: 'admin.nav.analytics', href: '/trading/analytics' },
    ],
  },
  {
    key: 'connectivity',
    label: 'admin.nav.connectivity',
    children: [
      { key: 'connectivity.exchange_connectivity', label: 'admin.nav.exchange_connectivity', href: '/system/connectivity/exchanges' },
      { key: 'connectivity.balances', label: 'admin.nav.balances', href: '/system/connectivity/balances' },
    ],
  },
  {
    key: 'system',
    label: 'admin.nav.system',
    children: [
      { key: 'system.health', label: 'admin.nav.health', href: '/system/health' },
      { key: 'system.config', label: 'admin.nav.system_config', href: '/system/config' },
      { key: 'system.password', label: 'admin.nav.password', href: '/system/password' },
      { key: 'system.passkeys', label: 'admin.nav.passkeys', href: '/system/passkeys' },
      { key: 'system.audit', label: 'admin.nav.audit_log', href: '/system/audit' },
    ],
  },
  {
    key: 'developer',
    label: 'admin.nav.developer',
    children: [
      { key: 'developer.direct_market_making', label: 'admin.nav.settings_direct_market_making', href: '/trading/direct-market-making' },
    ],
  },
];

export const isActive = (href: string, pathname: string): boolean => {
  if (href === '/') return pathname === '/' || pathname === '';
  return pathname === href || pathname.startsWith(`${href}/`);
};

export const isGroupActive = (item: NavGroup, pathname: string): boolean =>
  Boolean(item.href && isActive(item.href, pathname)) ||
  item.children.some((child) => isActive(child.href, pathname));

export const getActiveNavLocation = (
  pathname: string,
): { group: NavGroup; child?: NavChild } | null => {
  for (const group of NAV_ITEMS) {
    if (group.href && isActive(group.href, pathname)) {
      return { group };
    }

    const child = group.children.find((entry) => isActive(entry.href, pathname));
    if (child) {
      return { group, child };
    }
  }

  return null;
};
