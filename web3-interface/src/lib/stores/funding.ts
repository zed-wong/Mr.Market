import BigNumber from 'bignumber.js';
import { derived, get, writable } from 'svelte/store';
import {
  aggregateMockActivityEntries,
  mockFundingActivityForAccount,
  namespaceLabel,
  type MockActivityEntry,
  type MockBalance,
  type WalletNamespace,
} from '$lib/helpers/mock-web3';

export interface FundingTimelineStep {
  label: string;
  detail: string;
  state: 'complete' | 'current' | 'pending';
}

export interface MockFundingResult {
  id: string;
  accountId: string;
  type: 'deposit' | 'withdraw';
  namespace: WalletNamespace;
  asset: string;
  symbol: string;
  amount: string;
  status: 'credited' | 'reviewing';
  timestamp: string;
  timeline: FundingTimelineStep[];
}

export interface WithdrawValidationInput {
  namespace: WalletNamespace | null;
  balance: MockBalance | null | undefined;
  destination: string;
  amount: string;
}

export interface DepositValidationInput {
  balance: MockBalance | null | undefined;
  amount: string;
}

export interface WithdrawValidationResult {
  destination?: string;
  amount?: string;
}

export interface DepositValidationResult {
  amount?: string;
}

interface FundingDelta {
  accountId: string;
  asset: string;
  amount: string;
}

const fundingSequence = writable(0);
const creditedDeposits = writable<FundingDelta[]>([]);
const pendingWithdrawals = writable<FundingDelta[]>([]);
export const sessionFundingActivity = writable<MockActivityEntry[]>([]);

const deterministicTimestamps = [
  '2026-05-23 09:15',
  '2026-05-23 09:20',
  '2026-05-23 09:25',
  '2026-05-23 09:30',
];

const nativeSymbols = new Set(['ETH', 'SOL']);

const normalizeAmount = (value: string): string => new BigNumber(value || '0').toFixed();

const nextSequence = (): number => {
  const next = get(fundingSequence) + 1;
  fundingSequence.set(next);
  return next;
};

export const resetFundingSession = () => {
  fundingSequence.set(0);
  creditedDeposits.set([]);
  pendingWithdrawals.set([]);
  sessionFundingActivity.set([]);
};

export const fundingActivityForAccount = (
  accountId: string | null | undefined,
  namespace: WalletNamespace | null,
  sessionEntries: MockActivityEntry[]
): MockActivityEntry[] =>
  accountId && namespace
    ? aggregateMockActivityEntries(
        sessionEntries.filter((entry) => entry.accountId === accountId && entry.namespace === namespace),
        mockFundingActivityForAccount(accountId, namespace)
      )
    : [];

export const minimumDepositFor = (balance: MockBalance | null | undefined): string =>
  !balance ? '0' : nativeSymbols.has(balance.symbol) ? '0.01' : '25';

export const minimumWithdrawFor = (balance: MockBalance | null | undefined): string =>
  !balance ? '0' : nativeSymbols.has(balance.symbol) ? '0.01' : '10';

export const withdrawFeeFor = (balance: MockBalance | null | undefined): string =>
  !balance ? '0' : nativeSymbols.has(balance.symbol) ? '0.0025' : '1.50';

export const suggestedDepositAmountFor = (balance: MockBalance | null | undefined): string =>
  !balance ? '' : nativeSymbols.has(balance.symbol) ? '0.2500' : '250.00';

export const validateMockDeposit = ({
  balance,
  amount,
}: DepositValidationInput): DepositValidationResult => {
  const errors: DepositValidationResult = {};
  const trimmedAmount = amount.trim();

  if (!balance) {
    errors.amount = 'Select a supported asset before simulating a deposit.';
    return errors;
  }

  const parsedAmount = new BigNumber(trimmedAmount);
  if (!trimmedAmount || !parsedAmount.isFinite() || Number.isNaN(parsedAmount.toNumber())) {
    errors.amount = 'Enter a numeric deposit amount.';
  } else if (parsedAmount.lte(0)) {
    errors.amount = 'Deposit amount must be greater than zero.';
  } else if ((parsedAmount.decimalPlaces() ?? 0) > balance.decimals) {
    errors.amount = `${balance.symbol} supports up to ${balance.decimals} decimal places.`;
  } else if (parsedAmount.lt(minimumDepositFor(balance))) {
    errors.amount = `Minimum mocked deposit is ${minimumDepositFor(balance)} ${balance.symbol}.`;
  }

  return errors;
};

