import BigNumber from 'bignumber.js';

export type WalletNamespace = 'evm' | 'solana';

export interface MockAccount {
  id: string;
  label: string;
  namespace: WalletNamespace;
  network: string;
  chainId: number | null;
  address: string;
  unsupported?: boolean;
}

export interface MockBalance {
  asset: string;
  chainNamespace: WalletNamespace;
  chainId: number | null;
  tokenAddress: string | null;
  symbol: string;
  name: string;
  decimals: number;
  amount: string;
  usdValue: string;
  pendingAmount?: string;
}

export interface MockCampaign {
  id: string;
  accountId?: string;
  name: string;
  status: 'open' | 'active' | 'paused';
  chains: WalletNamespace[];
  assets: string[];
  liquidity: string;
  volume: string;
  minimum: string;
  summary: string;
  duration: string;
  rewardRate: string;
  participants: number;
  terms: string[];
  requirements: string[];
  metrics: {
    liquidityGoal: string;
    volumeGoal: string;
    currentLiquidity: string;
    currentVolume: string;
    projectedReward: string;
  };
}

export interface MockOrder {
  id: string;
  accountId: string;
  campaignId: string;
  status: MockOrderStatus;
  namespace: WalletNamespace;
  assets: string;
  contributionAmount: string;
  feeEstimate: string;
  liquidityContribution: string;
  expectedVolume: string;
  expectedProfit: string;
  createdVolume: string;
  profit: string;
  placedOrders: number;
  filledAmount: string;
  successCount: number;
  failureCount: number;
  cancelCount: number;
  createdAt: string;
  updatedAt: string;
  participation: 'created' | 'joined';
  logs: MockOrderLog[];
}

export type MockOrderStatus =
  | 'draft'
  | 'pending'
  | 'approval'
  | 'signing'
  | 'submitted'
  | 'active'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'paused';

export interface MockOrderLog {
  timestamp: string;
  label: string;
  outcome: string;
  status: MockOrderStatus;
}

export interface MockActivityEntry {
  id: string;
  accountId: string;
  namespace: WalletNamespace;
  category: 'funding' | 'campaign' | 'order';
  label: string;
  detail: string;
  href: string;
  timestamp: string;
}

export type CampaignFilter = 'all' | 'evm' | 'solana' | 'eligible' | 'open' | 'active';

export type CampaignEligibilityState =
  | 'connect-wallet'
  | 'unsupported-chain'
  | 'campaign-paused'
  | 'namespace-supported'
  | 'namespace-unsupported';

export interface CampaignEligibility {
  state: CampaignEligibilityState;
  canParticipate: boolean;
  label: string;
  message: string;
}

export const mockAccounts: MockAccount[] = [
  {
    id: 'evm-primary',
    label: 'EVM treasury',
    namespace: 'evm',
    network: 'Ethereum',
    chainId: 1,
    address: '0xA11CE00000000000000000000000000000000001',
  },
  {
    id: 'evm-secondary',
    label: 'EVM strategy',
    namespace: 'evm',
    network: 'Sepolia',
    chainId: 11155111,
    address: '0xB0B0000000000000000000000000000000000002',
  },
  {
    id: 'solana-primary',
    label: 'Solana treasury',
    namespace: 'solana',
    network: 'Solana Mainnet',
    chainId: null,
    address: 'So11111111111111111111111111111111111111112',
  },
  {
    id: 'unsupported-polygon',
    label: 'Unsupported chain',
    namespace: 'evm',
    network: 'Polygon (unsupported)',
    chainId: 137,
    address: '0xBAD0000000000000000000000000000000000137',
    unsupported: true,
  },
];

