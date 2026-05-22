// Mock data for the dashboard. Replace with real API calls once endpoints are ready.

export interface Kpi {
  key: string;
  label: string;
  value: string;
  unit?: string;
  deltaPct: number; // negative or positive percent
  series: number[]; // sparkline values
}

export interface Strategy {
  id: string;
  name: string;
  pair: string;
  exchange: string;
  status: 'healthy' | 'delayed' | 'paused' | 'error';
  pnl24h: string; // formatted
  pnl24hPositive: boolean;
  inventoryBps: number; // skew bps
  fillsToday: number;
  spreadBps: number;
}

export interface Intent {
  id: string;
  ts: string; // HH:MM:SS
  kind: 'fill' | 'place' | 'cancel' | 'reward' | 'withdraw';
  side: 'buy' | 'sell' | null;
  symbol: string;
  qty: string;
  price?: string;
  exchange: string;
  status: 'ok' | 'pending' | 'failed';
}

export interface SystemSignal {
  key: string;
  label: string;
  status: 'ok' | 'warn' | 'error';
  meta: string;
}

export interface ExchangeAllocation {
  exchange: string;
  amount: number; // USD
  pct: number; // 0-100
}

export const kpis: Kpi[] = [
  {
    key: 'aum',
    label: 'Total AUM',
    value: '12,438,920.45',
    unit: 'USD',
    deltaPct: 2.34,
    series: [10.2, 10.4, 10.3, 10.7, 11.1, 10.9, 11.4, 11.8, 11.7, 12.0, 12.2, 12.1, 12.4],
  },
  {
    key: 'orders',
    label: 'Active Orders',
    value: '847',
    deltaPct: -3.1,
    series: [880, 901, 895, 870, 866, 855, 860, 851, 840, 845, 852, 849, 847],
  },
  {
    key: 'vol24h',
    label: '24h Volume',
    value: '2,104,553.10',
    unit: 'USD',
    deltaPct: 8.72,
    series: [1.4, 1.5, 1.55, 1.6, 1.7, 1.78, 1.82, 1.9, 1.95, 2.0, 2.05, 2.08, 2.1],
  },
  {
    key: 'recon',
    label: 'Reconciliation',
    value: '100.00',
    unit: '%',
    deltaPct: 0,
    series: [100, 100, 99.98, 100, 100, 99.99, 100, 100, 100, 100, 100, 100, 100],
  },
];

export const strategies: Strategy[] = [
  {
    id: 'mm-btc-usdt-bn',
    name: 'MM · BTC/USDT',
    pair: 'BTC/USDT',
    exchange: 'binance',
    status: 'healthy',
    pnl24h: '+1,284.50',
    pnl24hPositive: true,
    inventoryBps: 12,
    fillsToday: 412,
    spreadBps: 6,
  },
  {
    id: 'mm-eth-usdt-bn',
    name: 'MM · ETH/USDT',
    pair: 'ETH/USDT',
    exchange: 'binance',
    status: 'healthy',
    pnl24h: '+812.20',
    pnl24hPositive: true,
    inventoryBps: -8,
    fillsToday: 327,
    spreadBps: 7,
  },
  {
    id: 'mm-sol-usdt-ok',
    name: 'MM · SOL/USDT',
    pair: 'SOL/USDT',
    exchange: 'okx',
    status: 'delayed',
    pnl24h: '+143.80',
    pnl24hPositive: true,
    inventoryBps: 34,
    fillsToday: 188,
    spreadBps: 14,
  },
  {
    id: 'arb-xin-bn-mx',
    name: 'ARB · XIN binance/mixin',
    pair: 'XIN/USDT',
    exchange: 'binance · mixin',
    status: 'paused',
    pnl24h: '0.00',
    pnl24hPositive: true,
    inventoryBps: 0,
    fillsToday: 0,
    spreadBps: 0,
  },
  {
    id: 'mm-usdc-usdt',
    name: 'MM · USDC/USDT',
    pair: 'USDC/USDT',
    exchange: 'binance',
    status: 'error',
    pnl24h: '-12.10',
    pnl24hPositive: false,
    inventoryBps: 87,
    fillsToday: 56,
    spreadBps: 3,
  },
];

export const intents: Intent[] = [
  {
    id: 'i_01HX01',
    ts: '12:03:41',
    kind: 'fill',
    side: 'buy',
    symbol: 'BTC/USDT',
    qty: '0.0250',
    price: '68,412.30',
    exchange: 'binance',
    status: 'ok',
  },
  {
    id: 'i_01HX02',
    ts: '12:03:12',
    kind: 'place',
    side: 'sell',
    symbol: 'ETH/USDT',
    qty: '1.2500',
    price: '3,512.80',
    exchange: 'binance',
    status: 'ok',
  },
  {
    id: 'i_01HX03',
    ts: '12:02:58',
    kind: 'fill',
    side: 'sell',
    symbol: 'ETH/USDT',
    qty: '0.8400',
    price: '3,513.10',
    exchange: 'binance',
    status: 'ok',
  },
  {
    id: 'i_01HX04',
    ts: '12:02:30',
    kind: 'cancel',
    side: null,
    symbol: 'SOL/USDT',
    qty: '24.00',
    exchange: 'okx',
    status: 'ok',
  },
  {
    id: 'i_01HX06',
    ts: '12:01:02',
    kind: 'fill',
    side: 'buy',
    symbol: 'BTC/USDT',
    qty: '0.0180',
    price: '68,410.50',
    exchange: 'binance',
    status: 'ok',
  },
  {
    id: 'i_01HX07',
    ts: '12:00:31',
    kind: 'reward',
    side: null,
    symbol: 'USDT',
    qty: '38.42',
    exchange: 'ledger',
    status: 'ok',
  },
  {
    id: 'i_01HX08',
    ts: '11:59:58',
    kind: 'place',
    side: 'buy',
    symbol: 'USDC/USDT',
    qty: '5,000.00',
    price: '0.9998',
    exchange: 'binance',
    status: 'failed',
  },
];

export const system: SystemSignal[] = [
  { key: 'api', label: 'API', status: 'ok', meta: '4ms · p95 28ms' },
  { key: 'exchange', label: 'Exchanges', status: 'ok', meta: '3 / 3 connected' },
  { key: 'db', label: 'Database', status: 'ok', meta: 'replication 0.4s' },
  { key: 'reconciler', label: 'Reconciler', status: 'ok', meta: 'last 02s ago' },
  { key: 'scheduler', label: 'Scheduler', status: 'warn', meta: 'tick drift 120ms' },
  { key: 'mixin', label: 'Mixin', status: 'ok', meta: 'snapshots live' },
];

export const allocations: ExchangeAllocation[] = [
  { exchange: 'binance', amount: 7_812_400, pct: 62.8 },
  { exchange: 'okx', amount: 2_410_100, pct: 19.4 },
  { exchange: 'bitfinex', amount: 1_204_200, pct: 9.7 },
  { exchange: 'mixin', amount: 1_012_220, pct: 8.1 },
];

export const flowSeries: number[] = [
  18, 22, 19, 28, 31, 26, 34, 41, 38, 47, 52, 49, 58, 61, 55, 64, 70, 66, 73, 81, 76, 84, 88, 92,
];

export const lastUpdated = '12:04:02 UTC';