export const depositAddressFor = (balance: MockBalance | null | undefined): string => {
  if (!balance) return '';
  if (balance.chainNamespace === 'evm') {
    return balance.symbol === 'USDC'
      ? '0x2222222222222222222222222222222222222222'
      : '0x1111111111111111111111111111111111111111';
  }
  return balance.symbol === 'USDC'
    ? 'FundSoLUSDC11111111111111111111111111111111'
    : 'FundSoL1111111111111111111111111111111111111';
};

export const depositInstructionFor = (balance: MockBalance | null | undefined): string => {
  if (!balance) return 'Select a supported asset to show mocked deposit instructions.';
  if (balance.chainNamespace === 'evm') {
    return `Send ${balance.symbol} only on ${balance.chainId === 11155111 ? 'Sepolia' : 'Ethereum'}. Use this deterministic EVM vault address; no wallet signature, RPC call, or server funding endpoint is used.`;
  }
  return `Send ${balance.symbol} on Solana / SVM. Use this deterministic Solana-format vault address; the timeline and credit are local mocked UI state.`;
};

export const depositTimeline = (completed: boolean): FundingTimelineStep[] => [
  {
    label: 'Address generated',
    detail: 'The mocked vault address is available in the browser UI.',
    state: 'complete',
  },
  {
    label: 'Deposit detected',
    detail: completed ? 'A deterministic mocked inbound transfer was detected.' : 'Preview waits for the simulated inbound transfer.',
    state: completed ? 'complete' : 'current',
  },
  {
    label: 'Pending confirmations',
    detail: completed ? 'Mock confirmations reached the required threshold.' : 'The next mocked state will show pending confirmations.',
    state: completed ? 'complete' : 'pending',
  },
  {
    label: 'Credited',
    detail: completed ? 'Available balance and activity were updated locally.' : 'Balance credit appears after simulation.',
    state: completed ? 'complete' : 'pending',
  },
];

export const withdrawTimeline = (): FundingTimelineStep[] => [
  {
    label: 'Submitted',
    detail: 'Mock withdrawal request recorded in local UI state.',
    state: 'complete',
  },
  {
    label: 'Reviewing',
    detail: 'Deterministic compliance and liquidity review is in progress.',
    state: 'complete',
  },
  {
    label: 'Broadcast queued',
    detail: 'Future on-chain broadcast is represented without RPC or signatures.',
    state: 'current',
  },
  {
    label: 'Pending final state',
    detail: 'Pending amount is separated from available balance until final settlement.',
    state: 'pending',
  },
];

export const validateMockWithdrawal = ({
  namespace,
  balance,
  destination,
  amount,
}: WithdrawValidationInput): WithdrawValidationResult => {
  const errors: WithdrawValidationResult = {};
  const trimmedDestination = destination.trim();
  const trimmedAmount = amount.trim();

  if (!balance || !namespace) {
    errors.amount = 'Select a supported asset before preparing a withdrawal.';
    return errors;
  }

  if (!trimmedDestination) {
    errors.destination = 'Destination address is required.';
  } else if (namespace === 'evm') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(trimmedDestination)) {
      errors.destination = 'Enter a valid EVM address with 0x followed by 40 hexadecimal characters.';
    }
  } else if (trimmedDestination.startsWith('0x') || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmedDestination)) {
    errors.destination = 'Enter a valid Solana address using base58 characters, not an EVM 0x address.';
  }

  const parsedAmount = new BigNumber(trimmedAmount);
  if (!trimmedAmount || !parsedAmount.isFinite() || Number.isNaN(parsedAmount.toNumber())) {
    errors.amount = 'Enter a numeric withdrawal amount.';
  } else if (parsedAmount.lte(0)) {
    errors.amount = 'Withdrawal amount must be greater than zero.';
  } else if ((parsedAmount.decimalPlaces() ?? 0) > balance.decimals) {
    errors.amount = `${balance.symbol} supports up to ${balance.decimals} decimal places.`;
  } else if (parsedAmount.lt(minimumWithdrawFor(balance))) {
    errors.amount = `Minimum mocked withdrawal is ${minimumWithdrawFor(balance)} ${balance.symbol}.`;
  } else if (parsedAmount.gt(balance.amount)) {
    errors.amount = `Amount exceeds available balance of ${balance.amount} ${balance.symbol}.`;
  }

  return errors;
};