export const mockBalancesByAccount: Record<string, MockBalance[]> = {
  'evm-primary': [
    {
      asset: 'ethereum',
      chainNamespace: 'evm',
      chainId: 1,
      tokenAddress: null,
      symbol: 'ETH',
      name: 'Ethereum',
      decimals: 18,
      amount: '4.2500',
      usdValue: '15300.00',
    },
    {
      asset: 'usdc',
      chainNamespace: 'evm',
      chainId: 1,
      tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      symbol: 'USDC',
      name: 'USD Coin',
      decimals: 6,
      amount: '12840.00',
      usdValue: '12840.00',
    },
  ],
  'evm-secondary': [
    {
      asset: 'ethereum-sepolia',
      chainNamespace: 'evm',
      chainId: 11155111,
      tokenAddress: null,
      symbol: 'ETH',
      name: 'Sepolia Ethereum',
      decimals: 18,
      amount: '1.7500',
      usdValue: '6300.00',
    },
    {
      asset: 'usdc-sepolia',
      chainNamespace: 'evm',
      chainId: 11155111,
      tokenAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      symbol: 'USDC',
      name: 'Sepolia USDC',
      decimals: 6,
      amount: '4200.00',
      usdValue: '4200.00',
    },
  ],
  'solana-primary': [
    {
      asset: 'solana',
      chainNamespace: 'solana',
      chainId: null,
      tokenAddress: null,
      symbol: 'SOL',
      name: 'Solana',
      decimals: 9,
      amount: '58.5000',
      usdValue: '8775.00',
    },
    {
      asset: 'usdc-sol',
      chainNamespace: 'solana',
      chainId: null,
      tokenAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      symbol: 'USDC',
      name: 'USD Coin (Solana)',
      decimals: 6,
      amount: '9600.00',
      usdValue: '9600.00',
    },
  ],
  'unsupported-polygon': [],
};

export const mockCampaigns: MockCampaign[] = [
  {
    id: 'eth-usdc-depth',
    name: 'ETH / USDC Depth Builder',
    status: 'open',
    chains: ['evm'],
    assets: ['ETH', 'USDC'],
    liquidity: '$1.2M',
    volume: '$8.4M',
    minimum: '$500',
    summary: 'Provide inventory for EVM ETH and USDC market-making campaigns.',
    duration: 'May 23, 2026 → Jun 23, 2026',
    rewardRate: '8.4% projected APR',
    participants: 42,
    terms: [
      'Inventory remains allocated to mocked market-making orders only.',
      'Rewards accrue after the campaign reaches 75% of the liquidity target.',
      'Participants can pause future mocked order placement from order detail.',
    ],
    requirements: [
      'Connect a supported EVM wallet on Ethereum or Sepolia.',
      'Contribute at least $500 equivalent across ETH and USDC.',
      'Keep enough USDC available for maker-side quote inventory.',
    ],
    metrics: {
      liquidityGoal: '$1.5M',
      volumeGoal: '$10M',
      currentLiquidity: '$1.2M',
      currentVolume: '$8.4M',
      projectedReward: '$18,600',
    },
  },
  {
    id: 'sol-usdc-growth',
    name: 'SOL / USDC Growth Campaign',
    status: 'active',
    chains: ['solana'],
    assets: ['SOL', 'USDC'],
    liquidity: '$760K',
    volume: '$5.1M',
    minimum: '$250',
    summary: 'Support Solana liquidity with deterministic mocked rewards.',
    duration: 'May 23, 2026 → Jul 7, 2026',
    rewardRate: '7.1% projected APR',
    participants: 28,
    terms: [
      'Orders are simulated against Solana / SVM market-making venues.',
      'Rewards are modeled from filled volume and inventory uptime.',
      'Campaign pauses automatically if mocked Solana funding is unavailable.',
    ],
    requirements: [
      'Connect a supported Solana / SVM wallet.',
      'Contribute at least $250 equivalent across SOL and USDC.',
      'Use Solana-format funding and withdrawal addresses only.',
    ],
    metrics: {
      liquidityGoal: '$900K',
      volumeGoal: '$7M',
      currentLiquidity: '$760K',
      currentVolume: '$5.1M',
      projectedReward: '$9,400',
    },
  },
  {
    id: 'cross-chain-stable',
    name: 'Cross-chain Stable Liquidity',
    status: 'open',
    chains: ['evm', 'solana'],
    assets: ['USDC'],
    liquidity: '$2.4M',
    volume: '$14.2M',
    minimum: '$1,000',
    summary: 'A shared campaign for EVM and Solana stablecoin depth.',
    duration: 'Jun 1, 2026 → Aug 1, 2026',
    rewardRate: '6.2% projected APR',
    participants: 67,
    terms: [
      'Stablecoin inventory can be assigned from either supported namespace.',
      'Rewards are calculated per namespace and aggregated in account activity.',
      'Mocked unsupported chains cannot be used for cross-chain participation.',
    ],
    requirements: [
      'Connect a supported EVM or Solana / SVM wallet.',
      'Contribute at least $1,000 equivalent in USDC.',
      'Use namespace-specific deposit instructions before creating an order.',
    ],
    metrics: {
      liquidityGoal: '$3M',
      volumeGoal: '$18M',
      currentLiquidity: '$2.4M',
      currentVolume: '$14.2M',
      projectedReward: '$24,800',
    },
  },
];

