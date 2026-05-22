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
}

export interface MockCampaign {
  id: string;
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
  campaignId: string;
  status: 'active' | 'completed' | 'pending';
  namespace: WalletNamespace;
  assets: string;
  createdVolume: string;
  profit: string;
  placedOrders: number;
  filledAmount: string;
  successCount: number;
  failureCount: number;
  cancelCount: number;
}

export interface MockActivityEntry {
  id: string;
  namespace: WalletNamespace;
  category: 'funding' | 'campaign' | 'order';
  label: string;
  detail: string;
}

export type CampaignFilter = 'all' | 'evm' | 'solana' | 'eligible' | 'open' | 'active';

export type CampaignEligibilityState =
  | 'connect-wallet'
  | 'unsupported-chain'
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
    campaignId: 'eth-usdc-depth',
    status: 'active',
    namespace: 'evm',
    assets: 'ETH + USDC',
    createdVolume: '$124,000',
    profit: '+$318.44',
    placedOrders: 42,
    filledAmount: '31.80 ETH',
    successCount: 39,
    failureCount: 2,
    cancelCount: 1,
  },
  {
    id: 'MM-2001',
    campaignId: 'sol-usdc-growth',
    status: 'pending',
    namespace: 'solana',
    assets: 'SOL + USDC',
    createdVolume: '$0',
    profit: '$0.00',
    placedOrders: 0,
    filledAmount: '0 SOL',
    successCount: 0,
    failureCount: 0,
    cancelCount: 0,
  },
];

export const mockFundingActivity: MockActivityEntry[] = [
  {
    id: 'fund-evm-deposit-usdc',
    namespace: 'evm',
    category: 'funding',
    label: 'Deposit',
    detail: 'USDC · EVM · Ethereum · confirmed · 2026-05-23 09:00',
  },
  {
    id: 'fund-sol-withdraw-sol',
    namespace: 'solana',
    category: 'funding',
    label: 'Withdraw',
    detail: 'SOL · Solana / SVM · reviewing · 2026-05-23 08:30',
  },
];

export const mockAccountActivity: MockActivityEntry[] = [
  {
    id: 'activity-evm-funding',
    namespace: 'evm',
    category: 'funding',
    label: 'Funding',
    detail: 'Deposit USDC confirmed on Ethereum',
  },
  {
    id: 'activity-evm-campaign',
    namespace: 'evm',
    category: 'campaign',
    label: 'Campaigns',
    detail: 'Joined ETH / USDC Depth Builder',
  },
  {
    id: 'activity-evm-order',
    namespace: 'evm',
    category: 'order',
    label: 'Market-making orders',
    detail: 'MM-1001 active',
  },
  {
    id: 'activity-sol-funding',
    namespace: 'solana',
    category: 'funding',
    label: 'Funding',
    detail: 'Withdrawal SOL reviewing on Solana / SVM',
  },
  {
    id: 'activity-sol-campaign',
    namespace: 'solana',
    category: 'campaign',
    label: 'Campaigns',
    detail: 'Joined SOL / USDC Growth Campaign',
  },
  {
    id: 'activity-sol-order',
    namespace: 'solana',
    category: 'order',
    label: 'Market-making orders',
    detail: 'MM-2001 pending',
  },
];

export const namespaceLabel = (namespace: WalletNamespace): string =>
  namespace === 'evm' ? 'EVM' : 'Solana / SVM';

export const shortenMockAddress = (address: string): string => {
  if (!address) return '';
  if (address.startsWith('0x')) return `${address.slice(0, 6)}...${address.slice(-4)}`;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
};

export const accountBalances = (accountId: string | null): MockBalance[] =>
  accountId ? mockBalancesByAccount[accountId] ?? [] : [];

export const mockOrdersForNamespace = (namespace: WalletNamespace | null): MockOrder[] =>
  namespace ? mockOrders.filter((order) => order.namespace === namespace) : [];

export const mockFundingActivityForNamespace = (
  namespace: WalletNamespace | null
): MockActivityEntry[] =>
  namespace ? mockFundingActivity.filter((entry) => entry.namespace === namespace) : [];

export const mockAccountActivityForNamespace = (
  namespace: WalletNamespace | null
): MockActivityEntry[] =>
  namespace ? mockAccountActivity.filter((entry) => entry.namespace === namespace) : [];

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
  namespace: WalletNamespace | null
): MockCampaign[] => {
  if (filter === 'all') return campaigns;
  if (filter === 'evm' || filter === 'solana') {
    return campaigns.filter((campaign) => campaign.chains.includes(filter));
  }
  if (filter === 'eligible') {
    return namespace ? campaigns.filter((campaign) => campaignSupportsNamespace(campaign, namespace)) : [];
  }
  return campaigns.filter((campaign) => campaign.status === filter);
};

export const primaryDepositAddress = (namespace: WalletNamespace): string =>
  namespace === 'evm'
    ? '0x1111111111111111111111111111111111111111'
    : 'FundSoL1111111111111111111111111111111111111';