export const balanceFundingState = derived(
  [creditedDeposits, pendingWithdrawals],
  ([$creditedDeposits, $pendingWithdrawals]) => ({ creditedDeposits: $creditedDeposits, pendingWithdrawals: $pendingWithdrawals })
);

export const applyFundingDeltas = (accountId: string | null, balances: MockBalance[]): MockBalance[] => {
  if (!accountId) return balances;
  const { creditedDeposits: deposits, pendingWithdrawals: withdrawals } = get(balanceFundingState);

  return balances.map((balance) => {
    const deposited = deposits
      .filter((delta) => delta.accountId === accountId && delta.asset === balance.asset)
      .reduce((sum, delta) => sum.plus(delta.amount), new BigNumber(0));
    const pending = withdrawals
      .filter((delta) => delta.accountId === accountId && delta.asset === balance.asset)
      .reduce((sum, delta) => sum.plus(delta.amount), new BigNumber(0));
    const amount = new BigNumber(balance.amount).plus(deposited).minus(pending);
    const unitUsd = new BigNumber(balance.usdValue).div(balance.amount || '1');

    return {
      ...balance,
      amount: amount.toFixed(balance.decimals > 6 ? 4 : 2),
      usdValue: amount.times(unitUsd).toFixed(2),
      pendingAmount: pending.gt(0) ? pending.toFixed(balance.decimals > 6 ? 4 : 2) : undefined,
    };
  });
};

export const completeMockDeposit = (
  accountId: string,
  balance: MockBalance,
  amount: string
): MockFundingResult => {
  const requestedAmount = amount || suggestedDepositAmountFor(balance);
  const validationErrors = validateMockDeposit({ balance, amount: requestedAmount });
  if (validationErrors.amount) {
    throw new Error(validationErrors.amount);
  }
  const normalizedAmount = normalizeAmount(requestedAmount);
  const sequence = nextSequence();
  const timestamp = deterministicTimestamps[(sequence - 1) % deterministicTimestamps.length];
  const id = `DEP-${balance.chainNamespace.toUpperCase()}-${sequence.toString().padStart(4, '0')}`;

  creditedDeposits.update((items) => [...items, { accountId, asset: balance.asset, amount: normalizedAmount }]);
  sessionFundingActivity.update((entries) => [
    {
      id: `activity-${id}`,
      accountId,
      namespace: balance.chainNamespace,
      category: 'funding',
      label: 'Deposit',
      detail: `${balance.symbol} · ${namespaceLabel(balance.chainNamespace)} · ${balance.name} · credited · ${timestamp} · amount ${normalizedAmount}`,
      href: '/deposit',
      timestamp,
    },
    ...entries,
  ]);

  return {
    id,
    accountId,
    type: 'deposit',
    namespace: balance.chainNamespace,
    asset: balance.asset,
    symbol: balance.symbol,
    amount: normalizedAmount,
    status: 'credited',
    timestamp,
    timeline: depositTimeline(true),
  };
};

export const submitMockWithdrawal = (
  accountId: string,
  balance: MockBalance,
  amount: string,
  destination: string
): MockFundingResult => {
  const normalizedAmount = normalizeAmount(amount);
  const sequence = nextSequence();
  const timestamp = deterministicTimestamps[(sequence - 1) % deterministicTimestamps.length];
  const id = `WDR-${balance.chainNamespace.toUpperCase()}-${sequence.toString().padStart(4, '0')}`;

  pendingWithdrawals.update((items) => [...items, { accountId, asset: balance.asset, amount: normalizedAmount }]);
  sessionFundingActivity.update((entries) => [
    {
      id: `activity-${id}`,
      accountId,
      namespace: balance.chainNamespace,
      category: 'funding',
      label: 'Withdraw',
      detail: `${balance.symbol} · ${namespaceLabel(balance.chainNamespace)} · ${shortDestination(destination)} · reviewing · ${timestamp} · amount ${normalizedAmount}`,
      href: '/withdraw',
      timestamp,
    },
    ...entries,
  ]);

  return {
    id,
    accountId,
    type: 'withdraw',
    namespace: balance.chainNamespace,
    asset: balance.asset,
    symbol: balance.symbol,
    amount: normalizedAmount,
    status: 'reviewing',
    timestamp,
    timeline: withdrawTimeline(),
  };
};

const shortDestination = (destination: string): string =>
  destination.startsWith('0x')
    ? `${destination.slice(0, 6)}...${destination.slice(-4)}`
    : `${destination.slice(0, 4)}...${destination.slice(-4)}`;