export const campaignFilterOptions: { value: CampaignFilter; label: string }[] = [
  { value: 'all', label: 'All campaigns' },
  { value: 'evm', label: 'EVM supported' },
  { value: 'solana', label: 'Solana / SVM supported' },
  { value: 'eligible', label: 'Eligible for current wallet' },
  { value: 'open', label: 'Open status' },
  { value: 'active', label: 'Active status' },
];

export const mockOrders: MockOrder[] = [
  {
    id: 'MM-1001',
    accountId: 'evm-primary',
    campaignId: 'eth-usdc-depth',
    status: 'active',
    namespace: 'evm',
    assets: 'ETH + USDC',
    contributionAmount: '$2,500',
    feeEstimate: '$8.75',
    liquidityContribution: '$2,491.25',
    expectedVolume: '$23,000',
    expectedProfit: '+$60.00',
    createdVolume: '$124,000',
    profit: '+$318.44',
    placedOrders: 42,
    filledAmount: '31.80 ETH',
    successCount: 39,
    failureCount: 2,
    cancelCount: 1,
    createdAt: '2026-05-23 09:00',
    updatedAt: '2026-05-23 09:45',
    participation: 'joined',
    logs: [
      { timestamp: '2026-05-23 09:00', label: 'Order created', outcome: 'Draft converted into a mocked EVM market-making order.', status: 'pending' },
      { timestamp: '2026-05-23 09:01', label: 'Mock approval completed', outcome: 'Reown-style token approval was accepted locally.', status: 'approval' },
      { timestamp: '2026-05-23 09:02', label: 'Mock signing completed', outcome: 'Typed-data signature was simulated without wallet SDK activity.', status: 'signing' },
      { timestamp: '2026-05-23 09:03', label: 'Submitted', outcome: 'Local submission queued the market-making lifecycle.', status: 'submitted' },
      { timestamp: '2026-05-23 09:15', label: 'Order placement cycle', outcome: '42 maker orders placed with two retryable failures.', status: 'active' },
      { timestamp: '2026-05-23 09:45', label: 'Fill update', outcome: '31.80 ETH filled; status remains active.', status: 'active' },
    ],
  },
  {
    id: 'MM-2001',
    accountId: 'solana-primary',
    campaignId: 'sol-usdc-growth',
    status: 'pending',
    namespace: 'solana',
    assets: 'SOL + USDC',
    contributionAmount: '$250',
    feeEstimate: '$0.88',
    liquidityContribution: '$249.12',
    expectedVolume: '$2,300',
    expectedProfit: '+$6.00',
    createdVolume: '$0',
    profit: '$0.00',
    placedOrders: 0,
    filledAmount: '0 SOL',
    successCount: 0,
    failureCount: 0,
    cancelCount: 0,
    createdAt: '2026-05-23 08:30',
    updatedAt: '2026-05-23 08:32',
    participation: 'joined',
    logs: [
      { timestamp: '2026-05-23 08:30', label: 'Order created', outcome: 'Solana draft entered pending approval.', status: 'pending' },
      { timestamp: '2026-05-23 08:31', label: 'Awaiting approval', outcome: 'Mocked Reown-style approval is pending; metrics remain zero.', status: 'approval' },
      { timestamp: '2026-05-23 08:32', label: 'Status update', outcome: 'Order is pending and has not placed maker orders yet.', status: 'pending' },
    ],
  },
  {
    id: 'MM-1002',
    accountId: 'evm-primary',
    campaignId: 'cross-chain-stable',
    status: 'completed',
    namespace: 'evm',
    assets: 'USDC',
    contributionAmount: '$5,000',
    feeEstimate: '$17.50',
    liquidityContribution: '$4,982.50',
    expectedVolume: '$46,000',
    expectedProfit: '+$120.00',
    createdVolume: '$238,900',
    profit: '+$512.08',
    placedOrders: 88,
    filledAmount: '238,900 USDC',
    successCount: 84,
    failureCount: 1,
    cancelCount: 3,
    createdAt: '2026-05-22 10:00',
    updatedAt: '2026-05-23 07:30',
    participation: 'created',
    logs: [
      { timestamp: '2026-05-22 10:00', label: 'Order created', outcome: 'Cross-chain stable campaign order was created.', status: 'pending' },
      { timestamp: '2026-05-22 10:01', label: 'Approval and signing complete', outcome: 'Mock approval and signing completed locally.', status: 'submitted' },
      { timestamp: '2026-05-22 10:10', label: 'Order placement cycle', outcome: '88 maker orders placed for EVM USDC inventory.', status: 'active' },
      { timestamp: '2026-05-22 15:45', label: 'Fill update', outcome: '84 orders filled successfully.', status: 'active' },
      { timestamp: '2026-05-23 07:30', label: 'Completed', outcome: 'Campaign lifecycle completed with positive profit.', status: 'completed' },
    ],
  },
  {
    id: 'MM-1003',
    accountId: 'evm-primary',
    campaignId: 'eth-usdc-depth',
    status: 'failed',
    namespace: 'evm',
    assets: 'ETH + USDC',
    contributionAmount: '$750',
    feeEstimate: '$2.63',
    liquidityContribution: '$747.37',
    expectedVolume: '$6,900',
    expectedProfit: '+$18.00',
    createdVolume: '$4,200',
    profit: '-$12.40',
    placedOrders: 9,
    filledAmount: '1.10 ETH',
    successCount: 6,
    failureCount: 3,
    cancelCount: 0,
    createdAt: '2026-05-21 12:00',
    updatedAt: '2026-05-21 12:40',
    participation: 'joined',
    logs: [
      { timestamp: '2026-05-21 12:00', label: 'Order created', outcome: 'EVM order created from campaign detail.', status: 'pending' },
      { timestamp: '2026-05-21 12:03', label: 'Submitted', outcome: 'Mock submission accepted.', status: 'submitted' },
      { timestamp: '2026-05-21 12:25', label: 'Order placement cycle', outcome: 'Nine maker orders placed; failures exceeded retry budget.', status: 'active' },
      { timestamp: '2026-05-21 12:40', label: 'Failure', outcome: 'Order marked failed after three placement failures.', status: 'failed' },
    ],
  },
  {
    id: 'MM-2002',
    accountId: 'solana-primary',
    campaignId: 'sol-usdc-growth',
    status: 'cancelled',
    namespace: 'solana',
    assets: 'SOL + USDC',
    contributionAmount: '$900',
    feeEstimate: '$3.15',
    liquidityContribution: '$896.85',
    expectedVolume: '$8,280',
    expectedProfit: '+$21.60',
    createdVolume: '$18,400',
    profit: '+$34.25',
    placedOrders: 21,
    filledAmount: '83.5 SOL',
    successCount: 18,
    failureCount: 0,
    cancelCount: 3,
    createdAt: '2026-05-20 11:20',
    updatedAt: '2026-05-20 14:00',
    participation: 'joined',
    logs: [
      { timestamp: '2026-05-20 11:20', label: 'Order created', outcome: 'Solana market-making order was submitted.', status: 'submitted' },
      { timestamp: '2026-05-20 11:35', label: 'Order placement cycle', outcome: '21 Solana maker orders placed.', status: 'active' },
      { timestamp: '2026-05-20 13:10', label: 'Fill update', outcome: '18 orders filled before cancellation request.', status: 'active' },
      { timestamp: '2026-05-20 14:00', label: 'Cancellation', outcome: 'Three remaining orders cancelled deterministically.', status: 'cancelled' },
    ],
  },
  {
    id: 'MM-2003',
    accountId: 'solana-primary',
    campaignId: 'cross-chain-stable',
    status: 'draft',
    namespace: 'solana',
    assets: 'USDC',
    contributionAmount: '$1,000',
    feeEstimate: '$3.50',
    liquidityContribution: '$996.50',
    expectedVolume: '$9,200',
    expectedProfit: '+$24.00',
    createdVolume: '$0',
    profit: '$0.00',
    placedOrders: 0,
    filledAmount: '0 USDC',
    successCount: 0,
    failureCount: 0,
    cancelCount: 0,
    createdAt: '2026-05-23 09:10',
    updatedAt: '2026-05-23 09:10',
    participation: 'created',
    logs: [
      { timestamp: '2026-05-23 09:10', label: 'Draft saved', outcome: 'Draft order keeps zero metrics until approval starts.', status: 'draft' },
    ],
  },
];

