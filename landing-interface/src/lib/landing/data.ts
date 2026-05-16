export const heroPills = [
  { index: '01', label: 'Open' },
  { index: '02', label: 'Compete' },
  { index: '03', label: 'Settle' },
];

export const problems = [
  {
    name: 'Negotiated',
    text: 'Liquidity is granted through private deals between projects and a handful of permissioned market makers.',
  },
  {
    name: 'Opaque',
    text: 'No standard way to measure depth, spread quality, or uptime. Fake volume goes undetected.',
  },
  {
    name: 'Permissioned',
    text: 'New tokens depend on relationships, not on a protocol. Liquidity is a privilege, not a capability.',
  },
];

export const shiftCompare = {
  left: {
    label: 'Yesterday',
    title: 'Trading-bot primitives',
    body: 'Spreads, inventory skew, connectors, scripts. Powerful, but only useful if you already are a market-making engineer.',
  },
  right: {
    label: 'Mr.Market',
    title: 'Liquidity workflows',
    body: 'Open a campaign, set a budget, pick a target. The system absorbs the complexity; the user expresses intent.',
  },
};

export const audiences = [
  {
    label: 'For founders & treasuries',
    title: 'Post a public liquidity mandate.',
    body: 'Set a budget, a target depth, and a reward pool. Stop asking market makers for favors. The market becomes visible before you pay for it.',
    cta: { href: '/offerings', text: 'See offerings →' },
  },
  {
    label: 'For makers & operators',
    title: 'Run an open, TEE-protected engine.',
    body: 'Compete on durable spread, useful depth, uptime, and attributable volume. Rewards are settled by rule, not by relationship.',
    cta: { href: '/leaderboard', text: 'View leaderboard →' },
  },
];

