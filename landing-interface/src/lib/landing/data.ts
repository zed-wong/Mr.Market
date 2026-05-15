export const scoreCards = [
  {
    label: 'order-scoped ledger',
    value: '100%',
    detail: 'Every balance movement belongs to one market-making order.',
  },
  {
    label: 'visible depth',
    value: '$8.4m',
    detail: 'Bid and ask liquidity measured where makers actually quote.',
  },
  {
    label: 'median spread',
    value: '18 bps',
    detail: 'Campaigns reward useful, tight, durable markets.',
  },
];

export const depthRows = [
  { side: 'ask', price: '1.0042', amount: '62,400', depth: 84 },
  { side: 'ask', price: '1.0038', amount: '48,100', depth: 66 },
  { side: 'ask', price: '1.0031', amount: '29,850', depth: 43 },
  { side: 'bid', price: '0.9994', amount: '34,500', depth: 49 },
  { side: 'bid', price: '0.9988', amount: '51,200', depth: 72 },
  { side: 'bid', price: '0.9981', amount: '73,900', depth: 91 },
];

export const makers = [
  {
    rank: '01',
    name: 'Ledger North',
    pair: 'XIN / USDT',
    score: '94.2',
    spread: '14 bps',
    uptime: '99.1%',
    volume: '$4.8m',
    rewards: '$7,420',
  },
  {
    rank: '02',
    name: 'Aperture MM',
    pair: 'pUSD / USDT',
    score: '88.7',
    spread: '19 bps',
    uptime: '97.8%',
    volume: '$3.1m',
    rewards: '$5,880',
  },
  {
    rank: '03',
    name: 'Vault Line',
    pair: 'BTC / USDT',
    score: '81.4',
    spread: '22 bps',
    uptime: '96.4%',
    volume: '$2.6m',
    rewards: '$3,140',
  },
  {
    rank: '04',
    name: 'Tight Spread',
    pair: 'ETH / USDT',
    score: '76.9',
    spread: '27 bps',
    uptime: '94.9%',
    volume: '$1.9m',
    rewards: '$2,460',
  },
  {
    rank: '05',
    name: 'Quote Workshop',
    pair: 'SOL / USDT',
    score: '72.1',
    spread: '31 bps',
    uptime: '91.8%',
    volume: '$1.4m',
    rewards: '$1,920',
  },
];

export const flows = [
  {
    title: 'Funding layer',
    body: 'Mixin, EVM, and future rails credit an order balance instead of a loose user wallet.',
  },
  {
    title: 'Scheduling layer',
    body: 'Strategy controllers create intents; they do not mutate balances or place exchange orders.',
  },
  {
    title: 'Trading layer',
    body: 'Intent workers reserve quota, place external orders, settle fills, and release unused locks.',
  },
  {
    title: 'Reward layer',
    body: 'Campaigns score depth, spread quality, uptime, and attributable volume before distributing rewards.',
  },
];

export const campaigns = [
  { pair: 'XIN / USDT', exchange: 'MEXC', pool: '$12,000', target: '$500k depth', status: 'active' },
  { pair: 'pUSD / USDT', exchange: 'Bitfinex', pool: '$8,500', target: '$250k depth', status: 'active' },
  { pair: 'BTC / USDT', exchange: 'Binance', pool: '$21,000', target: '$1.2m depth', status: 'forming' },
];

export const epochStats = [
  { label: 'reward pool', value: '$41,500' },
  { label: 'attributable volume', value: '$13.8m' },
  { label: 'qualified makers', value: '124' },
  { label: 'avg uptime', value: '96.2%' },
];

export const offeringGroups = [
  {
    title: 'Who we serve',
    items: [
      'Token projects',
      'Protocol treasuries',
      'Exchange listings',
      'Launch campaigns',
      'Market makers',
      'Liquidity operators',
    ],
  },
  {
    title: 'Services we offer',
    items: ['Liquidity campaigns', 'Maker competition', 'Reward attribution'],
  },
];

export const strategyOfferings = [
  'Campaign treasury',
  'Order-scoped ledger',
  'Reservation engine',
  'Exchange execution',
  'Depth scoring',
  'Spread quality',
  'Uptime windows',
  'Attributable volume',
  'Reward distribution',
  'Reconciliation trace',
  'Public leaderboard',
];

export const offeringHeroStats = [
  { label: 'Campaigns', value: '03' },
  { label: 'Qualified makers', value: '124' },
  { label: 'Reward pool', value: '$41.5k' },
];