export const mockFundingActivity: MockActivityEntry[] = [
  {
    id: 'fund-evm-deposit-usdc',
    accountId: 'evm-primary',
    namespace: 'evm',
    category: 'funding',
    label: 'Deposit',
    detail: 'USDC · EVM · Ethereum · confirmed · 2026-05-23 09:00',
    href: '/deposit',
    timestamp: '2026-05-23 09:00',
  },
  {
    id: 'fund-sol-withdraw-sol',
    accountId: 'solana-primary',
    namespace: 'solana',
    category: 'funding',
    label: 'Withdraw',
    detail: 'SOL · Solana / SVM · reviewing · 2026-05-23 08:30',
    href: '/withdraw',
    timestamp: '2026-05-23 08:30',
  },
];

export const mockAccountActivity: MockActivityEntry[] = [
  {
    id: 'activity-evm-funding',
    accountId: 'evm-primary',
    namespace: 'evm',
    category: 'funding',
    label: 'Funding',
    detail: '2026-05-23 09:00 · Deposit USDC confirmed on Ethereum',
    href: '/deposit',
    timestamp: '2026-05-23 09:00',
  },
  {
    id: 'activity-evm-campaign',
    accountId: 'evm-primary',
    namespace: 'evm',
    category: 'campaign',
    label: 'Campaigns',
    detail: '2026-05-23 09:03 · Joined ETH / USDC Depth Builder',
    href: '/market-making/campaign/eth-usdc-depth',
    timestamp: '2026-05-23 09:03',
  },
  {
    id: 'activity-evm-order',
    accountId: 'evm-primary',
    namespace: 'evm',
    category: 'order',
    label: 'Market-making orders',
    detail: '2026-05-23 09:45 · MM-1001 active',
    href: '/market-making/order/MM-1001',
    timestamp: '2026-05-23 09:45',
  },
  {
    id: 'activity-sol-funding',
    accountId: 'solana-primary',
    namespace: 'solana',
    category: 'funding',
    label: 'Funding',
    detail: '2026-05-23 08:30 · Withdrawal SOL reviewing on Solana / SVM',
    href: '/withdraw',
    timestamp: '2026-05-23 08:30',
  },
  {
    id: 'activity-sol-campaign',
    accountId: 'solana-primary',
    namespace: 'solana',
    category: 'campaign',
    label: 'Campaigns',
    detail: '2026-05-23 08:31 · Joined SOL / USDC Growth Campaign',
    href: '/market-making/campaign/sol-usdc-growth',
    timestamp: '2026-05-23 08:31',
  },
  {
    id: 'activity-sol-order',
    accountId: 'solana-primary',
    namespace: 'solana',
    category: 'order',
    label: 'Market-making orders',
    detail: '2026-05-23 08:32 · MM-2001 pending',
    href: '/market-making/order/MM-2001',
    timestamp: '2026-05-23 08:32',
  },
];