export const makers = [
  { rank: '01', name: 'Ledger North', pair: 'XIN / USDT', score: '94.2', spread: '14 bps', uptime: '99.1%', volume: '$4.8m', rewards: '$7,420' },
  { rank: '02', name: 'Aperture MM', pair: 'pUSD / USDT', score: '88.7', spread: '19 bps', uptime: '97.8%', volume: '$3.1m', rewards: '$5,880' },
  { rank: '03', name: 'Vault Line', pair: 'BTC / USDT', score: '81.4', spread: '22 bps', uptime: '96.4%', volume: '$2.6m', rewards: '$3,140' },
  { rank: '04', name: 'Tight Spread', pair: 'ETH / USDT', score: '76.9', spread: '27 bps', uptime: '94.9%', volume: '$1.9m', rewards: '$2,460' },
  { rank: '05', name: 'Quote Workshop', pair: 'SOL / USDT', score: '72.1', spread: '31 bps', uptime: '91.8%', volume: '$1.4m', rewards: '$1,920' },
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

export const offeringHeroStats = [
  { label: 'Campaigns', value: '03' },
  { label: 'Qualified makers', value: '124' },
  { label: 'Reward pool', value: '$41.5k' },
];

export type OfferingGroup = 'audience' | 'service' | 'outcome';

export type OfferingPage = {
  slug: string;
  group: OfferingGroup;
  label: string;
  title: string;
  tagline: string;
  quote?: { text: string; attribution?: string };
  description?: { heading: string; body: string };
  grid: {
    label: string;
    items: { heading: string; body: string }[];
  };
  cta?: { href: string; text: string };
};

export const offeringPages: OfferingPage[] = [
  // ─── AUDIENCES ─────────────────────────────────────────────
  {
    slug: 'token-projects',
    group: 'audience',
    label: 'Token projects without a market maker',
    title: 'Token Projects',
    tagline: 'Get measurable liquidity without negotiating a private deal.',
    grid: {
      label: "Here's how Mr.Market helps",
      items: [
        {
          heading: 'Open a public campaign',
          body: 'Define a target pair, depth goal, spread goal, and reward pool. Skip private negotiations and gatekept deals.',
        },
        {
          heading: 'Public proof, not promises',
          body: 'Spread, depth, uptime, and attributable volume are visible on the leaderboard before any reward is paid.',
        },
        {
          heading: 'Attributable fills',
          body: 'Every fill is tied to your campaign and to a specific Mr.Market order — never to an anonymous account.',
        },
        {
          heading: 'Guided setup',
          body: 'You express a target and a budget. The system selects strategies, exchanges, fund splits, and risk envelopes.',
        },
        {
          heading: 'Audit trail by default',
          body: 'Every reward, fee, and reversal lives in an immutable ledger. There is no off-book reconciliation.',
        },
      ],
    },
    cta: { href: '/leaderboard', text: 'See live campaigns →' },
  },
  {
    slug: 'protocol-treasuries',
    group: 'audience',
    label: 'Protocol treasuries that want auditable execution',
    title: 'Protocol Treasuries',
    tagline: 'Order-scoped balances, immutable ledger, attributable fills.',
    grid: {
      label: "Here's how Mr.Market helps",
      items: [
        {
          heading: 'Order-scoped attribution',
          body: 'Funds are scoped by orderId + asset, not by user or wallet. Every deployed dollar traces back to a specific order.',
        },
        {
          heading: 'Reservation before execution',
          body: 'External orders clear a risk check and an order-level reservation before they are placed on any exchange.',
        },
        {
          heading: 'Immutable ledger',
          body: 'Every balance change is an append-only ledger entry. Corrections happen through reversals, never through edits.',
        },
        {
          heading: 'Reconciliation that blocks',
          body: 'Mismatches between internal ledger and exchange state block risk-increasing operations until resolved.',
        },
        {
          heading: 'No generic adjustment path',
          body: 'Only typed, order-attributed mutations. No "miscellaneous adjustment" hides activity from your audit.',
        },
      ],
    },
    cta: { href: '/leaderboard', text: 'See the ledger in action →' },
  },
  {
    slug: 'exchange-listings',
    group: 'audience',
    label: 'Exchange listings that need real depth on day one',
    title: 'Exchange Listings',
    tagline: 'Show up to launch with public, measurable depth — not promises.',
    grid: {
      label: "Here's how Mr.Market helps",
      items: [
        {
          heading: 'Time-boxed campaign',
          body: 'A high-density reward pool sized for your listing window concentrates maker effort exactly when it matters.',
        },
        {
          heading: 'Measurable depth from hour one',
          body: 'The order book is filled by competing makers, scored on useful depth at the target zone — not far-band quotes.',
        },
        {
          heading: 'Visible to the exchange',
          body: 'Spread, uptime, and depth are public to anyone — including the listing team and the community.',
        },
        {
          heading: 'Persistent record',
          body: 'The leaderboard preserves the launch outcome. Future campaigns build on the same scoring rules and audit trail.',
        },
        {
          heading: 'Bridge to ongoing quality',
          body: 'A second, slower campaign can carry tight spreads forward once the launch window closes.',
        },
      ],
    },
    cta: { href: '/offerings/defend-a-listing', text: 'See the listing-day pattern →' },
  },
  {
    slug: 'makers',
    group: 'audience',
    label: 'Makers competing on measurable quality',
    title: 'Market Makers',
    tagline: 'Compete on durable spread, useful depth, uptime, and attributable volume.',
    grid: {
      label: "Here's how Mr.Market helps",
      items: [
        {
          heading: 'Rule-based rewards',
          body: 'No allocations by relationship. Your score is computed from eligible fills and the published distribution formula.',
        },
        {
          heading: 'What gets measured',
          body: 'Spread quality at the target zone, useful depth, uptime, and attributable volume. Off-target quotes do not lift you.',
        },
        {
          heading: 'API-key attribution',
          body: 'Fills are tied to the campaign API key, not to vague desk identity. The system knows what is yours.',
        },
        {
          heading: 'Open formula',
          body: 'user_reward = user_internal_score / total_internal_score × net_user_reward_pool. No black box.',
        },
        {
          heading: 'Settled per epoch',
          body: 'Distributions run on the oracle daily payout signal. Settled days are immutable; corrections only happen through new entries.',
        },
      ],
    },
    cta: { href: '/leaderboard', text: 'Open leaderboard →' },
  },
  {
    slug: 'operators',
    group: 'audience',
    label: 'Operators running open-source liquidity nodes',
    title: 'Operators',
    tagline: 'Run the engine yourself. Open-source runtime, TEE-protected execution.',
    grid: {
      label: "Here's how Mr.Market helps",
      items: [
        {
          heading: 'Open-source runtime',
          body: 'Mr.Market is open-source. Deploy an instance, configure strategies, and audit the code you run.',
        },
        {
          heading: 'TEE-protected execution',
          body: 'Strategies, API keys, and execution paths run inside a Trusted Execution Environment — not exposed to the host.',
        },
        {
          heading: 'Strict execution boundaries',
          body: 'Strategy controllers produce intents only. Intent workers own reservation, exchange mutation, and ledger settlement.',
        },
        {
          heading: 'Tick-driven, non-blocking',
          body: 'Tick advances time and dispatches signals. It never blocks on exchange I/O, REST polling, or DB writes.',
        },
        {
          heading: 'No privileged operator path',
          body: 'There is no admin shortcut around the ledger or the reservation rules. Operators run the same engine everyone audits.',
        },
      ],
    },
    cta: { href: '/offerings/operate-as-a-competitive-maker', text: 'See the operator workflow →' },
  },

  // ─── SERVICES ──────────────────────────────────────────────
  {
    slug: 'public-liquidity-campaigns',
    group: 'service',
    label: 'Public liquidity campaigns',
    title: 'Public Liquidity Campaigns',
    tagline: 'The core unit of organized liquidity supply.',
    quote: {
      text: 'Liquidity should belong to everyone, not to privilege.',
    },
    description: {
      heading: 'What is a public liquidity campaign?',
      body: 'A campaign binds a liquidity target, an execution strategy, a reward pool, and a scoring rule. It is the unit of supply-and-demand on Mr.Market. Founders or treasuries open a campaign with a budget and a target. Competing makers route capacity to fulfill it. The leaderboard records the result. Rewards are distributed by attribution. Where private market-making contracts produce a private outcome, a campaign produces a public, measurable one.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Binding by oracle',
          body: 'Campaign id, web3 address, and exchange API key are bound at registration through the HuFi recording oracle. Eligible fills must come through the registered key.',
        },
        {
          heading: 'Defined lifecycle',
          body: 'Created → funded → running → settling → closed. Already-settled days are immutable. No retroactive parameter changes.',
        },
        {
          heading: 'Public by default',
          body: 'Targets, scores, distributions, and fills are visible — not a private spreadsheet between counterparties.',
        },
      ],
    },
    cta: { href: '/leaderboard', text: 'See active campaigns →' },
  },
  {
    slug: 'guided-campaign-creation',
    group: 'service',
    label: 'Guided campaign creation',
    title: 'Guided Campaign Creation',
    tagline: 'Express a liquidity target. Skip the trading-bot configuration.',
    quote: {
      text: 'Create or fund a campaign, choose a liquidity target, then let Mr.Market guide the execution setup.',
    },
    description: {
      heading: 'What does guided creation do?',
      body: 'Founders should not have to choose spread, inventory skew, refresh interval, or connector. They should pick a target and a budget. Guided creation translates your inputs — target pair, target depth, budget, risk envelope — into a strategy, an exchange selection, a fund split, and a risk configuration. Before you launch, the system explains how funds will be used, how orders will be placed, and the conditions under which it will pause.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Targets, not parameters',
          body: 'Express the outcome you want, not the bot configuration. The system selects strategies that match the outcome.',
        },
        {
          heading: 'Explainable launch',
          body: 'A preview shows fund routing, order placement, and pause conditions before you commit a single dollar.',
        },
        {
          heading: 'Advanced mode stays',
          body: 'Operators can still configure every parameter directly. Guided mode is an entry point, not a ceiling.',
        },
      ],
    },
  },
  {
    slug: 'attribution-rewards',
    group: 'service',
    label: 'Attribution-based reward distribution',
    title: 'Attribution-Based Rewards',
    tagline: 'Rewards settled by rule, not by relationship.',
    quote: {
      text: 'Rewards should be earned and measured in public, not allocated by private relationships.',
    },
    description: {
      heading: 'How rewards flow',
      body: 'Reward distribution runs in two layers. The HuFi recording oracle decides how much reward a campaign — as a whole — earns each day. Mr.Market then distributes that net pool to attributable user orders inside the campaign. The platform fee is set per campaign and only applies to days not yet settled. Already-credited rewards are never rewritten if fees or scoring change later; corrections happen through new ledger entries.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Eligible fills only',
          body: 'A fill counts if it was executed in the campaign window, via the campaign API key, on a Mr.Market user order.',
        },
        {
          heading: 'Pro-rata score',
          body: 'user_reward = user_internal_score / total_internal_score × net_user_reward_pool. Open formula, no black box.',
        },
        {
          heading: 'Distribution invariant',
          body: 'Σ(user_rewards) + platform_fee + undistributed_remainder = gross_daily_payout. The math has to add up, every day.',
        },
      ],
    },
  },
  {
    slug: 'public-leaderboard',
    group: 'service',
    label: 'Public maker leaderboard',
    title: 'Public Maker Leaderboard',
    tagline: 'Market quality becomes visible before rewards are distributed.',
    quote: {
      text: 'Liquidity quality should not be a private claim.',
    },
    description: {
      heading: 'What the leaderboard shows',
      body: 'The leaderboard publishes the rank, the inputs to the score, and the resulting distribution — for every campaign and every epoch. Anyone — exchanges, treasuries, founders, analysts, or the makers themselves — can verify it. The same data that drives the rank is the data that drives the distribution.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Inputs you can audit',
          body: 'Spread quality at the target zone, useful depth, uptime, and attributable volume. All shown alongside the rank.',
        },
        {
          heading: 'No off-target lift',
          body: 'Stale or off-target quotes do not score. Farther-band quotes do not lift you above competing makers.',
        },
        {
          heading: 'Settlement-grade data',
          body: 'The numbers that produce the rank are the same numbers that produce the distribution. One source, one record.',
        },
      ],
    },
    cta: { href: '/leaderboard', text: 'Open leaderboard →' },
  },

  // ─── OUTCOMES ──────────────────────────────────────────────
  {
    slug: 'bootstrap-a-new-market',
    group: 'outcome',
    label: 'Bootstrap a new market',
    title: 'Bootstrap a New Market',
    tagline: 'Take a new pair from zero depth to visible, measurable liquidity.',
    quote: {
      text: 'The market should become visible before you pay for it.',
    },
    description: {
      heading: 'From zero to measurable depth',
      body: 'A new pair on a new exchange has no depth, no spread, and no makers. Negotiating with a market maker is slow, opaque, and only the largest projects get a yes. A bootstrap campaign defines a target depth and a reward pool. Competing makers route capacity. The order book fills. The leaderboard makes the result visible to the team, the exchange, and the community.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Define a clear target',
          body: 'Set the pair, the target depth, the spread goal, and the reward pool. The system handles strategy, exchange, and risk.',
        },
        {
          heading: 'Maker capacity routes in',
          body: 'Competing instances pick up the campaign based on their capacity and risk envelope. No exclusive deal required.',
        },
        {
          heading: 'Proof on actual fills',
          body: 'Spread, depth, uptime — measured on real fills. The record persists after the campaign closes.',
        },
      ],
    },
    cta: { href: '/offerings/public-liquidity-campaigns', text: 'How campaigns work →' },
  },
  {
    slug: 'tighten-an-existing-pair',
    group: 'outcome',
    label: 'Tighten an existing pair',
    title: 'Tighten an Existing Pair',
    tagline: 'Improve depth and spread quality on a market that already trades.',
    quote: {
      text: 'Quality is rewarded; off-target quotes are not.',
    },
    description: {
      heading: 'Improving a market that already trades',
      body: 'A pair that trades — but with wide spreads, thin depth, or fragile uptime — is the kind of market that scares larger flows away. A tightening campaign sets a tighter spread target and a depth floor that rewards makers who keep quotes close to the mid and resilient through movement.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Tighter spread target',
          body: 'Quotes farther than the target band do not lift the score. The reward routes to disciplined quoting.',
        },
        {
          heading: 'Depth at the target zone',
          body: 'Useful depth where buyers and sellers actually need it — not deep in the book where it cannot be hit.',
        },
        {
          heading: 'Quality over breadth',
          body: 'One disciplined campaign beats a wide, undirected reward pool. Score reflects the market you wanted.',
        },
      ],
    },
    cta: { href: '/offerings/attribution-rewards', text: 'How rewards are scored →' },
  },
  {
    slug: 'run-a-volume-campaign',
    group: 'outcome',
    label: 'Run a volume campaign',
    title: 'Run a Volume Campaign',
    tagline: 'Generate attributable volume — not the unverifiable kind.',
    quote: {
      text: 'Volume the system cannot trace back does not score.',
    },
    description: {
      heading: 'Volume the system can verify',
      body: 'A volume campaign in Mr.Market rewards volume that is attributable to specific fills, on specific orders, via the campaign API key. There is no path that lets unattributed activity earn from the reward pool. Volume measured this way is something an exchange, a treasury, or an analyst can verify — not just retweet.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Eligible fills only',
          body: 'Untraceable fills do not score. Attribution chains all the way back to a Mr.Market user order.',
        },
        {
          heading: 'No wash-trading reward',
          body: 'The orderId + asset ledger that powers attribution also blocks the loops that allow self-circular fills to count.',
        },
        {
          heading: 'A signal worth publishing',
          body: 'Volume measured against attribution is data you can defend in front of an exchange or an investor.',
        },
      ],
    },
  },
  {
    slug: 'defend-a-listing',
    group: 'outcome',
    label: 'Defend a listing on launch day',
    title: 'Defend a Listing',
    tagline: 'Time-boxed campaign to keep depth alive when it matters most.',
    quote: {
      text: 'The first hours decide who returns the next day.',
    },
    description: {
      heading: 'Holding depth in the launch window',
      body: 'The first hours after a listing decide whether the pair survives, whether it gets noticed by larger flows, and whether anyone returns the next day. A defend-the-listing campaign concentrates a reward pool over a short, high-density window so makers maintain depth and tight spreads when it matters most.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Time-boxed pool',
          body: 'A high-density reward pool sized to the launch window. Maker effort concentrates where it matters.',
        },
        {
          heading: 'Pressure on spread and uptime',
          body: 'Both inputs are penalized hard if they slip during the window. The score reflects the launch you needed.',
        },
        {
          heading: 'A record that outlasts the window',
          body: 'The leaderboard preserves the launch outcome for the team, the exchange, and the next campaign.',
        },
      ],
    },
    cta: { href: '/offerings/exchange-listings', text: 'For exchange-listing teams →' },
  },
  {
    slug: 'operate-as-a-competitive-maker',
    group: 'outcome',
    label: 'Operate as a competitive maker',
    title: 'Operate as a Competitive Maker',
    tagline: 'Run the engine, join campaigns, earn rewards by attributed quality.',
    quote: {
      text: 'Compete on durable quality, not on private access.',
    },
    description: {
      heading: 'Running an instance',
      body: 'Deploy the open-source runtime inside a TEE. Register your instance, connect an exchange API key, and join campaigns whose parameters fit your capacity and risk envelope. Your fills become eligible for the campaign reward pool. Spread, depth, uptime, and attributable volume drive your score. Rewards settle daily per the campaign distribution formula.',
    },
    grid: {
      label: 'Highlights',
      items: [
        {
          heading: 'Open-source engine',
          body: 'No proprietary black box. You can read, modify, and audit the runtime you run.',
        },
        {
          heading: 'TEE protection',
          body: 'Strategies, API keys, and execution paths cannot be tampered with by the host.',
        },
        {
          heading: 'Per-strategy isolation',
          body: 'Intents for the same strategy are serialized; per-exchange rate limits and concurrency caps are respected.',
        },
      ],
    },
    cta: { href: '/leaderboard', text: 'See where you would rank →' },
  },
];

export const offeringGroups: { title: string; items: { slug: string; label: string }[] }[] = [
  {
    title: 'Who we serve',
    items: offeringPages
      .filter((p) => p.group === 'audience')
      .map((p) => ({ slug: p.slug, label: p.label })),
  },
  {
    title: 'Services we offer',
    items: offeringPages
      .filter((p) => p.group === 'service')
      .map((p) => ({ slug: p.slug, label: p.label })),
  },
];

export const strategyOfferings: { slug: string; label: string }[] = offeringPages
  .filter((p) => p.group === 'outcome')
  .map((p) => ({ slug: p.slug, label: p.label }));
