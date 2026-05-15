export interface NavChild {
  key: string;
  label: string;
  href: string;
  deferred?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  href?: string;
  children: NavChild[];
  deferred?: boolean;
}

export const NAV_ITEMS: NavGroup[] = [
  {
    key: 'overview',
    label: 'admin.nav.overview',
    href: '/',
    children: [
      { key: 'overview.status', label: 'admin.nav.system_status', href: '/overview/status' },
      { key: 'overview.capital', label: 'admin.nav.capital_summary', href: '/overview/capital' },
      { key: 'overview.actions', label: 'admin.nav.pending_actions', href: '/overview/actions' },
      { key: 'overview.risks', label: 'admin.nav.risk_alerts', href: '/overview/risks' },
    ],
  },
  {
    key: 'trading',
    label: 'admin.nav.trading',
    children: [
      { key: 'trading.routes', label: 'admin.nav.routes', href: '/trading/routes' },
      { key: 'trading.strategies', label: 'admin.nav.strategies', href: '/trading/strategies' },
      { key: 'trading.runs', label: 'admin.nav.runs', href: '/trading/runs' },
      { key: 'trading.market_making', label: 'admin.nav.market_making', href: '/trading/market-making' },
      { key: 'trading.positions', label: 'admin.nav.positions', href: '/trading/positions' },
    ],
  },
  {
    key: 'system',
    label: 'admin.nav.system',
    children: [
      { key: 'system.logs', label: 'admin.nav.logs', href: '/system/logs' },
      { key: 'system.users', label: 'admin.nav.users', href: '/system/users' },
      { key: 'system.roles', label: 'admin.nav.roles', href: '/system/roles' },
      { key: 'system.api_keys', label: 'admin.nav.api_keys', href: '/system/api-keys' },
      { key: 'system.config', label: 'admin.nav.system_config', href: '/system/config' },
      { key: 'system.audit', label: 'admin.nav.audit_log', href: '/system/audit' },
    ],
  },
];

export const DEFERRED_NAV_ITEMS: NavGroup[] = [
  {
    key: 'funding',
    label: 'admin.nav.funding',
    deferred: true,
    children: [
      { key: 'funding.reservations', label: 'admin.nav.reservations', href: '/funding/reservations', deferred: true },
      { key: 'funding.orders', label: 'admin.nav.orders', href: '/funding/orders', deferred: true },
      { key: 'funding.deposits', label: 'admin.nav.deposits', href: '/funding/deposits', deferred: true },
      { key: 'funding.withdrawals', label: 'admin.nav.withdrawals', href: '/funding/withdrawals', deferred: true },
      { key: 'funding.treasury', label: 'admin.nav.treasury', href: '/funding/treasury', deferred: true },
      { key: 'funding.assets', label: 'admin.nav.assets', href: '/funding/assets', deferred: true },
    ],
  },
  {
    key: 'scheduling',
    label: 'admin.nav.scheduling',
    deferred: true,
    children: [
      { key: 'scheduling.chains', label: 'admin.nav.chain_schedules', href: '/scheduling/chains', deferred: true },
      { key: 'scheduling.jobs', label: 'admin.nav.job_queue', href: '/scheduling/jobs', deferred: true },
      { key: 'scheduling.retry', label: 'admin.nav.retry_center', href: '/scheduling/retry', deferred: true },
    ],
  },
];

export const isActive = (href: string, pathname: string): boolean => {
  if (href === '/') return pathname === '/' || pathname === '';
  return pathname === href || pathname.startsWith(`${href}/`);
};