export const namespaceLabel = (namespace: WalletNamespace): string =>
  namespace === 'evm' ? 'EVM' : 'Solana / SVM';

export const supportedDemoEvmChainIds = new Set<number>([1, 11155111]);

export const normalizeDemoChainId = (chainId: number | string | null | undefined): number | null => {
  if (chainId === null || chainId === undefined || chainId === '') return null;
  const parsed = typeof chainId === 'string' ? Number(chainId) : chainId;
  return Number.isFinite(parsed) ? parsed : null;
};

export const deterministicAccountForWallet = (
  namespace: WalletNamespace | null,
  chainId: number | string | null | undefined
): MockAccount | null => {
  if (namespace === 'solana') {
    return mockAccounts.find((account) => account.id === 'solana-primary') ?? null;
  }

  if (namespace !== 'evm') return null;

  const numericChainId = normalizeDemoChainId(chainId);
  if (numericChainId === 11155111) {
    return mockAccounts.find((account) => account.id === 'evm-secondary') ?? null;
  }
  if (numericChainId === 1 || numericChainId === null) {
    return mockAccounts.find((account) => account.id === 'evm-primary') ?? null;
  }
  return mockAccounts.find((account) => account.id === 'unsupported-polygon') ?? null;
};

export const isSupportedDemoWallet = (
  namespace: WalletNamespace | null,
  chainId: number | string | null | undefined
): boolean => {
  if (namespace === 'solana') return true;
  if (namespace !== 'evm') return false;
  const numericChainId = normalizeDemoChainId(chainId);
  return numericChainId === null || supportedDemoEvmChainIds.has(numericChainId);
};

