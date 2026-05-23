import BigNumber from 'bignumber.js';
import { derived, get, writable } from 'svelte/store';
import {
  aggregateMockActivityEntries,
  mockCampaigns,
  mockOrders,
  namespaceLabel,
  type MockActivityEntry,
  type MockBalance,
  type MockCampaign,
  type MockOrder,
  type MockOrderLog,
  type MockOrderStatus,
  type WalletNamespace,
} from '$lib/helpers/mock-web3';

export interface CampaignCreationInput {
  name: string;
  namespace: WalletNamespace | '';
  assets: string;
  minimumContribution: string;
  duration: string;
  status: MockCampaign['status'];
  liquidityTarget: string;
  volumeTarget: string;
  terms: string;
}

export interface MarketMakingDraft {
  campaignId: string;
  namespace: WalletNamespace | null;
  amount: string;
  selectedAssets: string;
  updatedAt: string;
}

export interface FeeEstimate {
  campaignFee: string;
  liquidityContribution: string;
  expectedVolume: string;
  expectedProfit: string;
}

export interface OrderValidationResult {
  amount?: string;
  wallet?: string;
}

interface MarketMakingSessionSnapshot {
  campaignSequence: number;
  orderSequence: number;
  sessionCampaigns: MockCampaign[];
  sessionOrders: MockOrder[];
  sessionMarketMakingActivity: MockActivityEntry[];
  orderDraft: MarketMakingDraft | null;
}

export type OrderFlowStep = 'form' | 'review' | 'approving' | 'signing' | 'submitting' | 'success';
export type OrderLifecycleAction = 'pause' | 'resume' | 'stop';

const MARKET_MAKING_SESSION_STORAGE_KEY = 'mrm-web3-market-making-session';
const campaignSequence = writable(0);
const orderSequence = writable(3000);

export const sessionCampaigns = writable<MockCampaign[]>([]);
export const sessionOrders = writable<MockOrder[]>([]);
export const sessionMarketMakingActivity = writable<MockActivityEntry[]>([]);
export const orderDraft = writable<MarketMakingDraft | null>(null);

const orderStatuses = new Set<MockOrderStatus>([
  'draft',
  'pending',
  'approval',
  'signing',
  'submitted',
  'active',
  'completed',
  'failed',
  'cancelled',
  'paused',
  'stopped',
]);

