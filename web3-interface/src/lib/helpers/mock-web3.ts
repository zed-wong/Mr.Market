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
  },
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

export const primaryDepositAddress = (namespace: WalletNamespace): string =>
  namespace === 'evm'
    ? '0xFUND000000000000000000000000000000000001'
    : 'FundSoL1111111111111111111111111111111111111';