export const shortenMockAddress = (address: string): string => {
  if (!address) return '';
  if (address.startsWith('0x')) return `${address.slice(0, 6)}...${address.slice(-4)}`;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export const accountBalances = (accountId: string | null): MockBalance[] =>
  accountId ? mockBalancesByAccount[accountId] ?? [] : [];

export const mockOrdersForNamespace = (namespace: WalletNamespace | null): MockOrder[] =>
  namespace ? mockOrders.filter((order) => order.namespace === namespace) : [];

export const mockOrdersForAccount = (
  accountId: string | null | undefined,
  namespace: WalletNamespace | null
): MockOrder[] =>
  accountId && namespace
    ? mockOrders.filter((order) => order.accountId === accountId && order.namespace === namespace)
    : [];

export const mockFundingActivityForNamespace = (
  namespace: WalletNamespace | null
): MockActivityEntry[] =>
  namespace ? mockFundingActivity.filter((entry) => entry.namespace === namespace) : [];

export const mockFundingActivityForAccount = (
  accountId: string | null | undefined,
  namespace: WalletNamespace | null
): MockActivityEntry[] =>
  accountId && namespace
    ? aggregateMockActivityEntries(
        mockFundingActivity.filter((entry) => entry.accountId === accountId && entry.namespace === namespace)
      )
    : [];

export const mockAccountActivityForNamespace = (
  namespace: WalletNamespace | null
): MockActivityEntry[] =>
  namespace ? mockAccountActivity.filter((entry) => entry.namespace === namespace) : [];

export const mockAccountActivityForAccount = (
  accountId: string | null | undefined,
  namespace: WalletNamespace | null
): MockActivityEntry[] =>
  accountId && namespace
    ? aggregateMockActivityEntries(
        mockAccountActivity.filter((entry) => entry.accountId === accountId && entry.namespace === namespace)
      )
    : [];

export const parseMockActivityTimestamp = (entry: MockActivityEntry): number => {
  const detailTimestamp = entry.detail.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)?.[0];
  const timestamp = entry.timestamp || detailTimestamp || '';
  const parsed = Date.parse(`${timestamp.replace(' ', 'T')}:00Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export const aggregateMockActivityEntries = (
  ...activityGroups: MockActivityEntry[][]
): MockActivityEntry[] =>
  activityGroups
    .flat()
    .sort((left, right) => {
      const timestampDifference = parseMockActivityTimestamp(right) - parseMockActivityTimestamp(left);
      return timestampDifference || left.id.localeCompare(right.id);
    });

export const totalUsdValue = (balances: MockBalance[]): string =>
  balances.reduce((sum, balance) => sum.plus(balance.usdValue), new BigNumber('0')).toFixed(2);

export const campaignSupportsNamespace = (
  campaign: MockCampaign,
  namespace: WalletNamespace | null
): boolean => Boolean(namespace && campaign.chains.includes(namespace));

export const campaignEligibility = (
  campaign: MockCampaign,
  namespace: WalletNamespace | null,
  isConnected: boolean,
  isUnsupported: boolean
): CampaignEligibility => {
  if (isUnsupported) {
    return {
      state: 'unsupported-chain',
      canParticipate: false,
      label: 'Unsupported chain',
      message: 'Unsupported chain selected. Switch to a supported EVM or Solana / SVM wallet before joining.',
    };
  }

  if (!isConnected || !namespace) {
    return {
      state: 'connect-wallet',
      canParticipate: false,
      label: 'Connect wallet',
      message: 'Connect a mocked Reown wallet to check namespace-specific campaign eligibility.',
    };
  }

  if (campaign.status === 'paused') {
    return {
      state: 'campaign-paused',
      canParticipate: false,
      label: 'Paused',
      message: `${campaign.name} is paused. New market-making orders are temporarily disabled while existing placements are reconciled.`,
    };
  }

  if (campaignSupportsNamespace(campaign, namespace)) {
    return {
      state: 'namespace-supported',
      canParticipate: true,
      label: `${namespaceLabel(namespace)} eligible`,
      message: `${namespaceLabel(namespace)} is supported for this campaign.`,
    };
  }

  return {
    state: 'namespace-unsupported',
    canParticipate: false,
    label: `${namespaceLabel(namespace)} not supported`,
    message: `This campaign does not support ${namespaceLabel(namespace)}. Switch wallet namespace to ${campaign.chains
      .map(namespaceLabel)
      .join(' or ')} to participate.`,
  };
};

export const filterMockCampaigns = (
  campaigns: MockCampaign[],
  filter: CampaignFilter,
  namespace: WalletNamespace | null,
  isConnected = Boolean(namespace),
  isUnsupported = false
): MockCampaign[] => {
  if (filter === 'all') return campaigns;
  if (filter === 'evm' || filter === 'solana') {
    return campaigns.filter((campaign) => campaign.chains.includes(filter));
  }
  if (filter === 'eligible') {
    return namespace && isConnected && !isUnsupported
      ? campaigns.filter((campaign) => campaignSupportsNamespace(campaign, namespace))
      : [];
  }
  return campaigns.filter((campaign) => campaign.status === filter);
};

export const primaryDepositAddress = (namespace: WalletNamespace): string =>
  namespace === 'evm'
    ? '0x1111111111111111111111111111111111111111'
    : 'FundSoL1111111111111111111111111111111111111';