const campaignStatuses = new Set<MockCampaign['status']>(['open', 'active', 'paused']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isWalletNamespace = (value: unknown): value is WalletNamespace =>
  value === 'evm' || value === 'solana';

const isOrderStatus = (value: unknown): value is MockOrderStatus =>
  typeof value === 'string' && orderStatuses.has(value as MockOrderStatus);

const isCampaignStatus = (value: unknown): value is MockCampaign['status'] =>
  typeof value === 'string' && campaignStatuses.has(value as MockCampaign['status']);

const isActivityCategory = (value: unknown): value is MockActivityEntry['category'] =>
  value === 'funding' || value === 'campaign' || value === 'order';

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isMockActivityEntry = (value: unknown): value is MockActivityEntry =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.accountId === 'string' &&
  isWalletNamespace(value.namespace) &&
  isActivityCategory(value.category) &&
  typeof value.label === 'string' &&
  typeof value.detail === 'string' &&
  typeof value.href === 'string' &&
  typeof value.timestamp === 'string';

const isMockCampaign = (value: unknown): value is MockCampaign =>
  isRecord(value) &&
  (typeof value.accountId === 'undefined' || typeof value.accountId === 'string') &&
  typeof value.id === 'string' &&
  typeof value.name === 'string' &&
  isCampaignStatus(value.status) &&
  Array.isArray(value.chains) &&
  value.chains.every(isWalletNamespace) &&
  isStringArray(value.assets) &&
  typeof value.liquidity === 'string' &&
  typeof value.volume === 'string' &&
  typeof value.minimum === 'string' &&
  typeof value.summary === 'string' &&
  typeof value.duration === 'string' &&
  typeof value.rewardRate === 'string' &&
  isFiniteNumber(value.participants) &&
  isStringArray(value.terms) &&
  isStringArray(value.requirements) &&
  isRecord(value.metrics) &&
  typeof value.metrics.liquidityGoal === 'string' &&
  typeof value.metrics.volumeGoal === 'string' &&
  typeof value.metrics.currentLiquidity === 'string' &&
  typeof value.metrics.currentVolume === 'string' &&
  typeof value.metrics.projectedReward === 'string';

const isMockOrderLog = (value: unknown): value is MockOrderLog =>
  isRecord(value) &&
  typeof value.timestamp === 'string' &&
  typeof value.label === 'string' &&
  typeof value.outcome === 'string' &&
  isOrderStatus(value.status);

const isMockOrder = (value: unknown): value is MockOrder =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.accountId === 'string' &&
  typeof value.campaignId === 'string' &&
  isOrderStatus(value.status) &&
  isWalletNamespace(value.namespace) &&
  typeof value.assets === 'string' &&
  typeof value.contributionAmount === 'string' &&
  typeof value.feeEstimate === 'string' &&
  typeof value.liquidityContribution === 'string' &&
  typeof value.expectedVolume === 'string' &&
  typeof value.expectedProfit === 'string' &&
  typeof value.createdVolume === 'string' &&
  typeof value.profit === 'string' &&
  isFiniteNumber(value.placedOrders) &&
  typeof value.filledAmount === 'string' &&
  isFiniteNumber(value.successCount) &&
  isFiniteNumber(value.failureCount) &&
  isFiniteNumber(value.cancelCount) &&
  typeof value.createdAt === 'string' &&
  typeof value.updatedAt === 'string' &&
  (value.participation === 'created' || value.participation === 'joined') &&
  Array.isArray(value.logs) &&
  value.logs.every(isMockOrderLog);

const isMarketMakingDraft = (value: unknown): value is MarketMakingDraft =>
  isRecord(value) &&
  typeof value.campaignId === 'string' &&
  (value.namespace === null || isWalletNamespace(value.namespace)) &&
  typeof value.amount === 'string' &&
  typeof value.selectedAssets === 'string' &&
  typeof value.updatedAt === 'string';

const safeSequence = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const safeArray = <T>(value: unknown, isItem: (item: unknown) => item is T): T[] =>
  Array.isArray(value) ? value.filter(isItem) : [];

export const allCampaigns = derived(sessionCampaigns, ($sessionCampaigns) => [
  ...$sessionCampaigns,
  ...mockCampaigns,
]);

export const allOrders = derived(sessionOrders, ($sessionOrders) => {
  const sessionOrderIds = new Set($sessionOrders.map((order) => order.id));
  return [
    ...$sessionOrders,
    ...mockOrders.filter((order) => !sessionOrderIds.has(order.id)),
  ];
});

export const marketMakingActivityForAccount = (
  accountId: string | null | undefined,
  namespace: WalletNamespace | null,
  sessionEntries: MockActivityEntry[]
): MockActivityEntry[] =>
  accountId && namespace
    ? aggregateMockActivityEntries(
        sessionEntries.filter((entry) => entry.accountId === accountId && entry.namespace === namespace)
      )
    : [];

const readMarketMakingSessionSnapshot = (): unknown | null => {
  if (typeof sessionStorage === 'undefined') return null;
  const encoded = sessionStorage.getItem(MARKET_MAKING_SESSION_STORAGE_KEY);
  if (!encoded) return null;
  try {
    return JSON.parse(encoded) as MarketMakingSessionSnapshot;
  } catch {
    sessionStorage.removeItem(MARKET_MAKING_SESSION_STORAGE_KEY);
    return null;
  }
};

const persistMarketMakingSession = () => {
  if (typeof sessionStorage === 'undefined') return;
  const snapshot: MarketMakingSessionSnapshot = {
    campaignSequence: get(campaignSequence),
    orderSequence: get(orderSequence),
    sessionCampaigns: get(sessionCampaigns),
    sessionOrders: get(sessionOrders),
    sessionMarketMakingActivity: get(sessionMarketMakingActivity),
    orderDraft: get(orderDraft),
  };
  sessionStorage.setItem(MARKET_MAKING_SESSION_STORAGE_KEY, JSON.stringify(snapshot));
};

const clearMarketMakingSessionSnapshot = () => {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(MARKET_MAKING_SESSION_STORAGE_KEY);
};

export const restoreMarketMakingSession = () => {
  const snapshot = readMarketMakingSessionSnapshot();
  if (!snapshot) return;
  if (!isRecord(snapshot)) {
    campaignSequence.set(0);
    orderSequence.set(3000);
    sessionCampaigns.set([]);
    sessionOrders.set([]);
    sessionMarketMakingActivity.set([]);
    orderDraft.set(null);
    return;
  }
  campaignSequence.set(safeSequence(snapshot.campaignSequence, 0));
  orderSequence.set(safeSequence(snapshot.orderSequence, 3000));
  sessionCampaigns.set(safeArray(snapshot.sessionCampaigns, isMockCampaign));
  sessionOrders.set(safeArray(snapshot.sessionOrders, isMockOrder));
  sessionMarketMakingActivity.set(safeArray(snapshot.sessionMarketMakingActivity, isMockActivityEntry));
  orderDraft.set(isMarketMakingDraft(snapshot.orderDraft) ? snapshot.orderDraft : null);
};

export const resetMarketMakingSession = () => {
  campaignSequence.set(0);
  orderSequence.set(3000);
  sessionCampaigns.set([]);
  sessionOrders.set([]);
  sessionMarketMakingActivity.set([]);
  orderDraft.set(null);
  clearMarketMakingSessionSnapshot();
};

const stripCurrency = (value: string): string => value.replace(/[$,\s]/g, '');

export const formatUsd = (value: BigNumber.Value): string => {
  const amount = new BigNumber(value);
  return `$${amount.toFormat(2)}`;
};

export const minimumContributionUsd = (campaign: MockCampaign): BigNumber =>
  new BigNumber(stripCurrency(campaign.minimum));

export const feeEstimateFor = (amount: string): FeeEstimate => {
  const parsed = new BigNumber(amount || '0');
  const fee = parsed.times(0.0035);
  const liquidity = BigNumber.maximum(parsed.minus(fee), 0);
  const expectedVolume = parsed.times(9.2);
  const expectedProfit = parsed.times(0.024);

  return {
    campaignFee: formatUsd(fee),
    liquidityContribution: formatUsd(liquidity),
    expectedVolume: formatUsd(expectedVolume),
    expectedProfit: `+${formatUsd(expectedProfit)}`,
  };
};

export const validateCampaignCreation = (input: CampaignCreationInput): Record<string, string> => {
  const errors: Record<string, string> = {};
  const minimum = new BigNumber(input.minimumContribution);
  const liquidity = new BigNumber(input.liquidityTarget);
  const volume = new BigNumber(input.volumeTarget);
  const assets = input.assets
    .split(',')
    .map((asset) => asset.trim())
    .filter(Boolean);

  if (!input.name.trim()) errors.name = 'Campaign name is required.';
  if (!input.namespace) errors.namespace = 'Choose a supported chain namespace.';
  if (assets.length === 0) errors.assets = 'At least one supported asset is required.';
  if (!input.minimumContribution.trim() || !minimum.isFinite() || minimum.lte(0)) {
    errors.minimumContribution = 'Minimum contribution must be greater than zero.';
  }
  if (!input.duration.trim()) errors.duration = 'Timing or duration is required.';
  if (!input.status) errors.status = 'Choose a campaign lifecycle status.';
  if (!input.liquidityTarget.trim() || !liquidity.isFinite() || liquidity.lte(0)) {
    errors.liquidityTarget = 'Liquidity target must be greater than zero.';
  }
  if (!input.volumeTarget.trim() || !volume.isFinite() || volume.lte(0)) {
    errors.volumeTarget = 'Volume target must be greater than zero.';
  }
  if (!input.terms.trim()) errors.terms = 'Terms and requirements are required.';

  return errors;
};

export const createMockCampaign = (input: CampaignCreationInput, accountId = 'mock-session'): MockCampaign => {
  const sequence = get(campaignSequence) + 1;
  campaignSequence.set(sequence);
  const namespace = input.namespace || 'evm';
  const assets = input.assets
    .split(',')
    .map((asset) => asset.trim().toUpperCase())
    .filter(Boolean);
  const idSlug = input.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'mock-campaign';

  const campaign: MockCampaign = {
    id: `${idSlug}-${sequence}`,
    accountId,
    name: input.name.trim(),
    status: input.status,
    chains: [namespace],
    assets,
    liquidity: '$0',
    volume: '$0',
    minimum: formatUsd(input.minimumContribution),
    summary: `User-created mocked ${namespaceLabel(namespace)} campaign for ${assets.join(' + ')}.`,
    duration: input.duration.trim(),
    rewardRate: '6.8% projected mocked APR',
    participants: 1,
    terms: input.terms.split('\n').map((term) => term.trim()).filter(Boolean),
    requirements: [
      `Connect a supported ${namespaceLabel(namespace)} wallet.`,
      `Contribute at least ${formatUsd(input.minimumContribution)} across ${assets.join(' + ')}.`,
      'Approval, signing, and execution remain UI-only mocked states.',
    ],
    metrics: {
      liquidityGoal: formatUsd(input.liquidityTarget),
      volumeGoal: formatUsd(input.volumeTarget),
      currentLiquidity: '$0',
      currentVolume: '$0',
      projectedReward: formatUsd(new BigNumber(input.volumeTarget).times(0.0062)),
    },
  };

  sessionCampaigns.update((items) => [campaign, ...items]);
  sessionMarketMakingActivity.update((entries) => [
    {
      id: `activity-campaign-${campaign.id}`,
      accountId,
      namespace,
      category: 'campaign',
      label: 'Campaign created',
      detail: `2026-05-23 09:18 · ${campaign.name} · ${namespaceLabel(namespace)} · ${campaign.status}`,
      href: `/market-making/campaign/${campaign.id}`,
      timestamp: '2026-05-23 09:18',
    },
    ...entries,
  ]);
  persistMarketMakingSession();
  return campaign;
};

export const validateOrderDraft = (
  campaign: MockCampaign,
  namespace: WalletNamespace | null,
  isConnected: boolean,
  isUnsupported: boolean,
  amount: string,
  balances: MockBalance[]
): OrderValidationResult => {
  const errors: OrderValidationResult = {};
  const parsed = new BigNumber(amount);
  const minimum = minimumContributionUsd(campaign);
  const availableUsd = balances.reduce((sum, balance) => sum.plus(balance.usdValue), new BigNumber(0));

  if (!isConnected) errors.wallet = 'Connect a mocked Reown wallet before creating an order.';
  if (isUnsupported) errors.wallet = 'Unsupported chain selected. Switch to EVM or Solana before creating an order.';
  if (campaign.status === 'paused') {
    errors.wallet = `${campaign.name} is paused. New market-making orders are temporarily disabled.`;
  }
  if (namespace && !campaign.chains.includes(namespace)) {
    errors.wallet = `${namespaceLabel(namespace)} is not supported for this campaign.`;
  }

  if (!amount.trim()) {
    errors.amount = 'Contribution amount is required.';
  } else if (!parsed.isFinite() || Number.isNaN(parsed.toNumber())) {
    errors.amount = 'Enter a numeric contribution amount.';
  } else if (parsed.lte(0)) {
    errors.amount = 'Contribution amount must be greater than zero.';
  } else if (parsed.lt(minimum)) {
    errors.amount = `Minimum contribution for ${campaign.name} is ${campaign.minimum}.`;
  } else if (parsed.gt(availableUsd)) {
    errors.amount = `Amount exceeds available mocked balance of ${formatUsd(availableUsd)}.`;
  }

  return errors;
};

export const saveOrderDraft = (draft: MarketMakingDraft) => {
  orderDraft.set(draft);
  persistMarketMakingSession();
};

export const clearOrderDraft = () => {
  orderDraft.set(null);
  persistMarketMakingSession();
};

const buildOrderLogs = (timestamp: string, status: MockOrderStatus): MockOrderLog[] => [
  { timestamp, label: 'Order created', outcome: 'Draft values were validated and converted into a mocked order.', status: 'pending' },
  { timestamp: '2026-05-23 09:19', label: 'Mock approval visible', outcome: 'Reown-style approval state was shown without wallet SDK or RPC activity.', status: 'approval' },
  { timestamp: '2026-05-23 09:20', label: 'Mock signing visible', outcome: 'Reown-style signing state was shown without a real signature.', status: 'signing' },
  { timestamp: '2026-05-23 09:21', label: 'Submitted', outcome: 'Local mocked submission completed successfully.', status: 'submitted' },
  { timestamp: '2026-05-23 09:22', label: 'Status update', outcome: `Order lifecycle now reports ${status}.`, status },
];

const resumableOrderStatuses = new Set<MockOrderStatus>(['paused', 'stopped']);

const lifecycleTimestampFor = (order: MockOrder): string => {
  const minute = String(Math.min(59, order.logs.length)).padStart(2, '0');
  return `2026-05-23 10:${minute}`;
};

const activityTimestampId = (timestamp: string): string =>
  timestamp.slice(11).replace(':', '-');

const lifecycleDetails: Record<OrderLifecycleAction, { status: MockOrderStatus; label: string; outcome: string }> = {
  pause: {
    status: 'paused',
    label: 'Placement paused',
    outcome: 'New maker order placement paused while existing fills remain tracked.',
  },
  resume: {
    status: 'active',
    label: 'Placement resumed',
    outcome: 'Maker order placement resumed using the existing deterministic contribution.',
  },
  stop: {
    status: 'stopped',
    label: 'Placement stopped',
    outcome: 'Active maker order placement stopped; inventory remains reserved for deterministic settlement.',
  },
};

export const canPauseOrder = (status: MockOrderStatus): boolean => status === 'active';

export const canResumeOrder = (status: MockOrderStatus): boolean =>
  resumableOrderStatuses.has(status);

export const canStopOrder = (status: MockOrderStatus): boolean =>
  status === 'active';

export const transitionOrderLifecycle = (
  orderId: string,
  action: OrderLifecycleAction
): MockOrder | null => {
  const currentSessionOrders = get(sessionOrders);
  const currentOrder =
    currentSessionOrders.find((order) => order.id === orderId) ??
    mockOrders.find((order) => order.id === orderId);

  if (!currentOrder) return null;
  if (action === 'pause' && !canPauseOrder(currentOrder.status)) return null;
  if (action === 'resume' && !canResumeOrder(currentOrder.status)) return null;
  if (action === 'stop' && !canStopOrder(currentOrder.status)) return null;

  const detail = lifecycleDetails[action];
  const timestamp = lifecycleTimestampFor(currentOrder);
  const campaign =
    get(sessionCampaigns).find((item) => item.id === currentOrder.campaignId) ??
    mockCampaigns.find((item) => item.id === currentOrder.campaignId);
  const updatedOrder: MockOrder = {
    ...currentOrder,
    status: detail.status,
    updatedAt: timestamp,
    cancelCount: action === 'stop' ? currentOrder.cancelCount + 1 : currentOrder.cancelCount,
    logs: [
      ...currentOrder.logs,
      {
        timestamp,
        label: detail.label,
        outcome: detail.outcome,
        status: detail.status,
      },
    ],
  };

  sessionOrders.update((orders) => {
    const existingIndex = orders.findIndex((order) => order.id === orderId);
    if (existingIndex === -1) return [updatedOrder, ...orders];
    return orders.map((order) => (order.id === orderId ? updatedOrder : order));
  });

  sessionMarketMakingActivity.update((entries) => [
    {
      id: `activity-order-lifecycle-${updatedOrder.id}-${activityTimestampId(timestamp)}`,
      accountId: updatedOrder.accountId,
      namespace: updatedOrder.namespace,
      category: 'order',
      label: detail.label,
      detail: `${timestamp} · ${updatedOrder.id} · ${campaign?.name ?? 'Unknown campaign'} · ${namespaceLabel(updatedOrder.namespace)} · ${statusLabel(updatedOrder.status)}`,
      href: `/market-making/order/${updatedOrder.id}`,
      timestamp,
    },
    ...entries,
  ]);
  persistMarketMakingSession();

  return updatedOrder;
};

export const createMockOrder = (
  campaign: MockCampaign,
  namespace: WalletNamespace,
  amount: string,
  accountId = 'mock-session'
): MockOrder => {
  const sequence = get(orderSequence) + 1;
  orderSequence.set(sequence);
  const estimate = feeEstimateFor(amount);
  const timestamp = '2026-05-23 09:18';
  const status: MockOrderStatus = 'active';
  const order: MockOrder = {
    id: `MM-${namespace.toUpperCase()}-${sequence}`,
    accountId,
    campaignId: campaign.id,
    status,
    namespace,
    assets: campaign.assets.join(' + '),
    contributionAmount: formatUsd(amount),
    feeEstimate: estimate.campaignFee,
    liquidityContribution: estimate.liquidityContribution,
    expectedVolume: estimate.expectedVolume,
    expectedProfit: estimate.expectedProfit,
    createdVolume: '$0',
    profit: '$0.00',
    placedOrders: 0,
    filledAmount: `0 ${campaign.assets[0] ?? 'asset'}`,
    successCount: 0,
    failureCount: 0,
    cancelCount: 0,
    createdAt: timestamp,
    updatedAt: '2026-05-23 09:22',
    participation: 'joined',
    logs: buildOrderLogs(timestamp, status),
  };

  sessionOrders.update((items) => [order, ...items]);
  sessionMarketMakingActivity.update((entries) => [
    {
      id: `activity-order-${order.id}`,
      accountId,
      namespace,
      category: 'order',
      label: 'Market-making order',
      detail: `2026-05-23 09:22 · ${order.id} · ${campaign.name} · ${namespaceLabel(namespace)} · ${order.status} · ${order.contributionAmount}`,
      href: `/market-making/order/${order.id}`,
      timestamp: '2026-05-23 09:22',
    },
    {
      id: `activity-campaign-join-${order.id}`,
      accountId,
      namespace,
      category: 'campaign',
      label: 'Campaign joined',
      detail: `2026-05-23 09:21 · ${campaign.name} joined through ${order.id}`,
      href: `/market-making/campaign/${campaign.id}`,
      timestamp: '2026-05-23 09:21',
    },
    ...entries,
  ]);
  clearOrderDraft();
  persistMarketMakingSession();
  return order;
};

export const statusLabel = (status: MockOrderStatus): string =>
  status.replace(/-/g, ' ');

restoreMarketMakingSession();
